//! ppocr-rs — pipeline OCR PaddleOCR (PP-OCRv6) in puro Rust su
//! ort 2.0.0-rc.9, downportato da meibel-ai/paddle-ocr-rs (Apache-2.0).
//!
//! ## Componenti
//!
//! - [`db_net`]      — DBNet text detection (input immagine, output bbox).
//! - [`crnn_net`]    — CRNN/SVTR text recognition (input crop, output stringa).
//! - [`angle_net`]   — Classificatore orientamento per-line (0°/180°).
//! - [`layout`]      — PP-DocLayoutV3 layout analysis (NOSTRA aggiunta — non
//!                     presente in paddle-ocr-rs upstream).
//! - [`ocr_lite`]    — Pipeline orchestrator det → cls → rec.
//! - [`ocr_utils`]   — Helper image preprocessing (mean/std normalize, perspective warp).
//! - [`scale_param`] — Calcolo dimensioni resize-to-multiple-of-32.
//! - [`ocr_result`]  — DTO: TextBox, TextLine, OcrResult.
//! - [`ocr_error`]   — Error type unico via `thiserror`.
//! - [`compat`]      — Shim per le differenze API ort rc.9 vs rc.11.
//!
//! ## Differenze rispetto a paddle-ocr-rs upstream
//!
//! 1. **`ort` pinnato a `=2.0.0-rc.9`** — versione target permanente del
//!    workspace (rc.11+ si blocca su ARM64 Snapdragon X Elite).
//! 2. **`ndarray` a `0.16`** (re-export di rc.9) invece di `0.17` (rc.11).
//! 3. **API `try_extract_tensor`** convertita via [`compat`] (shim permanente).
//! 4. **Modulo [`layout`]** aggiunto per supportare PP-DocLayoutV3 — non
//!    presente in upstream.
//! 5. **Edition `2021`** invece di `2024` (per compat con il toolchain
//!    minimo del workspace).

#![allow(clippy::too_many_arguments)]

pub mod angle_net;
pub mod base_net;
pub mod compat;
pub mod crnn_net;
pub mod db_net;
pub mod layout;
pub mod model_hub;
pub mod ocr_error;
pub mod ocr_lite;
pub mod ocr_result;
pub mod ocr_utils;
pub mod scale_param;
pub mod cell_detection;
pub mod doc_unwarp;
pub mod formula_rec;
pub mod table_classifier;
pub mod table_structure;

pub use ocr_error::OcrError;
pub use ocr_lite::{LayoutAwareResult, OcrLite, OcrOptions, TextBlockWithLayout};
pub use ocr_result::{Angle, OcrResult, Point, TextBlock, TextBox, TextLine, WordBox};
pub use layout::{LayoutAnalyzer, LayoutBox, LayoutClass, SemanticClass, LAYOUT_INPUT_SIZE, xy_cut_order};
pub use cell_detection::{CellDetector, CellBbox, derive_grid, grid_to_gfm, CELL_DETECT_INPUT_SIZE};
pub use model_hub::{ModelHub, ModelPaths, PpOcrVersion, PpStructureModel, StructureModelPaths};
pub use table_classifier::{TableTypeClassifier, TableType, DocOrientationClassifier, DocOrientation};
pub use table_structure::{TableStructureRecognizer, TableStructure, TableCellBox, SLANEXT_INPUT_SIZE};
pub use doc_unwarp::{DocUnwarper, UnwarpResult};
pub use formula_rec::{FormulaRecognizer, FormulaResult, FORMULA_INPUT_SIZE};
