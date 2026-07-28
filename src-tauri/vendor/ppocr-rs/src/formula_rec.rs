//! Formula recognition via PP-FormulaNet_plus-L ONNX (PP-StructureV3 v2).
//!
//! Converte il crop di una formula matematica (identificata da
//! `LayoutAnalyzer` come `DisplayFormula` o `InlineFormula`) in una stringa
//! LaTeX.
//!
//! ## Architettura del modello
//!
//! PP-FormulaNet_plus-L è un modello **encoder-decoder**:
//! - **Encoder**: `Vary_VIT_B_Formula` (ViT 768-dim, patch 16×16)
//! - **Decoder**: `CustomMBartForCausalLM` (8 layer, 16 head, vocab 50 000)
//! - **Input**: immagine `[1, 3, 768, 768]`, ImageNet normalize
//! - **Output**: sequenza token IDs LaTeX (BOS=0, PAD=1, EOS=2)
//!
//! L'export ONNX può essere in due modalità:
//! - **Singolo forward** → output `[1, T, 50 000]` logit o `[1, T]` int64
//! - **Autoregresivo step-by-step** → input aggiuntivo `decoder_input_ids`
//!
//! [`FormulaRecognizer`] rileva automaticamente la modalità all'init.
//!
//! ## Tokenizer
//!
//! BPE da `tokenizer.json` (HuggingFace format). Scaricato insieme all'ONNX
//! da `ModelHub::ensure_single(PpStructureModel::FormulaRec)`.
//! Campo `model.vocab`: `{ token_string → id }` → invertito a `Vec<String>`.
//!
//! ## Uso
//!
//! ```no_run
//! use ppocr_rs::{ModelHub, PpStructureModel, FormulaRecognizer};
//! let hub   = ModelHub::with_default_cache().unwrap();
//! let paths = hub.ensure_single(PpStructureModel::FormulaRec).unwrap();
//! let rec   = FormulaRecognizer::from_paths(
//!     &paths.onnx,
//!     paths.tokenizer_json.as_deref(),
//! ).unwrap();
//! // image: crop della regione formula
//! // let result = rec.recognize(&image).unwrap();
//! // println!("{}", result.latex);
//! ```

use crate::ocr_error::OcrError;
use ndarray::{Array, Array4};
use ort::{
    inputs,
    session::{builder::GraphOptimizationLevel, Session},
    value::Tensor,
};
use std::path::Path;

/// Dimensione dell'input del modello (768×768, fissa dall'architettura ViT).
pub const FORMULA_INPUT_SIZE: u32 = 768;

/// Token ID speciali (MBart convention).
const BOS_ID: i64 = 0;
const PAD_ID: i64 = 1;
const EOS_ID: i64 = 2;

/// Lunghezza massima sequenza generata (config PP-FormulaNet_plus-L).
const MAX_NEW_TOKENS: usize = 2560;

// ─── Result ───────────────────────────────────────────────────────────────────

/// Risultato del riconoscimento formula.
#[derive(Debug, Clone)]
pub struct FormulaResult {
    /// Stringa LaTeX decodificata (senza `$` o `\[` delimitatori — solo il
    /// contenuto della formula).
    pub latex: String,
    /// Confidence media sul token sequence (score medio dei logit argmax).
    /// `0.0` se il modello emette token IDs direttamente (senza logit).
    pub score: f32,
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

struct Tokenizer {
    /// id → token string (indice diretto).
    id_to_token: Vec<String>,
}

impl Tokenizer {
    /// Carica da `tokenizer.json` (formato HuggingFace BPE).
    ///
    /// Struttura attesa: `{ "model": { "vocab": { token: id, ... } } }`.
    fn from_json(path: &Path) -> Result<Self, OcrError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| OcrError::ModelHubError(format!("tokenizer.json: {e}")))?;
        let json: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| OcrError::ModelHubError(format!("parse tokenizer.json: {e}")))?;

        // Supporta due path di vocab comuni nei tokenizer.json HuggingFace:
        // 1. model.vocab (BPE)
        // 2. vocab (SentencePiece / Unigram)
        let vocab = json.get("model")
            .and_then(|m| m.get("vocab"))
            .or_else(|| json.get("vocab"))
            .and_then(|v| v.as_object())
            .ok_or_else(|| OcrError::ModelHubError(
                "tokenizer.json: campo 'model.vocab' non trovato".into()
            ))?;

        // Dimensione vocab: usa max_id + 1 per evitare OOB su id non contigui
        let max_id = vocab.values()
            .filter_map(|v| v.as_i64())
            .max()
            .unwrap_or(0) as usize;

        let mut id_to_token = vec![String::new(); max_id + 1];
        for (token, id_val) in vocab {
            if let Some(id) = id_val.as_i64() {
                let id = id as usize;
                if id < id_to_token.len() {
                    id_to_token[id] = token.clone();
                }
            }
        }

        eprintln!("[FormulaRec] tokenizer caricato: {} token", id_to_token.len());
        Ok(Self { id_to_token })
    }

    /// Vocabolario embedded minimo (solo token speciali).
    /// Usato quando `tokenizer.json` non è disponibile — produce output
    /// con token IDs testuali invece di LaTeX.
    fn fallback() -> Self {
        let mut id_to_token = vec![String::new(); 50_000];
        id_to_token[BOS_ID as usize] = "<s>".to_string();
        id_to_token[PAD_ID as usize] = "<pad>".to_string();
        id_to_token[EOS_ID as usize] = "</s>".to_string();
        eprintln!(
            "[FormulaRec] WARN: tokenizer.json non disponibile — \
             output sarà token IDs testuale. Scarica il modello con \
             ModelHub::ensure_single(PpStructureModel::FormulaRec)."
        );
        Self { id_to_token }
    }

    fn decode(&self, ids: &[i64]) -> String {
        let mut out = String::new();
        let mut prev_needs_space = false;

        for &id in ids {
            if id == BOS_ID || id == PAD_ID { continue; }
            if id == EOS_ID { break; }

            let token = match self.id_to_token.get(id as usize) {
                Some(t) if !t.is_empty() => t.as_str(),
                _ => continue,
            };

            // SentencePiece/BPE: '▁' (U+2581) indica inizio parola → spazio
            if let Some(stripped) = token.strip_prefix('▁') {
                if prev_needs_space && !out.is_empty() {
                    out.push(' ');
                }
                out.push_str(stripped);
                prev_needs_space = true;
            } else if let Some(stripped) = token.strip_prefix('Ġ') {
                // GPT-2 style space marker
                if !out.is_empty() { out.push(' '); }
                out.push_str(stripped);
                prev_needs_space = false;
            } else {
                out.push_str(token);
                prev_needs_space = false;
            }
        }
        out.trim().to_string()
    }

    fn vocab_size(&self) -> usize { self.id_to_token.len() }
}

// ─── InferenceMode ────────────────────────────────────────────────────────────

/// Modalità di inference rilevata all'init.
#[derive(Debug, Clone, Copy)]
enum InferenceMode {
    /// Il modello produce l'intera sequenza in un unico forward pass.
    /// Output: logit `[1, T, V]` float32 o IDs `[1, T]` int64.
    SinglePass,
    /// Il modello richiede `decoder_input_ids` — genera un token alla volta.
    Autoregressive,
}

// ─── FormulaRecognizer ────────────────────────────────────────────────────────

/// Riconosce formule matematiche in immagini crop → stringa LaTeX.
pub struct FormulaRecognizer {
    session:   Session,
    tokenizer: Tokenizer,
    mode:      InferenceMode,
    /// Nome del tensore immagine input (rilevato dai metadati ONNX).
    img_input: String,
    /// Abilita il decoder autoregressive. **Default `false`**: quando
    /// disabilitato [`recognize`] restituisce `latex = ""` senza eseguire
    /// alcuna inferenza. Impostare a `true` solo quando si vuole produrre
    /// output LaTeX effettivo (il decoder è costoso: fino a 2560 step).
    pub decoder_enabled: bool,
}

impl FormulaRecognizer {
    /// Carica il modello ONNX e il tokenizer da path espliciti.
    ///
    /// `tokenizer_path`: path a `tokenizer.json`. Se `None` usa un tokenizer
    /// fallback che emette token IDs anziché LaTeX — scarica il modello
    /// completo via `ModelHub::ensure_single(PpStructureModel::FormulaRec)`.
    pub fn from_paths(
        model_path:     impl AsRef<Path>,
        tokenizer_path: Option<&Path>,
    ) -> Result<Self, OcrError> {
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .commit_from_file(model_path)?;

        let tokenizer = match tokenizer_path {
            Some(p) => Tokenizer::from_json(p)?,
            None    => Tokenizer::fallback(),
        };

        let mode = detect_inference_mode(&session);
        let img_input = find_image_input(&session);

        eprintln!(
            "[FormulaRec] modalità: {mode:?}, input immagine: '{img_input}', vocab: {}",
            tokenizer.vocab_size()
        );

        Ok(Self { session, tokenizer, mode, img_input, decoder_enabled: false })
    }

    /// Riconosce la formula nell'immagine crop → stringa LaTeX.
    ///
    /// Se `self.decoder_enabled == false` (default) restituisce
    /// `FormulaResult { latex: String::new(), score: 0.0 }` senza alcuna
    /// inferenza. Il decoder autoregressive può impiegare fino a 2560 step
    /// (≈1.5 s/GPU, ≈3 s/CPU per formula complessa).
    ///
    /// `image` deve essere il crop della regione formula (da `LayoutAnalyzer`
    /// con `LayoutClass::DisplayFormula` o `InlineFormula`).
    pub fn recognize(&self, image: &image::RgbImage) -> Result<FormulaResult, OcrError> {
        if !self.decoder_enabled {
            return Ok(FormulaResult { latex: String::new(), score: 0.0 });
        }

        let blob = preprocess(image);

        match self.mode {
            InferenceMode::SinglePass  => self.recognize_single_pass(blob),
            InferenceMode::Autoregressive => self.recognize_autoregressive(blob),
        }
    }

    // ── Single-pass ─────────────────────────────────────────────────────────

    fn recognize_single_pass(&self, blob: Array4<f32>) -> Result<FormulaResult, OcrError> {
        let outputs = self.session.run(
            inputs![self.img_input.clone() => Tensor::from_array(blob)?]?
        )?;

        let (_, first) = outputs.iter().next()
            .ok_or_else(|| OcrError::ModelOutput("FormulaNet: nessun output".into()))?;
        let (shape, data_f32) = crate::compat::tensor_extract_with_shape_f32(&first)?;

        eprintln!("[FormulaNet] single-pass output shape: {shape:?}");

        match shape.as_slice() {
            // Output: logit [1, T, V]
            [1, t_len, v_len] => {
                let t = *t_len as usize;
                let v = *v_len as usize;
                let mut ids: Vec<i64>  = Vec::with_capacity(t);
                let mut scores: Vec<f32> = Vec::with_capacity(t);
                for step in 0..t {
                    let base = step * v;
                    let (idx, score) = argmax_slice(&data_f32[base..base + v]);
                    let id = idx as i64;
                    if id == EOS_ID { break; }
                    if id == PAD_ID || id == BOS_ID { continue; }
                    ids.push(id);
                    scores.push(score);
                }
                let latex = self.tokenizer.decode(&ids);
                let score = mean_score(&scores);
                Ok(FormulaResult { latex, score })
            }

            // Output: IDs [1, T] già decodificati (generate baked-in)
            [1, _t] => {
                // Reinterpreta data_f32 come int via round
                let ids: Vec<i64> = data_f32.iter().map(|&f| f.round() as i64).collect();
                let latex = self.tokenizer.decode(&ids);
                Ok(FormulaResult { latex, score: 0.0 })
            }

            other => Err(OcrError::ModelOutput(format!(
                "FormulaNet single-pass: shape output non riconosciuta: {other:?}"
            ))),
        }
    }

    // ── Autoregressive ───────────────────────────────────────────────────────

    fn recognize_autoregressive(&self, blob: Array4<f32>) -> Result<FormulaResult, OcrError> {
        // Trova il nome del tensore decoder_input_ids
        let dec_input_name = self.session.inputs.iter()
            .find(|i| {
                let n = i.name.to_lowercase();
                n.contains("decoder") || n.contains("input_ids") || n.contains("tgt")
            })
            .map(|i| i.name.clone())
            .unwrap_or_else(|| "decoder_input_ids".to_string());

        let mut ids: Vec<i64>   = vec![BOS_ID];
        let mut scores: Vec<f32> = Vec::new();

        for _ in 0..MAX_NEW_TOKENS {
            // decoder_input_ids: [1, current_len] int64
            let dec_len = ids.len();
            let dec_arr: ndarray::Array2<i64> = ndarray::Array2::from_shape_vec(
                (1, dec_len),
                ids.clone(),
            ).map_err(|e| OcrError::ModelInput(format!("dec_arr shape: {e}")))?;

            let outputs = self.session.run(inputs![
                self.img_input.clone() => Tensor::from_array(blob.clone())?,
                dec_input_name.clone() => Tensor::from_array(dec_arr)?,
            ]?)?;

            let (_, last_out) = outputs.iter().next()
                .ok_or_else(|| OcrError::ModelOutput("FormulaNet auto: nessun output".into()))?;
            let (shape, data) = crate::compat::tensor_extract_with_shape_f32(&last_out)?;

            // Logit dell'ultimo token: shape [1, current_len, V] → slice dell'ultimo step
            let next_id = match shape.as_slice() {
                [1, _t, v] => {
                    let v = *v as usize;
                    let last_step_base = (dec_len - 1) * v;
                    let (idx, score) = argmax_slice(&data[last_step_base..last_step_base + v]);
                    scores.push(score);
                    idx as i64
                }
                [1, v] => {
                    let (idx, score) = argmax_slice(&data[..(*v as usize)]);
                    scores.push(score);
                    idx as i64
                }
                other => return Err(OcrError::ModelOutput(format!(
                    "FormulaNet auto step: shape {other:?}"
                ))),
            };

            if next_id == EOS_ID || next_id == PAD_ID { break; }
            ids.push(next_id);
        }

        // Rimuovi BOS dalla decodifica
        let decode_ids: Vec<i64> = ids.into_iter().skip(1).collect();
        let latex = self.tokenizer.decode(&decode_ids);
        let score = mean_score(&scores);
        Ok(FormulaResult { latex, score })
    }
}

// ─── Preprocessing ────────────────────────────────────────────────────────────

fn preprocess(image: &image::RgbImage) -> Array4<f32> {
    let s = FORMULA_INPUT_SIZE;
    let resized = image::imageops::resize(image, s, s, image::imageops::FilterType::Triangle);
    let mean = [0.485f32, 0.456, 0.406];
    let std  = [0.229f32, 0.224, 0.225];
    let mut blob: Array4<f32> = Array::zeros((1, 3, s as usize, s as usize));
    for y in 0..s as usize {
        for x in 0..s as usize {
            let p = resized.get_pixel(x as u32, y as u32);
            for c in 0..3usize {
                blob[[0, c, y, x]] = (p[c] as f32 / 255.0 - mean[c]) / std[c];
            }
        }
    }
    blob
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn detect_inference_mode(session: &Session) -> InferenceMode {
    let has_dec_input = session.inputs.iter().any(|i| {
        let n = i.name.to_lowercase();
        n.contains("decoder") || n.contains("input_ids") || n.contains("tgt")
    });
    if has_dec_input {
        InferenceMode::Autoregressive
    } else {
        InferenceMode::SinglePass
    }
}

fn find_image_input(session: &Session) -> String {
    session.inputs.iter()
        .find(|i| {
            let n = i.name.to_lowercase();
            n == "x" || n == "image" || n == "img" || n.contains("pixel")
        })
        .or_else(|| session.inputs.first())
        .map(|i| i.name.clone())
        .unwrap_or_else(|| "x".to_string())
}

fn argmax_slice(s: &[f32]) -> (usize, f32) {
    s.iter().copied().enumerate()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .unwrap_or((0, 0.0))
}

fn mean_score(v: &[f32]) -> f32 {
    if v.is_empty() { 0.0 } else { v.iter().sum::<f32>() / v.len() as f32 }
}
