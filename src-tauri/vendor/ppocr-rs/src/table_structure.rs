//! SLANeXt table structure recognition (PP-StructureV3 v2).
//!
//! Converte un'immagine di tabella in skeleton HTML + bbox delle celle.
//!
//! ## Modelli
//!
//! | Variante   | HF repo                            | Acc     | Uso                  |
//! |------------|------------------------------------|---------|----------------------|
//! | Wired      | `PaddlePaddle/SLANeXt_wired_onnx`  | 69.65%  | Tabelle con bordi    |
//! | Wireless   | `PaddlePaddle/SLANeXt_wireless_onnx`|        | Tabelle senza bordi  |
//!
//! ## Pipeline
//!
//! 1. Resize proporzionale con `max_len=512` + pad a `512×512`.
//! 2. Normalizzazione ImageNet (mean=[0.485,.456,.406], std=[0.229,.224,.225]).
//! 3. Inference → `structure_probs [1, T, V]` + `loc_preds [1, T, 4]`.
//! 4. Decode: argmax su V → token HTML; le celle `<td`-like hanno bbox in `loc_preds`.
//! 5. Denormalizzazione bbox: coords relative a `512×512` corrette per resize ratio.
//!
//! ## Formato output
//!
//! - `html_tokens`: stringa di token HTML concatenati (senza testo cella).
//!   Es. `"<tbody><tr><td></td><td></td></tr></tbody>"`.
//! - `cell_boxes`: lista di [`TableCellBox`] (una per ogni token `<td*>`) in
//!   coordinate dell'immagine originale.
//!
//! ## Vocabolario
//!
//! SLANeXt usa un dizionario di ~30-150 token HTML. Se disponibile, viene
//! caricato dall'`inference.yml` del modello (come fa `ModelHub` per i modelli
//! rec PP-OCRv6). Fallback: dizionario inglese embedded (29 token).

use crate::ocr_error::OcrError;
use ndarray::{Array, Array4};
use ort::{
    inputs,
    session::{builder::GraphOptimizationLevel, Session},
    value::Tensor,
};
use std::path::Path;

/// Dimensione fissa dell'input SLANeXt (512×512 px).
pub const SLANEXT_INPUT_SIZE: u32 = 512;

/// Token HTML del dizionario inglese standard di SLANeXt.
///
/// Fonte: `PaddleOCR/ppocr/utils/dict/table_structure_dict.txt`.
/// Indice 0 è riservato a `<pad>` (token silenzioso), poi i 29 token seguenti,
/// infine `<eos>` all'ultimo posto.
const EN_DICT_TOKENS: &[&str] = &[
    "<thead>",
    "<tr>",
    "<td>",
    "</td>",
    "</tr>",
    "</thead>",
    "<tbody>",
    "</tbody>",
    "<td",
    r#" colspan="5""#,
    r#" colspan="2""#,
    r#" colspan="3""#,
    r#" rowspan="2""#,
    r#" colspan="4""#,
    r#" colspan="6""#,
    r#" rowspan="3""#,
    r#" colspan="9""#,
    r#" colspan="10""#,
    r#" colspan="7""#,
    r#" rowspan="4""#,
    r#" rowspan="5""#,
    r#" rowspan="9""#,
    r#" colspan="8""#,
    r#" rowspan="8""#,
    r#" rowspan="6""#,
    r#" rowspan="7""#,
    r#" rowspan="10""#,
    ">",
    "<td></td>",
];

// ─── Output types ─────────────────────────────────────────────────────────────

/// Bbox di una cella tabella (coordinate immagine originale, pixel float).
#[derive(Debug, Clone)]
pub struct TableCellBox {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
}

impl TableCellBox {
    pub fn width(&self)  -> f32 { (self.x2 - self.x1).max(0.0) }
    pub fn height(&self) -> f32 { (self.y2 - self.y1).max(0.0) }
    pub fn cx(&self) -> f32 { (self.x1 + self.x2) * 0.5 }
    pub fn cy(&self) -> f32 { (self.y1 + self.y2) * 0.5 }
}

/// Risultato del riconoscimento struttura tabella.
#[derive(Debug, Clone)]
pub struct TableStructure {
    /// Sequenza di token HTML (struttura senza contenuto celle).
    /// Inserisci il testo OCR delle celle per ottenere la tabella completa.
    pub html_tokens: String,
    /// Confidence media sul token sequence.
    pub score: f32,
    /// Bbox per ogni token `<td*>`, in coordinate immagine originale.
    /// Allineato 1:1 con le celle presenti in `html_tokens`.
    pub cell_boxes: Vec<TableCellBox>,
}

// ─── Recognizer ───────────────────────────────────────────────────────────────

pub struct TableStructureRecognizer {
    session:    Session,
    /// Vocabolario HTML: indice → token string.
    /// Posizione 0 = `<pad>` (silenzioso). Ultima posizione = `<eos>`.
    token_dict: Vec<String>,
    /// Indice del token di fine sequenza (`</tbody>` o `<eos>`).
    end_idx:    usize,
    /// Dimensione canvas quadrato dell'input (default=512 per SLANeXt, 488 per SLANet_plus).
    input_size: u32,
}

impl TableStructureRecognizer {
    /// Carica il modello con il dizionario embedded inglese e input 512×512 (SLANeXt).
    pub fn from_path(model_path: impl AsRef<Path>) -> Result<Self, OcrError> {
        Self::from_path_with_dict(model_path, None)
    }

    /// Carica il modello con dizionario opzionale da file (una riga per token).
    ///
    /// Se `dict_path` è `None`, usa il dizionario inglese embedded (29 token).
    /// Input size default = `SLANEXT_INPUT_SIZE` (512). Per SLANet/SLANet_plus usare
    /// [`with_input_size`](Self::with_input_size) dopo la costruzione per impostare 488.
    pub fn from_path_with_dict(
        model_path: impl AsRef<Path>,
        dict_path:  Option<&Path>,
    ) -> Result<Self, OcrError> {
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .commit_from_file(model_path)?;

        let token_dict = build_token_dict(dict_path)?;
        let end_idx = find_end_idx(&token_dict);

        Ok(Self { session, token_dict, end_idx, input_size: SLANEXT_INPUT_SIZE })
    }

    /// Sovrascrive la dimensione input canvas (default=512). Usare 488 per SLANet_plus.
    pub fn with_input_size(mut self, size: u32) -> Self {
        self.input_size = size;
        self
    }

    /// Riconosce la struttura di una tabella nel crop immagine.
    ///
    /// `image` deve essere il crop della regione tabella (da `LayoutAnalyzer`
    /// o crop manuale). Per tabelle wired usa `SLANeXt_wired_onnx`;
    /// per wireless usa `SLANeXt_wireless_onnx`.
    pub fn recognize(
        &self,
        image: &image::RgbImage,
    ) -> Result<TableStructure, OcrError> {
        let orig_w = image.width() as f32;
        let orig_h = image.height() as f32;

        // ── Preprocess ─────────────────────────────────────────────────────
        let (blob, ratio_w, ratio_h) = preprocess_slanext(image, self.input_size);

        // ── Inference ──────────────────────────────────────────────────────
        let input_name = self.session.inputs[0].name.clone();
        let outputs = self.session.run(
            inputs![input_name => Tensor::from_array(blob)?]?
        )?;

        // ── Match output → structure_probs (sp) e loc_preds (lp) ──────────────
        // Priorità:
        // 1. Nome: "structure"/"prob" → sp; "loc"/"bbox"/"pred" → lp
        // 2. Shape: last_dim == vocab_size → sp  (SLANet_plus: "fetch_name_1" [T,V])
        // 3. Posizionale: primo unassigned → sp, secondo → lp
        let vocab = self.token_dict.len() as i64;

        // Raccoglie tutti gli output con shape+dati
        let mut all_out: Vec<(String, Vec<i64>, Vec<f32>)> = Vec::new();
        for (name, val) in &outputs {
            let (sh, d) = crate::compat::tensor_extract_with_shape_f32(&val)?;
            all_out.push((name.to_lowercase(), sh, d));
        }

        let mut sp_idx: Option<usize> = None;
        let mut lp_idx: Option<usize> = None;

        // Pass 1: nome
        for (i, (n, _, _)) in all_out.iter().enumerate() {
            if sp_idx.is_none() && (n.contains("structure") || n.contains("prob")) {
                sp_idx = Some(i);
            } else if lp_idx.is_none() && (n.contains("loc") || n.contains("bbox") || n.contains("pred")) {
                lp_idx = Some(i);
            }
        }
        // Pass 2: shape (last_dim == vocab_size → sp)
        if sp_idx.is_none() || lp_idx.is_none() {
            for (i, (_, sh, _)) in all_out.iter().enumerate() {
                if Some(i) == sp_idx || Some(i) == lp_idx { continue; }
                let last = sh.last().copied().unwrap_or(0);
                if sp_idx.is_none() && last == vocab {
                    sp_idx = Some(i);
                } else if lp_idx.is_none() {
                    lp_idx = Some(i);
                }
            }
        }
        // Pass 3: posizionale (rimpianti)
        if sp_idx.is_none() {
            sp_idx = all_out.iter().enumerate()
                .find(|(i, _)| Some(*i) != lp_idx)
                .map(|(i, _)| i);
        }
        if lp_idx.is_none() {
            lp_idx = all_out.iter().enumerate()
                .find(|(i, _)| Some(*i) != sp_idx)
                .map(|(i, _)| i);
        }

        let mut sp_shape: Vec<i64> = Vec::new();
        let mut sp_data:  Vec<f32> = Vec::new();
        let mut lp_shape: Vec<i64> = Vec::new();
        let mut lp_data:  Vec<f32> = Vec::new();

        if let Some(i) = sp_idx {
            sp_shape = all_out[i].1.clone();
            sp_data  = all_out[i].2.clone();
        }
        if let Some(i) = lp_idx {
            lp_shape = all_out[i].1.clone();
            lp_data  = all_out[i].2.clone();
        }

        if sp_shape.len() < 3 {
            return Err(OcrError::ModelOutput(format!(
                "SLANeXt: structure_probs shape atteso [1,T,V], trovato {sp_shape:?}"
            )));
        }

        let t_len  = sp_shape[1] as usize;
        let v_len  = sp_shape[2] as usize;
        let lp_cols = lp_shape.get(2).copied().unwrap_or(4) as usize;
        // ── Decode ─────────────────────────────────────────────────────────
        // Token che aprono una cella → hanno bbox associata in loc_preds
        // Token che marcano un'apertura di cella: include i tag <td standard +
        // i token attributo colspan/rowspan usati da SLANet_plus come marcatori
        // di cella (le coord bbox in loc_preds sono allineate a questi step).
        let structural = |t: &str| matches!(t,
            "<thead>" | "</thead>" | "<tbody>" | "</tbody>" | "<tr>" | "</tr>" | "</td>" | ">"
        );
        let td_opener = |t: &str| !structural(t) && !t.is_empty() && t != "<eos>";

        let mut html = String::with_capacity(256);
        let mut cell_boxes: Vec<TableCellBox> = Vec::new();
        let mut scores:     Vec<f32>          = Vec::new();

        for step in 0..t_len {
            // argmax su vocabolario V
            let base = step * v_len;
            let (char_idx, prob) = argmax_slice(&sp_data[base..base + v_len.min(sp_data.len().saturating_sub(base))]);

            if step > 0 && char_idx == self.end_idx { break; }
            if char_idx == 0 { continue; } // <pad>

            let token = self.token_dict.get(char_idx)
                .map(|s| s.as_str())
                .unwrap_or("");
            if token.is_empty() || token == "<eos>" { break; }

            html.push_str(token);
            scores.push(prob);

            if td_opener(token) && lp_cols >= 4 {
                let lp_base = step * lp_cols;
                let needed = if lp_cols >= 6 { lp_base + 5 } else { lp_base + 3 };
                if needed < lp_data.len() {
                    let pad_sz = self.input_size as f32;
                    // Formato 4 colonne: [x1,y1,x2,y2].
                    // Formato 8 colonne (quad): [x_tl,y_tl,x_tr,y_tr,x_br,y_br,x_bl,y_bl].
                    // Per ottenere il bbox axis-aligned dal quad: x1=col0, y1=col1, x2=col4, y2=col5.
                    let (xi2, yi2) = if lp_cols >= 6 { (lp_base + 4, lp_base + 5) }
                                     else             { (lp_base + 2, lp_base + 3) };
                    let x1 = decode_coord(lp_data[lp_base],     pad_sz, ratio_w, orig_w);
                    let y1 = decode_coord(lp_data[lp_base + 1], pad_sz, ratio_h, orig_h);
                    let x2 = decode_coord(lp_data[xi2],         pad_sz, ratio_w, orig_w);
                    let y2 = decode_coord(lp_data[yi2],         pad_sz, ratio_h, orig_h);
                    if x2 > x1 && y2 > y1 {
                        cell_boxes.push(TableCellBox { x1, y1, x2, y2 });
                    }
                }
            }
        }

        let score = if scores.is_empty() { 0.0 } else {
            scores.iter().sum::<f32>() / scores.len() as f32
        };

        Ok(TableStructure { html_tokens: html, score, cell_boxes })
    }

    /// Numero di token nel dizionario caricato (inclusi pad/eos).
    pub fn vocab_size(&self) -> usize { self.token_dict.len() }
}

// ─── Token dict helpers ───────────────────────────────────────────────────────

fn build_token_dict(dict_path: Option<&Path>) -> Result<Vec<String>, OcrError> {
    if let Some(p) = dict_path {
        let content = std::fs::read_to_string(p)?;
        // index 0 = <pad>, poi le righe del file, infine <eos>
        let mut dict = vec!["<pad>".to_string()];
        for line in content.lines() {
            let t = line.trim_end_matches('\r').to_string();
            if !t.is_empty() {
                dict.push(t);
            }
        }
        // Aggiungi <eos> se non già presente
        if !dict.iter().any(|t| t == "<eos>") {
            dict.push("<eos>".to_string());
        }
        Ok(dict)
    } else {
        // Dizionario inglese embedded
        let mut dict = vec!["<pad>".to_string()];
        dict.extend(EN_DICT_TOKENS.iter().map(|s| s.to_string()));
        dict.push("<eos>".to_string());
        Ok(dict)
    }
}

fn find_end_idx(dict: &[String]) -> usize {
    // EOS preferito: </tbody> — segnala fine del contenuto tabella
    dict.iter().position(|t| t == "</tbody>")
        .or_else(|| dict.iter().position(|t| t == "<eos>"))
        .unwrap_or(dict.len().saturating_sub(1))
}

// ─── Preprocessing ────────────────────────────────────────────────────────────

/// `ResizeTableImage(max_len=512)` + `PaddingTableImage(512×512)` + ImageNet normalize.
///
/// Ritorna `(blob, ratio_w, ratio_h)` dove i ratio servono per
/// denormalizzare le bbox di `loc_preds`.
fn preprocess_slanext(
    image: &image::RgbImage,
    target: u32,
) -> (Array4<f32>, f32, f32) {
    let (orig_w, orig_h) = (image.width(), image.height());
    // Scale il lato maggiore a `target` mantenendo aspect ratio
    let scale = (target as f32 / orig_w as f32).min(target as f32 / orig_h as f32);
    let new_w = ((orig_w as f32 * scale).round() as u32).max(1);
    let new_h = ((orig_h as f32 * scale).round() as u32).max(1);
    let ratio_w = new_w as f32 / orig_w as f32;
    let ratio_h = new_h as f32 / orig_h as f32;

    let resized = image::imageops::resize(image, new_w, new_h, image::imageops::FilterType::Triangle);
    let mean = [0.485f32, 0.456, 0.406];
    let std  = [0.229f32, 0.224, 0.225];
    let t = target as usize;
    // Canvas vuoto (pad = valore zero normalizzato ≈ media di background)
    let mut blob: Array4<f32> = Array::zeros((1, 3, t, t));
    for y in 0..new_h as usize {
        for x in 0..new_w as usize {
            let p = resized.get_pixel(x as u32, y as u32);
            for c in 0..3usize {
                blob[[0, c, y, x]] = (p[c] as f32 / 255.0 - mean[c]) / std[c];
            }
        }
    }
    (blob, ratio_w, ratio_h)
}

/// Denormalizza una coordinata da `loc_preds` (relativa al canvas 512×512)
/// alle coordinate originali dell'immagine.
///
/// Formula (da `_bbox_decode` in PaddleOCR):
///   `coord_orig = coord_norm * pad_size / ratio`
#[inline]
fn decode_coord(norm: f32, pad_size: f32, ratio: f32, orig_max: f32) -> f32 {
    (norm * pad_size / ratio).clamp(0.0, orig_max)
}

// ─── Utility ──────────────────────────────────────────────────────────────────

fn argmax_slice(s: &[f32]) -> (usize, f32) {
    s.iter().copied().enumerate()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .unwrap_or((0, 0.0))
}
