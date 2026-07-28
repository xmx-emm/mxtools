//! PP-LCNet classifiers: table type (wired/wireless) e document orientation.
//!
//! Entrambi i modelli condividono la stessa architettura PP-LCNet_x1_0 ma
//! dimensioni di input diverse:
//! - `TableTypeClassifier` — `"x"` shape `[1, 3, 48, 192]`
//! - `DocOrientationClassifier` — `"x"` shape `[1, 3, 224, 224]`
//! - Normalizzazione ImageNet: mean=[0.485,0.456,0.406] std=[0.229,0.224,0.225]
//! - Output: logits → argmax
//!
//! ## Modelli HuggingFace
//!
//! | Modello                            | Classi | HF repo                                      |
//! |------------------------------------|--------|----------------------------------------------|
//! | `PP-LCNet_x1_0_table_cls_onnx`     | 2      | `PaddlePaddle/PP-LCNet_x1_0_table_cls_onnx` |
//! | `PP-LCNet_x1_0_doc_ori_onnx`       | 4      | `PaddlePaddle/PP-LCNet_x1_0_doc_ori_onnx`   |
//!
//! ## Pipeline consigliata per tabelle
//!
//! 1. Identifica la regione tabella via `LayoutAnalyzer`.
//! 2. Usa `TableTypeClassifier` per discriminare wired vs wireless.
//! 3. Carica `CellDetector` (wired: RT-DETR-L wired, wireless: RT-DETR-L wireless).
//! 4. Usa `TableStructureRecognizer` con il modello SLANeXt corrispondente.

use crate::ocr_error::OcrError;
use ndarray::{Array, Array4};
use ort::{
    inputs,
    session::{builder::GraphOptimizationLevel, Session},
    value::Tensor,
};
use std::path::Path;

// ─── Table type ───────────────────────────────────────────────────────────────

/// Tipo di tabella classificato da `PP-LCNet_x1_0_table_cls_onnx`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TableType {
    /// Tabella con bordi/griglia visibili.
    Wired,
    /// Tabella senza bordi espliciti (struttura implicita nel layout).
    Wireless,
}

impl std::fmt::Display for TableType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TableType::Wired    => write!(f, "wired"),
            TableType::Wireless => write!(f, "wireless"),
        }
    }
}

/// Classificatore tabella wired/wireless.
///
/// Usa `PP-LCNet_x1_0_table_cls_onnx` — modello ultra-leggero (7 MB),
/// input `[1, 3, 48, 192]`, output 2 logits.
#[derive(Debug)]
pub struct TableTypeClassifier {
    session: Session,
}

impl TableTypeClassifier {
    pub fn from_path(model_path: impl AsRef<Path>) -> Result<Self, OcrError> {
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .commit_from_file(model_path)?;
        Ok(Self { session })
    }

    /// Classifica l'immagine come `Wired` o `Wireless`.
    /// Ritorna `(tipo, confidence)`.
    pub fn classify(&self, image: &image::RgbImage) -> Result<(TableType, f32), OcrError> {
        let blob = preprocess_lcnet(image);
        let name = self.session.inputs[0].name.clone();
        let outputs = self.session.run(
            inputs![name => Tensor::from_array(blob)?]?
        )?;
        let (_, first) = outputs.iter().next()
            .ok_or_else(|| OcrError::ModelOutput("TableTypeCls: nessun output".into()))?;
        let (_, raw) = crate::compat::tensor_extract_with_shape_f32(&first)?;
        let (idx, score) = argmax_f32(&raw);
        Ok((if idx == 0 { TableType::Wired } else { TableType::Wireless }, score))
    }
}

// ─── Document orientation ─────────────────────────────────────────────────────

/// Orientamento di una pagina documento (multipli di 90°).
///
/// Indica la rotazione CORRENTE della pagina. Per raddrizzarla applicare
/// una rotazione di `(360 - degrees())°`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocOrientation {
    /// Pagina già diritta (angolo 0°).
    Deg0,
    /// Pagina ruotata di 90° orario.
    Deg90,
    /// Pagina capovolta (180°).
    Deg180,
    /// Pagina ruotata di 90° antiorario (270° orario).
    Deg270,
}

impl DocOrientation {
    /// Gradi di rotazione corrente (0, 90, 180, 270).
    pub fn degrees(self) -> u32 {
        match self {
            Self::Deg0   =>   0,
            Self::Deg90  =>  90,
            Self::Deg180 => 180,
            Self::Deg270 => 270,
        }
    }
}

impl std::fmt::Display for DocOrientation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}°", self.degrees())
    }
}

/// Classificatore orientamento documento.
///
/// Usa `PP-LCNet_x1_0_doc_ori_onnx` — modello 7 MB, input `[1, 3, 224, 224]`,
/// output 4 logits (classe 0=0°, 1=90°, 2=180°, 3=270°).
///
/// Utile per scansioni ruotate dove la classificazione per-riga `do_angle`
/// (`AngleNet`) non è sufficiente: un documento capovolto avrà tutte le righe
/// con orientamento "coerente" ma globalmente sbagliato.
#[derive(Debug)]
pub struct DocOrientationClassifier {
    session: Session,
}

impl DocOrientationClassifier {
    pub fn from_path(model_path: impl AsRef<Path>) -> Result<Self, OcrError> {
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .commit_from_file(model_path)?;
        Ok(Self { session })
    }

    /// Classifica l'orientamento della pagina.
    /// Ritorna `(orientamento, confidence)`.
    pub fn classify(&self, image: &image::RgbImage) -> Result<(DocOrientation, f32), OcrError> {
        // PP-LCNet_x1_0_doc_ori_onnx usa 224×224, non 48×192 come il table_cls.
        let blob = preprocess_lcnet_sq224(image);
        let name = self.session.inputs[0].name.clone();
        let outputs = self.session.run(
            inputs![name => Tensor::from_array(blob)?]?
        )?;
        let (_, first) = outputs.iter().next()
            .ok_or_else(|| OcrError::ModelOutput("DocOriCls: nessun output".into()))?;
        let (_, raw) = crate::compat::tensor_extract_with_shape_f32(&first)?;
        let (idx, score) = argmax_f32(&raw);
        let orient = match idx {
            0 => DocOrientation::Deg0,
            1 => DocOrientation::Deg90,
            2 => DocOrientation::Deg180,
            _ => DocOrientation::Deg270,
        };
        Ok((orient, score))
    }
}

// ─── Shared preprocessing ─────────────────────────────────────────────────────

/// Preprocessing PP-LCNet per `PP-LCNet_x1_0_table_cls_onnx`: resize 192×48.
/// `ClsResizeImg(image_shape=[3, 48, 192])` + normalizzazione ImageNet.
fn preprocess_lcnet(image: &image::RgbImage) -> Array4<f32> {
    preprocess_lcnet_wh(image, 192, 48)
}

/// Preprocessing PP-LCNet per `PP-LCNet_x1_0_doc_ori_onnx`: resize 224×224.
/// `ClsResizeImg(image_shape=[3, 224, 224])` + normalizzazione ImageNet.
fn preprocess_lcnet_sq224(image: &image::RgbImage) -> Array4<f32> {
    preprocess_lcnet_wh(image, 224, 224)
}

fn preprocess_lcnet_wh(image: &image::RgbImage, w: u32, h: u32) -> Array4<f32> {
    let resized = image::imageops::resize(image, w, h, image::imageops::FilterType::Triangle);
    let mean = [0.485f32, 0.456, 0.406];
    let std  = [0.229f32, 0.224, 0.225];
    let mut blob: Array4<f32> = Array::zeros((1, 3, h as usize, w as usize));
    for y in 0..h as usize {
        for x in 0..w as usize {
            let p = resized.get_pixel(x as u32, y as u32);
            for c in 0..3usize {
                blob[[0, c, y, x]] = (p[c] as f32 / 255.0 - mean[c]) / std[c];
            }
        }
    }
    blob
}

/// Ritorna `(indice_max, valore_max)` su un vettore di logit.
fn argmax_f32(logits: &[f32]) -> (usize, f32) {
    logits.iter().copied().enumerate()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .unwrap_or((0, 0.0))
}
