//! Layout analysis via PP-DocLayoutV3 (PaddleX `paddle3.0.0`).
//!
//! Porting Rust del layout analyzer PP-DocLayoutV3 (PaddleX / PaddleOCR).
//! Il modello è uno YOLO-style detector che produce 25 classi di regioni
//! documentali (text/title/table/figure/header/footer/...).
//!
//! ## Pipeline
//!
//! 1. **Preprocess**: resize letterbox a 800×800 (preserva aspect ratio,
//!    pad bottom-right con zeri), poi ImageNet normalize
//!    (mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]). HWC→CHW + batch.
//! 2. **Inference**: 3 input ONNX:
//!      - `im_shape`     `[1,2]` = `[800.0, 800.0]`
//!      - `image`        `[1,3,800,800]` = blob normalizzato
//!      - `scale_factor` `[1,2]` = `[scale, scale]` (Paddle internamente
//!        post-processa rescaling delle bbox alle coord originali).
//! 3. **Output**: `[N, 7]` con `[class_id, score, xmin, ymin, xmax, ymax, read_order]`.
//! 4. **Postprocess**: confidence threshold + NMS (IoU 0.5) + sort per
//!    reading order (col 6).
//!
//! Il modello PaddleX **rimappa** internamente le bbox alle dimensioni
//! originali tramite `scale_factor`, quindi le coordinate finali sono già
//! in pixel sull'immagine input.

use crate::ocr_error::OcrError;
use ndarray::{Array, Array2, Array4};
use ort::{
    inputs,
    session::{builder::GraphOptimizationLevel, Session},
    value::Tensor,
};
use std::path::Path;

/// Dimensione fissa input PP-DocLayoutV3.
pub const LAYOUT_INPUT_SIZE: u32 = 800;

/// 25 classi di PP-DocLayoutV3 (config.json del rilascio PaddleX). Mappate
/// 1:1 dalle output predictions del modello.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum LayoutClass {
    Abstract        = 0,
    Algorithm       = 1,
    AsideText       = 2,
    Chart           = 3,
    Content         = 4,
    DisplayFormula  = 5,
    DocTitle        = 6,
    FigureTitle     = 7,
    Footer          = 8,
    FooterImage     = 9,
    Footnote        = 10,
    FormulaNumber   = 11,
    Header          = 12,
    HeaderImage     = 13,
    Image           = 14,
    InlineFormula   = 15,
    Number          = 16,
    ParagraphTitle  = 17,
    Reference       = 18,
    ReferenceContent = 19,
    Seal            = 20,
    Table           = 21,
    Text            = 22,
    VerticalText    = 23,
    VisionFootnote  = 24,
}

impl LayoutClass {
    pub fn from_id(id: usize) -> Option<Self> {
        Some(match id {
            0 => Self::Abstract,
            1 => Self::Algorithm,
            2 => Self::AsideText,
            3 => Self::Chart,
            4 => Self::Content,
            5 => Self::DisplayFormula,
            6 => Self::DocTitle,
            7 => Self::FigureTitle,
            8 => Self::Footer,
            9 => Self::FooterImage,
            10 => Self::Footnote,
            11 => Self::FormulaNumber,
            12 => Self::Header,
            13 => Self::HeaderImage,
            14 => Self::Image,
            15 => Self::InlineFormula,
            16 => Self::Number,
            17 => Self::ParagraphTitle,
            18 => Self::Reference,
            19 => Self::ReferenceContent,
            20 => Self::Seal,
            21 => Self::Table,
            22 => Self::Text,
            23 => Self::VerticalText,
            24 => Self::VisionFootnote,
            _ => return None,
        })
    }

    /// Mapping a categoria semantica semplificata coerente col Python
    /// (`CLASS_MAPPING` in `analyzer.py`). 8 categorie: text/title/list/
    /// figure/table/header/footer/equation. Usata downstream per markdown
    /// export / consumer agnostic-rendering.
    pub fn semantic(self) -> SemanticClass {
        use LayoutClass::*;
        match self {
            DocTitle | ParagraphTitle              => SemanticClass::Title,
            Header                                 => SemanticClass::Header,
            Footer                                 => SemanticClass::Footer,
            Reference                              => SemanticClass::List,
            Chart | FooterImage | HeaderImage |
            Image | Seal                           => SemanticClass::Figure,
            Table                                  => SemanticClass::Table,
            DisplayFormula | InlineFormula         => SemanticClass::Equation,
            // Tutto il resto = text (Abstract, Algorithm, AsideText, Content,
            // FigureTitle, Footnote, FormulaNumber, Number, ReferenceContent,
            // Text, VerticalText, VisionFootnote).
            _                                      => SemanticClass::Text,
        }
    }
}

/// Categoria semantica semplificata (8 classi). Usata per markdown export
/// e per il rendering UI engine-agnostic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum SemanticClass {
    Text,
    Title,
    List,
    Figure,
    Table,
    Header,
    Footer,
    Equation,
}

/// Bounding box di una regione layout, coordinate in pixel sull'immagine
/// di input ORIGINALE (post-rescaling fatto internamente da PaddleX).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LayoutBox {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub class: LayoutClass,
    pub score: f32,
    /// Reading order assegnato dal modello (basso = prima nella lettura).
    /// `-1` se il modello non lo emette (output shape < 7).
    pub reading_order: i32,
}

impl LayoutBox {
    pub fn xmin(&self) -> u32 { self.x }
    pub fn ymin(&self) -> u32 { self.y }
    pub fn xmax(&self) -> u32 { self.x + self.w }
    pub fn ymax(&self) -> u32 { self.y + self.h }

    /// True se il punto `(px, py)` cade dentro il rettangolo (inclusivo
    /// sui bordi sinistro/superiore, esclusivo su destro/inferiore).
    pub fn contains(&self, px: u32, py: u32) -> bool {
        px >= self.xmin() && px < self.xmax()
            && py >= self.ymin() && py < self.ymax()
    }

    /// Distanza euclidea fra il centro di `self` e il punto `(px, py)`.
    /// Usata per orphan recovery (line outside ALL boxes → nearest box).
    pub fn distance_to(&self, px: u32, py: u32) -> f32 {
        let cx = self.x as f32 + self.w as f32 / 2.0;
        let cy = self.y as f32 + self.h as f32 / 2.0;
        let dx = cx - px as f32;
        let dy = cy - py as f32;
        (dx * dx + dy * dy).sqrt()
    }
}

/// Analyzer wrapper che mantiene la `ort::Session` per PP-DocLayoutV3.
pub struct LayoutAnalyzer {
    pub session:        Session,
    pub conf_thresh:    f32,
    pub nms_iou_thresh: f32,
}

impl LayoutAnalyzer {
    /// Carica il modello da file. La session usa `Level3` optimization.
    pub fn from_path(model_path: impl AsRef<Path>) -> Result<Self, OcrError> {
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .commit_from_file(model_path)?;
        Ok(Self {
            session,
            conf_thresh:    0.50,
            nms_iou_thresh: 0.50,
        })
    }

    /// Costruttore da Session pre-caricata. Usato in Edge dove la session
    /// è già nello state Tauri (`OcrState::layout_session`).
    pub fn from_session(session: Session) -> Self {
        Self {
            session,
            conf_thresh:    0.50,
            nms_iou_thresh: 0.50,
        }
    }

    /// Esegue layout analysis sull'immagine. Ritorna le `LayoutBox`
    /// filtrate per confidence + NMS + ordinate per reading_order
    /// (ascending; primo box nella lettura = posizione 0).
    pub fn analyze(&mut self, image: &image::RgbImage) -> Result<Vec<LayoutBox>, OcrError> {
        // ── Step 1: preprocess (letterbox + normalize) ──────────────────
        let (input_blob, scale) = preprocess(image, LAYOUT_INPUT_SIZE);

        // ── Step 2: inference ───────────────────────────────────────────
        let im_shape: Array2<f32> = ndarray::arr2(&[[
            LAYOUT_INPUT_SIZE as f32, LAYOUT_INPUT_SIZE as f32,
        ]]);
        let scale_factor: Array2<f32> = ndarray::arr2(&[[scale, scale]]);

        // I 3 input names di PP-DocLayoutV3 (in ordine canonico):
        //   im_shape, image, scale_factor.
        // Lookup empirico: il Python usa in ordine `[input_names[0], [1], [2]]`
        // come [im_shape, image, scale_factor]. Ricalchiamo.
        let inputs = self.session.inputs.iter()
            .map(|i| i.name.clone())
            .collect::<Vec<_>>();
        if inputs.len() < 3 {
            return Err(OcrError::ModelInput(format!(
                "PP-DocLayoutV3 si aspetta ≥3 input, trovati {} ({:?})",
                inputs.len(), inputs,
            )));
        }
        // Heuristic: match per nome se possibile, altrimenti usa l'ordine
        // tipico Paddle: [im_shape, image, scale_factor].
        let mut name_im_shape     = inputs[0].clone();
        let mut name_image        = inputs[1].clone();
        let mut name_scale_factor = inputs[2].clone();
        for n in &inputs {
            if n == "im_shape"     { name_im_shape     = n.clone(); }
            if n == "image"        { name_image        = n.clone(); }
            if n == "scale_factor" { name_scale_factor = n.clone(); }
        }

        let im_shape_t     = Tensor::from_array(im_shape)?;
        let image_t        = Tensor::from_array(input_blob)?;
        let scale_factor_t = Tensor::from_array(scale_factor)?;

        let outputs = self.session.run(inputs![
            name_im_shape     => im_shape_t,
            name_image        => image_t,
            name_scale_factor => scale_factor_t,
        ]?)?;

        // ── Step 3: parse output ────────────────────────────────────────
        // Output principale: tensor shape (N, 6) o (N, 7) con
        // [class_id, score, xmin, ymin, xmax, ymax, [reading_order]].
        let (_, primary) = outputs.iter().next()
            .ok_or_else(|| OcrError::ModelOutput("PP-DocLayoutV3 non ha emesso output".into()))?;

        let (shape_vec, raw_data) = crate::compat::tensor_extract_with_shape_f32(&primary)?;
        let n_boxes = shape_vec[0] as usize;
        let n_cols  = if shape_vec.len() > 1 { shape_vec[1] as usize } else { 0 };
        if n_cols < 6 {
            return Err(OcrError::ModelOutput(format!(
                "PP-DocLayoutV3 output cols={} (atteso ≥6)", n_cols,
            )));
        }
        let has_reading_order = n_cols >= 7;

        // ── Step 4: confidence filter ───────────────────────────────────
        let mut boxes: Vec<LayoutBox> = Vec::with_capacity(n_boxes);
        let (img_w, img_h) = (image.width() as i32, image.height() as i32);
        for i in 0..n_boxes {
            let off = i * n_cols;
            let class_id = raw_data[off] as i32;
            let score    = raw_data[off + 1];
            if score < self.conf_thresh { continue; }
            if class_id < 0 { continue; }
            let xmin = raw_data[off + 2];
            let ymin = raw_data[off + 3];
            let xmax = raw_data[off + 4];
            let ymax = raw_data[off + 5];
            let read_order = if has_reading_order { raw_data[off + 6] as i32 } else { -1 };

            // Clamp dentro l'immagine
            let xmin_c = (xmin.max(0.0) as i32).min(img_w);
            let ymin_c = (ymin.max(0.0) as i32).min(img_h);
            let xmax_c = (xmax.max(0.0) as i32).min(img_w);
            let ymax_c = (ymax.max(0.0) as i32).min(img_h);
            if xmax_c <= xmin_c || ymax_c <= ymin_c { continue; }

            let class = match LayoutClass::from_id(class_id as usize) {
                Some(c) => c,
                // class_id fuori range (modello aggiornato con classi nuove):
                // fallback a Text come fa PaddleX, non scartare il box.
                None    => LayoutClass::Text,
            };
            boxes.push(LayoutBox {
                x: xmin_c as u32,
                y: ymin_c as u32,
                w: (xmax_c - xmin_c) as u32,
                h: (ymax_c - ymin_c) as u32,
                class,
                score,
                reading_order: read_order,
            });
        }

        // ── Step 5: NMS ────────────────────────────────────────────────
        let kept = nms(&mut boxes, self.nms_iou_thresh);

        // ── Step 6: sort per reading_order (ascending), -1 va in fondo ─
        let mut sorted = kept;
        sorted.sort_by(|a, b| {
            let ka = if a.reading_order < 0 { i32::MAX } else { a.reading_order };
            let kb = if b.reading_order < 0 { i32::MAX } else { b.reading_order };
            ka.cmp(&kb)
        });

        Ok(sorted)
    }
}

/// Preprocess: letterbox resize a `target_size × target_size` preservando
/// l'aspect ratio (pad bottom-right con zeri), ImageNet normalize, HWC→CHW
/// + batch dim. Ritorna `(blob, scale)` dove `scale` è il rapporto
/// applicato (uguale per H e W per via dell'aspect-preserve).
fn preprocess(image: &image::RgbImage, target_size: u32) -> (Array4<f32>, f32) {
    let (orig_w, orig_h) = (image.width(), image.height());
    let scale = (target_size as f32 / orig_h as f32).min(target_size as f32 / orig_w as f32);
    let new_w = (orig_w as f32 * scale).round() as u32;
    let new_h = (orig_h as f32 * scale).round() as u32;

    // Resize bilinear
    let resized = image::imageops::resize(
        image, new_w, new_h, image::imageops::FilterType::Triangle,
    );

    // Letterbox pad: target_size×target_size, riempie da (0,0) a (new_w,new_h),
    // resto = zero (in normalized space).
    let mean = [0.485f32, 0.456, 0.406];
    let std  = [0.229f32, 0.224, 0.225];

    let target = target_size as usize;
    let mut blob: Array4<f32> = Array::zeros((1, 3, target, target));
    for y in 0..new_h as usize {
        for x in 0..new_w as usize {
            let pixel = resized.get_pixel(x as u32, y as u32);
            for c in 0..3 {
                let v = pixel[c] as f32 / 255.0;
                blob[[0, c, y, x]] = (v - mean[c]) / std[c];
            }
        }
    }
    (blob, scale)
}

/// Non-maximum suppression. Mantiene il box con score più alto, scarta
/// quelli con IoU > `iou_thresh`. Time O(N²) — sufficiente per N tipico
/// di PP-DocLayoutV3 (≤100 box per pagina).
fn nms(boxes: &mut Vec<LayoutBox>, iou_thresh: f32) -> Vec<LayoutBox> {
    boxes.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let mut keep: Vec<bool> = vec![true; boxes.len()];
    for i in 0..boxes.len() {
        if !keep[i] { continue; }
        for j in (i + 1)..boxes.len() {
            if !keep[j] { continue; }
            if iou(&boxes[i], &boxes[j]) > iou_thresh {
                keep[j] = false;
            }
        }
    }
    boxes.iter().zip(keep.iter())
        .filter_map(|(b, &k)| if k { Some(b.clone()) } else { None })
        .collect()
}

fn iou(a: &LayoutBox, b: &LayoutBox) -> f32 {
    let xa = a.xmin().max(b.xmin()) as i32;
    let ya = a.ymin().max(b.ymin()) as i32;
    let xb = (a.xmax().min(b.xmax())) as i32;
    let yb = (a.ymax().min(b.ymax())) as i32;
    let w = (xb - xa).max(0);
    let h = (yb - ya).max(0);
    let inter = (w * h) as f32;
    let area_a = (a.w * a.h) as f32;
    let area_b = (b.w * b.h) as f32;
    let union = area_a + area_b - inter;
    if union <= 0.0 { 0.0 } else { inter / union }
}

// ─── XY-Cut reading-order ─────────────────────────────────────────────────────

/// Ordina i layout-box in reading-order usando l'algoritmo XY-Cut ricorsivo.
///
/// Ritorna gli indici in `boxes` nell'ordine di lettura corretto.
///
/// L'algoritmo:
/// 1. Cerca un taglio orizzontale (y-gap dove nessun box attraversa la linea).
///    Se trovato: il gruppo superiore viene letto prima del gruppo inferiore.
/// 2. Se non esiste taglio orizzontale, cerca un taglio verticale (x-gap).
///    Se trovato: la colonna sinistra viene letta prima della destra.
/// 3. Se nessun taglio esiste (boxes si sovrappongono su entrambi gli assi):
///    fallback a ordinamento per (y_center, x_center).
///
/// Gestisce correttamente documenti a una o più colonne, tabelle e layout misti.
pub fn xy_cut_order(boxes: &[LayoutBox]) -> Vec<usize> {
    let indices: Vec<usize> = (0..boxes.len()).collect();
    let mut result = Vec::with_capacity(boxes.len());
    xy_cut_rec(boxes, &indices, &mut result);
    result
}

fn xy_cut_rec(boxes: &[LayoutBox], indices: &[usize], out: &mut Vec<usize>) {
    match indices.len() {
        0 => {}
        1 => out.push(indices[0]),
        _ => {
            if let Some((top, bottom)) = find_cut(boxes, indices, Axis::Y) {
                xy_cut_rec(boxes, &top, out);
                xy_cut_rec(boxes, &bottom, out);
            } else if let Some((left, right)) = find_cut(boxes, indices, Axis::X) {
                xy_cut_rec(boxes, &left, out);
                xy_cut_rec(boxes, &right, out);
            } else {
                // Nessun taglio pulito: ordina per (y_center, x_center)
                let mut sorted = indices.to_vec();
                sorted.sort_by(|&a, &b| {
                    let ay = boxes[a].y as f32 + boxes[a].h as f32 / 2.0;
                    let by = boxes[b].y as f32 + boxes[b].h as f32 / 2.0;
                    ay.partial_cmp(&by).unwrap_or(std::cmp::Ordering::Equal)
                        .then_with(|| {
                            let ax = boxes[a].x as f32 + boxes[a].w as f32 / 2.0;
                            let bx = boxes[b].x as f32 + boxes[b].w as f32 / 2.0;
                            ax.partial_cmp(&bx).unwrap_or(std::cmp::Ordering::Equal)
                        })
                });
                out.extend(sorted);
            }
        }
    }
}

#[derive(Clone, Copy)]
enum Axis { X, Y }

/// Cerca un taglio sull'asse specificato. Ritorna `(prima_partizione, seconda_partizione)`.
/// Il taglio è valido solo se non esiste nessun box che attraversa la linea di taglio.
fn find_cut(boxes: &[LayoutBox], indices: &[usize], axis: Axis) -> Option<(Vec<usize>, Vec<usize>)> {
    // Raccoglie eventi (valore_inizio, valore_fine) sull'asse scelto
    let intervals: Vec<(u32, u32)> = indices.iter()
        .map(|&i| match axis {
            Axis::Y => (boxes[i].ymin(), boxes[i].ymax()),
            Axis::X => (boxes[i].xmin(), boxes[i].xmax()),
        })
        .collect();

    // Trova il minimo massimo: il valore più basso tra tutti i "fine" dei box
    // che NON viene superato dall'inizio di qualche altro box → gap
    let mut events: Vec<(u32, bool)> = Vec::new(); // (valore, is_start)
    for &(s, e) in &intervals {
        events.push((s, true));
        events.push((e, false));
    }
    // Sort: per valore, poi end prima di start allo stesso valore
    // (box A che finisce a 100 e box B che inizia a 100 → nessun gap)
    events.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    let mut active = 0i32;
    let mut cut_end: Option<u32> = None;
    for &(v, is_start) in &events {
        if is_start { active += 1; } else { active -= 1; }
        if active == 0 {
            cut_end = Some(v);
            break;
        }
    }

    let cut = cut_end?;
    // Il prossimo evento "start" dopo `cut` indica dove inizia la partizione successiva
    let next_start = events.iter()
        .find(|&&(v, is_start)| v > cut && is_start)
        .map(|&(v, _)| v)?;

    let first: Vec<usize> = indices.iter().cloned()
        .filter(|&i| match axis {
            Axis::Y => boxes[i].ymax() <= cut,
            Axis::X => boxes[i].xmax() <= cut,
        })
        .collect();
    let second: Vec<usize> = indices.iter().cloned()
        .filter(|&i| match axis {
            Axis::Y => boxes[i].ymin() >= next_start,
            Axis::X => boxes[i].xmin() >= next_start,
        })
        .collect();

    // Verifica che tutti i box siano stati assegnati a una delle due partizioni
    if first.len() + second.len() == indices.len() {
        Some((first, second))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lb(x: u32, y: u32, w: u32, h: u32, class: LayoutClass, score: f32, ro: i32) -> LayoutBox {
        LayoutBox { x, y, w, h, class, score, reading_order: ro }
    }

    #[test]
    fn iou_identical_is_one() {
        let a = lb(0, 0, 100, 50, LayoutClass::Text, 0.9, 0);
        let b = a.clone();
        assert!((iou(&a, &b) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn iou_disjoint_is_zero() {
        let a = lb(0,   0, 50, 50, LayoutClass::Text, 0.9, 0);
        let b = lb(100, 0, 50, 50, LayoutClass::Text, 0.9, 0);
        assert_eq!(iou(&a, &b), 0.0);
    }

    #[test]
    fn nms_keeps_highest_score() {
        let mut boxes = vec![
            lb(0, 0, 100, 50, LayoutClass::Text, 0.85, 0),
            lb(5, 5, 100, 50, LayoutClass::Text, 0.95, 0), // overlap >> thresh
            lb(200, 200, 50, 50, LayoutClass::DocTitle, 0.70, 1),
        ];
        let kept = nms(&mut boxes, 0.5);
        assert_eq!(kept.len(), 2);
        // Score più alto (0.95) prima
        assert!((kept[0].score - 0.95).abs() < 1e-6);
        assert!((kept[1].score - 0.70).abs() < 1e-6);
    }

    #[test]
    fn semantic_mapping() {
        assert_eq!(LayoutClass::DocTitle.semantic(),       SemanticClass::Title);
        assert_eq!(LayoutClass::ParagraphTitle.semantic(), SemanticClass::Title);
        assert_eq!(LayoutClass::Image.semantic(),          SemanticClass::Figure);
        assert_eq!(LayoutClass::Table.semantic(),          SemanticClass::Table);
        assert_eq!(LayoutClass::Footer.semantic(),         SemanticClass::Footer);
        assert_eq!(LayoutClass::DisplayFormula.semantic(), SemanticClass::Equation);
        assert_eq!(LayoutClass::Text.semantic(),           SemanticClass::Text);
        assert_eq!(LayoutClass::VerticalText.semantic(),   SemanticClass::Text);
    }

    #[test]
    fn layout_box_contains_and_distance() {
        let b = lb(100, 100, 200, 50, LayoutClass::Text, 0.9, 0);
        assert!(b.contains(150, 120));
        assert!(!b.contains(50, 120));
        assert!(!b.contains(350, 120));
        // Centroide = (200, 125). Distanza dal centroide a (200, 125) = 0.
        assert!(b.distance_to(200, 125) < 0.01);
    }

    #[test]
    fn preprocess_letterbox_keeps_aspect() {
        // Immagine 600×300 → su target 800: scale = min(800/300, 800/600) = 800/600 = 1.333
        // new_w = 800, new_h = 400. Padding bottom = 400 px.
        let img = image::RgbImage::new(600, 300);
        let (blob, scale) = preprocess(&img, 800);
        assert!((scale - 800.0/600.0).abs() < 1e-3);
        assert_eq!(blob.shape(), &[1, 3, 800, 800]);
    }
}
