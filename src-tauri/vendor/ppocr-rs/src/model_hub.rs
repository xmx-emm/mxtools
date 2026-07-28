//! Download e cache locale dei modelli ONNX PP-OCRv6 da HuggingFace.
//!
//! I modelli vengono scaricati una sola volta e salvati in una directory di
//! cache persistente. Il dizionario dei caratteri (`dict.txt`) viene estratto
//! dall'`inference.yml` del modello rec — contiene il **vocabolario effettivo
//! del modello**, che differisce per tier:
//!
//! - tiny / small: ~6 904 caratteri (CH + Latin esteso)
//! - medium: ~18 000+ caratteri (multilingual completo)
//!
//! Il `ppocrv6_dict.txt` del repo GitHub (18 708 righe) è il dizionario di
//! training, non quello di inference — usarlo con il modello tiny produrrebbe
//! output garbage (mismatch dimensione output layer).
//!
//! ## Normalizzazione confermata
//!
//! `resize_norm_img` in PaddleOCR 3.7 (`ppocr/data/imaug/rec_img_aug.py`):
//! ```python
//! resized_image = resized_image / 255
//! resized_image -= 0.5
//! resized_image /= 0.5   # ≡ mean=127.5, std=127.5
//! ```
//! Il codice attuale (`crnn_net.rs`: `MEAN=[127.5,127.5,127.5]`,
//! `NORM=[1/127.5,...]`) è **compatibile con PP-OCRv6 senza modifiche**.
//!
//! ## Feature `fetch-models`
//!
//! Il download HTTP richiede `--features fetch-models`. Senza la feature,
//! `ensure()` ritorna `OcrError::ModelHubError` se il file non è già in cache.

use std::io::Write;
use std::path::{Path, PathBuf};

use crate::ocr_error::OcrError;

const HF_BASE: &str = "https://huggingface.co/PaddlePaddle";

// ─── Modelli PP-StructureV3 opzionali ─────────────────────────────────────────

/// Modelli PP-StructureV3 / PP-DocLayoutV3 scaricabili singolarmente.
///
/// Usa [`ModelHub::ensure_single`] per ottenere il path ONNX locale.
///
/// | Variante               | Dimensione | Funzione                                        |
/// |------------------------|------------|-------------------------------------------------|
/// | `TableCls`             | ~7 MB      | Classifica tabella: wired vs wireless           |
/// | `TableStructureWired`  | ~351 MB    | SLANeXt struttura tabelle con bordi             |
/// | `TableStructureWireless`| ~300 MB   | SLANeXt struttura tabelle senza bordi           |
/// | `CellDetWireless`      | ~120 MB    | RT-DETR-L cell det su tabelle wireless          |
/// | `DocOrientation`       | ~7 MB      | Orientamento documento (0/90/180/270°)          |
/// | `DocUnwarp`            | ~150 MB    | Raddrizzamento prospettico UVDoc                |
/// | `FormulaRec`           | ~800 MB    | PP-FormulaNet-plus-L (LaTeX output)             |
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PpStructureModel {
    /// Classificatore wired vs wireless — `PP-LCNet_x1_0_table_cls_onnx`.
    TableCls,
    /// SLANeXt structure recognition (tabelle con bordi) — `SLANeXt_wired_onnx`.
    TableStructureWired,
    /// SLANeXt structure recognition (tabelle senza bordi) — `SLANeXt_wireless_onnx`.
    TableStructureWireless,
    /// RT-DETR-L cell detector (variante wireless) — `RT-DETR-L_wireless_table_cell_det_onnx`.
    CellDetWireless,
    /// Classificatore orientamento documento — `PP-LCNet_x1_0_doc_ori_onnx`.
    DocOrientation,
    /// Document unwarping UVDoc — `UVDoc_onnx`.
    DocUnwarp,
    /// Riconoscimento formule LaTeX — `PP-FormulaNet_plus-L_onnx`.
    FormulaRec,
}

impl PpStructureModel {
    fn hf_repo(self) -> &'static str {
        match self {
            Self::TableCls              => "PP-LCNet_x1_0_table_cls_onnx",
            Self::TableStructureWired   => "SLANeXt_wired_onnx",
            Self::TableStructureWireless => "SLANeXt_wireless_onnx",
            Self::CellDetWireless       => "RT-DETR-L_wireless_table_cell_det_onnx",
            Self::DocOrientation        => "PP-LCNet_x1_0_doc_ori_onnx",
            Self::DocUnwarp             => "UVDoc_onnx",
            Self::FormulaRec            => "PP-FormulaNet_plus-L_onnx",
        }
    }

    fn dir_name(self) -> &'static str {
        match self {
            Self::TableCls              => "table_cls",
            Self::TableStructureWired   => "slanext_wired",
            Self::TableStructureWireless => "slanext_wireless",
            Self::CellDetWireless       => "cell_det_wireless",
            Self::DocOrientation        => "doc_orientation",
            Self::DocUnwarp             => "doc_unwarp",
            Self::FormulaRec            => "formula_rec",
        }
    }

    /// Ritorna `true` se questo modello ha anche un file `inference.yml`
    /// che contiene il vocabolario (come i modelli SLANeXt).
    fn has_yml(self) -> bool {
        matches!(self, Self::TableStructureWired | Self::TableStructureWireless)
    }

    /// Ritorna `true` se questo modello ha un `tokenizer.json` HuggingFace.
    fn has_tokenizer(self) -> bool {
        matches!(self, Self::FormulaRec)
    }
}

/// Path ai file di un modello PP-StructureV3 scaricato via [`ModelHub::ensure_single`].
#[derive(Debug, Clone)]
pub struct StructureModelPaths {
    /// Path al file ONNX del modello.
    pub onnx: PathBuf,
    /// Path al dizionario token (solo per SLANeXt; `None` per gli altri modelli).
    pub dict_txt: Option<PathBuf>,
    /// `inference.yml` grezzo del modello (solo se `has_yml()` = true).
    pub yml: Option<PathBuf>,
    /// `tokenizer.json` HuggingFace BPE (solo per `FormulaRec`).
    pub tokenizer_json: Option<PathBuf>,
}

// ─── Versioni supportate ──────────────────────────────────────────────────────

/// Versione del modello PP-OCRv6 da scaricare.
///
/// | Variante  | det.onnx | rec.onnx | Vocab  | Totale |
/// |-----------|----------|----------|--------|--------|
/// | `V6Tiny`  | 1.8 MB   | 4.5 MB   | ~6 904 | ~6 MB  |
/// | `V6Small` | ~6 MB    | ~20 MB   | ~6 904 | ~26 MB |
/// | `V6Medium`| 62 MB    | 77 MB    | ~18k+  | ~139 MB|
///
/// Per il primo test su ARM64 Snapdragon X Elite si consiglia `V6Tiny`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PpOcrVersion {
    V6Tiny,
    V6Small,
    V6Medium,
}

impl PpOcrVersion {
    fn det_repo(self) -> &'static str {
        match self {
            Self::V6Tiny   => "PP-OCRv6_tiny_det_onnx",
            Self::V6Small  => "PP-OCRv6_small_det_onnx",
            Self::V6Medium => "PP-OCRv6_medium_det_onnx",
        }
    }

    fn rec_repo(self) -> &'static str {
        match self {
            Self::V6Tiny   => "PP-OCRv6_tiny_rec_onnx",
            Self::V6Small  => "PP-OCRv6_small_rec_onnx",
            Self::V6Medium => "PP-OCRv6_medium_rec_onnx",
        }
    }

    fn dir_name(self) -> &'static str {
        match self {
            Self::V6Tiny   => "pp_ocrv6_tiny",
            Self::V6Small  => "pp_ocrv6_small",
            Self::V6Medium => "pp_ocrv6_medium",
        }
    }
}

// ─── Risultato del download ───────────────────────────────────────────────────

/// Percorsi ai file locali (post-`ensure`). Pronti per essere passati a
/// [`OcrLite::init_models_with_dict`].
///
/// `dict_txt` contiene il vocabolario **effettivo** del modello, estratto da
/// `rec_inference.yml` — una voce per riga, senza blank né space (aggiunti
/// automaticamente da `CrnnNet::read_keys_from_file`).
#[derive(Debug, Clone)]
pub struct ModelPaths {
    pub det_onnx: PathBuf,
    pub rec_onnx: PathBuf,
    /// Dizionario estratto dall'`inference.yml` del modello rec.
    /// Usa questo con `init_models_with_dict`, NON il `ppocrv6_dict.txt`
    /// generico (che è il dict di training, non quello del modello).
    pub dict_txt: PathBuf,
    /// `inference.yml` grezzo del modello rec — per ispezione e debug.
    pub rec_yml:  PathBuf,
}

// ─── ModelHub ─────────────────────────────────────────────────────────────────

/// Hub per il download e la cache locale dei modelli ONNX.
///
/// Tutti i file finiscono in `<cache_dir>/<version>/`:
/// - `det.onnx`            — detection model
/// - `rec.onnx`            — recognition model
/// - `rec_inference.yml`   — config rec (contiene character_dict inline)
/// - `dict.txt`            — caratteri estratti dal YML (una riga per char)
pub struct ModelHub {
    cache_dir: PathBuf,
}

impl ModelHub {
    /// Crea un hub con la directory di cache specificata.
    pub fn new(cache_dir: impl Into<PathBuf>) -> Self {
        Self { cache_dir: cache_dir.into() }
    }

    /// Crea un hub con la directory di cache di default del sistema:
    /// - Windows: `%LOCALAPPDATA%\ppocr-rs\models\`
    /// - macOS/Linux: `$HOME/.cache/ppocr-rs/models/`
    pub fn with_default_cache() -> Result<Self, OcrError> {
        let base = Self::default_cache_dir()?;
        Ok(Self::new(base.join("models")))
    }

    /// Assicura che i modelli per la versione richiesta siano presenti.
    /// Scarica da HuggingFace se mancanti (richiede feature `fetch-models`).
    ///
    /// Il download è **bloccante** — esegui su un thread secondario in GUI
    /// o in runtime async.
    pub fn ensure(&self, version: PpOcrVersion) -> Result<ModelPaths, OcrError> {
        let dir = self.cache_dir.join(version.dir_name());
        std::fs::create_dir_all(&dir)?;

        let det_path  = dir.join("det.onnx");
        let rec_path  = dir.join("rec.onnx");
        let rec_yml   = dir.join("rec_inference.yml");
        let dict_path = dir.join("dict.txt");

        let det_url     = format!("{}/{}/resolve/main/inference.onnx", HF_BASE, version.det_repo());
        let rec_url     = format!("{}/{}/resolve/main/inference.onnx", HF_BASE, version.rec_repo());
        let rec_yml_url = format!("{}/{}/resolve/main/inference.yml",  HF_BASE, version.rec_repo());

        if !is_cached(&det_path) {
            eprintln!("[ppocr-rs] download det  → {}", det_path.display());
            fetch_file(&det_url, &det_path)?;
        }
        if !is_cached(&rec_path) {
            eprintln!("[ppocr-rs] download rec  → {}", rec_path.display());
            fetch_file(&rec_url, &rec_path)?;
        }
        if !is_cached(&rec_yml) {
            eprintln!("[ppocr-rs] download rec yml → {}", rec_yml.display());
            fetch_file(&rec_yml_url, &rec_yml)?;
        }
        // Il dict viene estratto dal YML — non scaricato da GitHub.
        // In questo modo il vocabolario corrisponde esattamente all'output
        // layer del modello ONNX, indipendentemente dal tier (tiny/medium/…).
        if !is_cached(&dict_path) {
            eprintln!("[ppocr-rs] estrai dict da yml → {}", dict_path.display());
            extract_dict_from_yml(&rec_yml, &dict_path)?;
        }

        Ok(ModelPaths { det_onnx: det_path, rec_onnx: rec_path, dict_txt: dict_path, rec_yml })
    }

    /// Ritorna la directory di cache usata da questo hub.
    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    /// Scarica (o riusa dalla cache) un singolo modello PP-StructureV3.
    ///
    /// Tutti i file finiscono in `<cache_dir>/<model.dir_name()>/`:
    /// - `inference.onnx` — sempre presente
    /// - `inference.yml`  — solo se il modello ha vocabolario inline
    /// - `dict.txt`       — estratto dall'yml (per SLANeXt)
    ///
    /// ## Esempio
    ///
    /// ```no_run
    /// use ppocr_rs::{ModelHub, PpStructureModel};
    /// let hub = ModelHub::with_default_cache().unwrap();
    /// let paths = hub.ensure_single(PpStructureModel::TableCls).unwrap();
    /// // usa paths.onnx con TableTypeClassifier::from_path(paths.onnx)
    /// ```
    pub fn ensure_single(&self, model: PpStructureModel) -> Result<StructureModelPaths, OcrError> {
        let dir = self.cache_dir.join(model.dir_name());
        std::fs::create_dir_all(&dir)?;

        let onnx_path = dir.join("inference.onnx");
        let onnx_url  = format!("{}/{}/resolve/main/inference.onnx", HF_BASE, model.hf_repo());

        if !is_cached(&onnx_path) {
            eprintln!("[ppocr-rs] download {} → {}", model.hf_repo(), onnx_path.display());
            fetch_file(&onnx_url, &onnx_path)?;
        }

        let (yml_out, dict_out) = if model.has_yml() {
            let yml_path  = dir.join("inference.yml");
            let dict_path = dir.join("dict.txt");
            let yml_url   = format!("{}/{}/resolve/main/inference.yml", HF_BASE, model.hf_repo());

            if !is_cached(&yml_path) {
                eprintln!("[ppocr-rs] download yml → {}", yml_path.display());
                // Non fatale: alcuni modelli HuggingFace non hanno yml
                let _ = fetch_file(&yml_url, &yml_path);
            }
            // Estrai dict solo se lo yml esiste ed è leggibile
            if is_cached(&yml_path) && !is_cached(&dict_path) {
                eprintln!("[ppocr-rs] estrai dict SLANeXt → {}", dict_path.display());
                if let Err(e) = extract_dict_from_yml(&yml_path, &dict_path) {
                    eprintln!("[ppocr-rs] warn: dict extraction fallita: {e}");
                }
            }
            (
                Some(yml_path).filter(|p| is_cached(p)),
                Some(dict_path).filter(|p| is_cached(p)),
            )
        } else {
            (None, None)
        };

        let tokenizer_out = if model.has_tokenizer() {
            let tok_path = dir.join("tokenizer.json");
            let tok_url  = format!("{}/{}/resolve/main/tokenizer.json", HF_BASE, model.hf_repo());
            if !is_cached(&tok_path) {
                eprintln!("[ppocr-rs] download tokenizer → {}", tok_path.display());
                // Non fatale: se manca, FormulaRecognizer userà il fallback
                let _ = fetch_file(&tok_url, &tok_path);
            }
            Some(tok_path).filter(|p| is_cached(p))
        } else {
            None
        };

        Ok(StructureModelPaths {
            onnx: onnx_path,
            dict_txt: dict_out,
            yml: yml_out,
            tokenizer_json: tokenizer_out,
        })
    }

    fn default_cache_dir() -> Result<PathBuf, OcrError> {
        #[cfg(windows)]
        if let Some(v) = std::env::var_os("LOCALAPPDATA") {
            return Ok(PathBuf::from(v).join("ppocr-rs"));
        }
        if let Some(v) = std::env::var_os("XDG_CACHE_HOME") {
            return Ok(PathBuf::from(v).join("ppocr-rs"));
        }
        if let Some(v) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            return Ok(PathBuf::from(v).join(".cache").join("ppocr-rs"));
        }
        Err(OcrError::ModelHubError(
            "impossibile determinare la cache dir: HOME/LOCALAPPDATA non impostato".into(),
        ))
    }
}

// ─── Estrazione dict dal YML ──────────────────────────────────────────────────

/// Estrae la sezione `PostProcess.character_dict` dall'inference.yml e la
/// scrive come file di testo (una entry per riga), compatibile con
/// `CrnnNet::read_keys_from_file`.
///
/// Il dict nel YML è il vocabolario **effettivo** dell'output layer ONNX.
/// Per il tiny model: 6 904 voci; per il medium: ~18 000+.
fn extract_dict_from_yml(yml_path: &Path, dict_path: &Path) -> Result<(), OcrError> {
    let content = std::fs::read_to_string(yml_path)?;

    let mut chars: Vec<String> = Vec::new();
    let mut in_dict = false;

    for line in content.lines() {
        if !in_dict {
            // Cerca `  character_dict:` (con spazi iniziali arbitrari)
            if line.trim_start().starts_with("character_dict:") {
                in_dict = true;
            }
            continue;
        }

        // Ogni entry ha forma `  - 'x'`, `  - x` o `  - ` (valore nullo/vuoto).
        // Il singolo apice è `''''` (YAML single-quoted con escape ''→').
        // Alcune entry serializzate da PaddleOCR/yaml.dump appaiono vuote
        // (carattere alla posizione 616 nel tiny). Vengono scritte come riga
        // vuota — `read_keys_from_file` NON le filtra più, preservando la
        // posizione corretta dei token successivi nel vocabolario ONNX.
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("- ") {
            let rest_trimmed = rest.trim_end_matches('\r');
            let ch = if rest_trimmed.starts_with('\'') && rest_trimmed.ends_with('\'') && rest_trimmed.len() >= 2 {
                // Single-quoted YAML: strip delimitatori esterni, unescape ''→'
                rest_trimmed[1..rest_trimmed.len() - 1].replace("''", "'")
            } else {
                rest_trimmed.to_string()
            };
            chars.push(ch);
        } else if !trimmed.is_empty() && !trimmed.starts_with('-') {
            // Fine della lista (nuova chiave YAML)
            break;
        }
    }

    if chars.is_empty() {
        return Err(OcrError::ModelHubError(
            "character_dict non trovato in rec_inference.yml".into(),
        ));
    }

    let tmp_ext = format!("tmp_{:?}", std::thread::current().id())
        .replace(['(', ')'], "");
    let tmp = dict_path.with_extension(&tmp_ext);

    {
        let mut f = std::fs::File::create(&tmp)?;
        for ch in &chars {
            writeln!(f, "{ch}")?;
        }
    }

    if let Err(e) = std::fs::rename(&tmp, dict_path) {
        std::fs::remove_file(&tmp).ok();
        if !is_cached(dict_path) {
            return Err(OcrError::ModelHubError(format!("rename dict: {e}")));
        }
    }

    eprintln!("[ppocr-rs] dict estratto: {} voci", chars.len());
    Ok(())
}

// ─── HTTP download ────────────────────────────────────────────────────────────

fn is_cached(path: &Path) -> bool {
    path.metadata().map(|m| m.len() > 0).unwrap_or(false)
}

#[cfg(feature = "fetch-models")]
fn fetch_file(url: &str, dest: &Path) -> Result<(), OcrError> {
    let tid = format!("{:?}", std::thread::current().id())
        .replace(['(', ')'], "");
    let tmp = dest.with_extension(format!("tmp_{tid}"));

    let response = ureq::get(url)
        .call()
        .map_err(|e| OcrError::ModelHubError(format!("GET {url}: {e}")))?;

    let mut reader = response.into_reader();
    let mut file   = std::fs::File::create(&tmp)?;

    let mut buf = [0u8; 65536];
    let mut total = 0u64;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 { break; }
        file.write_all(&buf[..n])?;
        total += n as u64;
    }
    drop(file);

    if total == 0 {
        std::fs::remove_file(&tmp).ok();
        return Err(OcrError::ModelHubError(format!("risposta vuota da {url}")));
    }

    if let Err(e) = std::fs::rename(&tmp, dest) {
        std::fs::remove_file(&tmp).ok();
        if !is_cached(dest) {
            return Err(OcrError::ModelHubError(format!("rename tmp→dest: {e}")));
        }
        return Ok(());
    }

    eprintln!("[ppocr-rs] salvati {:.1} MB", total as f64 / 1_048_576.0);
    Ok(())
}

#[cfg(not(feature = "fetch-models"))]
fn fetch_file(url: &str, _dest: &Path) -> Result<(), OcrError> {
    Err(OcrError::ModelHubError(format!(
        "download richiede --features fetch-models. URL: {url}"
    )))
}
