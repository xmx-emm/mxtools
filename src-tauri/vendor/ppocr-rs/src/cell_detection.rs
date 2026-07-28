//! RT-DETR-L Cell Detection per tabelle (PaddleOCR PP-StructureV3 v2).
//!
//! Modello: `RT-DETR-L_wired_table_cell_det.onnx` da `kreuzberg-dev/paddle-to-onnx`.
//! Identica architettura a PP-DocLayoutV3 (entrambi RT-DETR family) ma:
//!  - 1 sola classe (cell, no semantic categories)
//!  - input fixed 640×640 (vs 800×800 di PP-DocLayoutV3)
//!  - output `[N, 6]` = `[class_id, score, x1, y1, x2, y2]` (no reading_order)
//!
//! ## Pipeline
//!
//! 1. Letterbox resize a 640×640 preservando aspect ratio (pad bottom/right
//!    con zeri normalize-space).
//! 2. ImageNet normalize (mean=[.485,.456,.406] std=[.229,.224,.225] scale=1/255).
//! 3. Inference con 3 input: `im_shape`, `image`, `scale_factor`.
//!    Il modello internamente rescala le bbox alle coords originali.
//! 4. Filtra per `conf_thresh` + NMS IoU 0.5.
//!
//! ## Uso architetturale
//!
//! Unico modulo attivo per il riconoscimento tabelle. La struttura (righe /
//! colonne) è dedotta geometricamente da `derive_grid` + `grid_to_gfm` senza
//! un modello di structure recognition separato: funziona bene su tabelle
//! business/legali italiane dove SLANet_plus (PP-StructureV3 v1) produceva
//! skeleton vuoti per distribuzione fuori-dominio.

use crate::ocr_error::OcrError;
use ndarray::{Array, Array2, Array4};
use ort::{
    inputs,
    session::{builder::GraphOptimizationLevel, Session},
    value::Tensor,
};
use std::path::Path;

/// Lato dell'input del modello RT-DETR-L cell det (fixed dal grafo ONNX).
pub const CELL_DETECT_INPUT_SIZE: u32 = 640;

#[derive(Debug, Clone)]
pub struct CellBbox {
    /// Pixel coords sull'immagine input ORIGINALE (post-rescaling automatico
    /// del modello tramite `scale_factor`).
    pub left:   i32,
    pub top:    i32,
    pub right:  i32,
    pub bottom: i32,
    /// Confidence 0..=1 emessa dal detector.
    pub score:  f32,
}

impl CellBbox {
    pub fn width(&self)  -> i32 { (self.right  - self.left).max(0) }
    pub fn height(&self) -> i32 { (self.bottom - self.top).max(0) }
    pub fn cx(&self) -> i32 { (self.left + self.right) / 2 }
    pub fn cy(&self) -> i32 { (self.top  + self.bottom) / 2 }
}

pub struct CellDetector {
    session:        Session,
    pub conf_thresh: f32,
    pub nms_iou:     f32,
}

impl CellDetector {
    pub fn from_path(model_path: impl AsRef<Path>) -> Result<Self, OcrError> {
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .commit_from_file(model_path)?;
        Ok(Self { session, conf_thresh: 0.3, nms_iou: 0.5 })
    }

    pub fn from_session(session: Session) -> Self {
        Self { session, conf_thresh: 0.3, nms_iou: 0.5 }
    }

    /// Esegue cell detection su un'immagine (di solito il crop di una
    /// regione tabella identificata da PP-DocLayoutV3).
    pub fn detect(&mut self, image: &image::RgbImage) -> Result<Vec<CellBbox>, OcrError> {
        // ── Preprocess letterbox + ImageNet normalize ──────────────────
        let (input_blob, scale) = preprocess(image, CELL_DETECT_INPUT_SIZE);

        let im_shape: Array2<f32> = ndarray::arr2(&[[
            CELL_DETECT_INPUT_SIZE as f32, CELL_DETECT_INPUT_SIZE as f32,
        ]]);
        let scale_factor: Array2<f32> = ndarray::arr2(&[[scale, scale]]);

        // Risolvi i nomi degli input via match-by-name (default ordine
        // canonico Paddle se i nomi non matchano).
        let inputs_meta: Vec<String> = self.session.inputs.iter()
            .map(|i| i.name.clone()).collect();
        if inputs_meta.len() < 3 {
            return Err(OcrError::ModelInput(format!(
                "RT-DETR-L cell det si aspetta ≥3 input, trovati {} ({:?})",
                inputs_meta.len(), inputs_meta,
            )));
        }
        let mut name_im_shape     = inputs_meta[0].clone();
        let mut name_image        = inputs_meta[1].clone();
        let mut name_scale_factor = inputs_meta[2].clone();
        for n in &inputs_meta {
            if n == "im_shape"     { name_im_shape     = n.clone(); }
            if n == "image"        { name_image        = n.clone(); }
            if n == "scale_factor" { name_scale_factor = n.clone(); }
        }

        let outputs = self.session.run(inputs![
            name_im_shape     => Tensor::from_array(im_shape)?,
            name_image        => Tensor::from_array(input_blob)?,
            name_scale_factor => Tensor::from_array(scale_factor)?,
        ]?)?;

        // Output canonical: shape `[N, 6]` Float32 con
        //   [class_id, score, x1, y1, x2, y2]
        let (_, primary) = outputs.iter().next()
            .ok_or_else(|| OcrError::ModelOutput("RT-DETR-L cell det no output".into()))?;
        let (shape_vec, raw) = crate::compat::tensor_extract_with_shape_f32(&primary)?;
        let n = shape_vec[0] as usize;
        let cols = if shape_vec.len() > 1 { shape_vec[1] as usize } else { 0 };
        if cols < 6 {
            return Err(OcrError::ModelOutput(format!(
                "RT-DETR-L cell det output cols={cols} (atteso ≥6)",
            )));
        }
        let (img_w, img_h) = (image.width() as i32, image.height() as i32);
        let mut cells: Vec<CellBbox> = Vec::with_capacity(n);
        for i in 0..n {
            let off = i * cols;
            let class_id = raw[off] as i32;
            let score    = raw[off + 1];
            if score < self.conf_thresh { continue; }
            if class_id < 0 { continue; }
            let x1 = raw[off + 2];
            let y1 = raw[off + 3];
            let x2 = raw[off + 4];
            let y2 = raw[off + 5];
            let left   = (x1.max(0.0) as i32).min(img_w);
            let top    = (y1.max(0.0) as i32).min(img_h);
            let right  = (x2.max(0.0) as i32).min(img_w);
            let bottom = (y2.max(0.0) as i32).min(img_h);
            if right <= left || bottom <= top { continue; }
            cells.push(CellBbox { left, top, right, bottom, score });
        }
        // NMS
        nms(&mut cells, self.nms_iou);
        Ok(cells)
    }
}

/// Letterbox preprocess: resize a `target×target` preservando aspect ratio
/// (pad bottom/right con zeri normalize-space). Ritorna `(blob, scale)`.
/// Identico a `layout::preprocess` (RT-DETR family family).
fn preprocess(image: &image::RgbImage, target_size: u32) -> (Array4<f32>, f32) {
    let (orig_w, orig_h) = (image.width(), image.height());
    let scale = (target_size as f32 / orig_h as f32).min(target_size as f32 / orig_w as f32);
    let new_w = (orig_w as f32 * scale).round() as u32;
    let new_h = (orig_h as f32 * scale).round() as u32;
    let resized = image::imageops::resize(
        image, new_w, new_h, image::imageops::FilterType::Triangle,
    );
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

/// In-place NMS by score DESC, keeps boxes with IoU < `thresh` to higher-scoring.
fn nms(cells: &mut Vec<CellBbox>, thresh: f32) {
    cells.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let mut keep = vec![true; cells.len()];
    for i in 0..cells.len() {
        if !keep[i] { continue; }
        for j in (i + 1)..cells.len() {
            if !keep[j] { continue; }
            if iou(&cells[i], &cells[j]) > thresh { keep[j] = false; }
        }
    }
    let mut idx = 0;
    cells.retain(|_| { let k = keep[idx]; idx += 1; k });
}

fn iou(a: &CellBbox, b: &CellBbox) -> f32 {
    let x_min = a.left.max(b.left);
    let y_min = a.top.max(b.top);
    let x_max = a.right.min(b.right);
    let y_max = a.bottom.min(b.bottom);
    let w = (x_max - x_min).max(0);
    let h = (y_max - y_min).max(0);
    let inter = (w * h) as f32;
    let area_a = (a.width() * a.height()) as f32;
    let area_b = (b.width() * b.height()) as f32;
    let union = area_a + area_b - inter;
    if union <= 0.0 { 0.0 } else { inter / union }
}

// ─── Geometric grid derivation ─────────────────────────────────────────

/// Converte una lista di `CellBbox` (output del detector) in una griglia
/// logica `Vec<Vec<CellBbox>>` (rows × cols), usando clustering centroid-Y
/// per identificare le righe.
///
/// ## Algoritmo
///
/// 1. Sort cells per `cy()` (centroid Y).
/// 2. Calcola la **mediana** dell'altezza cella → `median_h`.
/// 3. `row_threshold = max(median_h * 0.6, 8)`. Due celle finiscono nella
///    stessa riga se il loro `cy` è entro `row_threshold`.
/// 4. Centroid clustering: assegnazione greedy con running mean del cy.
/// 5. Sort righe per centroid Y, sort celle in ogni riga per `left`.
///
/// ## Perché centroid-Y invece di overlap-top/bottom
///
/// Le tabelle reali hanno celle con altezze MOLTO diverse (es. cella con 1
/// linea vs cella con 3 linee accanto). Il vecchio algoritmo basato su
/// overlap richiedeva > 50% intersezione, che falliva su questi casi: la
/// cella corta (1 linea) e quella alta (3 linee) potevano avere overlap
/// < 50% e finire in righe separate, anche se logicamente sono nella
/// stessa riga.
///
/// Il centroid Y è invece **invariante alla altezza**: due celle in righe
/// adiacenti hanno cy diversi di ~`median_h`, mentre due celle nella
/// stessa riga (anche con altezze diverse) hanno cy entro `0.6*median_h`.
///
/// ## Limitazioni
///
/// - Niente colspan/rowspan inference.
/// - Se una cella ha bbox malformato (cell-detector emette frammento di
///   linea invece di cella intera) può comparire come riga "extra" con
///   1-2 cell. Mitigato a `grid_to_gfm` che pad le righe corte alla colonna
///   max della tabella.
pub fn derive_grid(cells: Vec<CellBbox>) -> Vec<Vec<CellBbox>> {
    if cells.is_empty() { return Vec::new(); }
    let mut sorted = cells;
    sorted.sort_by_key(|c| c.cy());

    // Mediana altezza per il threshold di row-clustering.
    let mut hs: Vec<i32> = sorted.iter().map(|c| c.height()).collect();
    hs.sort();
    let median_h = hs.get(hs.len() / 2).copied().unwrap_or(1).max(1);
    let row_threshold = ((median_h as f32) * 0.6).max(8.0) as i32;

    let mut rows: Vec<Vec<CellBbox>> = Vec::new();
    let mut row_centroids: Vec<i32> = Vec::new();
    for cell in sorted {
        let cy = cell.cy();
        let mut placed_idx: Option<usize> = None;
        for (i, &rc) in row_centroids.iter().enumerate() {
            if (cy - rc).abs() < row_threshold {
                placed_idx = Some(i);
                break;
            }
        }
        match placed_idx {
            Some(i) => {
                let n = rows[i].len() as i32;
                rows[i].push(cell);
                // running mean del centroid: aggiorna senza resetta
                row_centroids[i] = (row_centroids[i] * n + cy) / (n + 1);
            }
            None => {
                rows.push(vec![cell]);
                row_centroids.push(cy);
            }
        }
    }

    // Sort righe per centroid Y crescente (top-down reading order).
    let mut indexed: Vec<(Vec<CellBbox>, i32)> = rows.into_iter()
        .zip(row_centroids.into_iter())
        .collect();
    indexed.sort_by_key(|x| x.1);
    let mut result: Vec<Vec<CellBbox>> = indexed.into_iter().map(|(r, _)| r).collect();
    // Sort cells in each row by left (left-right reading order).
    for row in result.iter_mut() {
        row.sort_by_key(|c| c.left);
    }
    result
}

/// Renderizza una griglia di celle come tabella GFM (Markdown).
/// La prima riga viene trattata come header GFM (separator `| --- |`).
///
/// `cell_text(row_idx, col_idx) -> String` è la closure di lookup del
/// contenuto cella. Permette al caller di iniettare il testo OCR-ato per
/// ogni cella senza accoppiare il modulo a una specifica pipeline OCR.
/// Restituire `String::new()` produce cella vuota (rendering scheleton).
///
/// Sanitizzazione del testo cella per GFM:
///   - `|` (pipe) escaped in `\|` per non rompere il rendering
///   - newline interni rimpiazzati con spazio (NER-friendly: una stessa
///     entità non viene spezzata su più righe del MD output)
pub fn grid_to_gfm<F>(grid: &[Vec<CellBbox>], mut cell_text: F) -> String
where
    F: FnMut(usize, usize) -> String,
{
    if grid.is_empty() { return String::new(); }
    let max_cols = grid.iter().map(|r| r.len()).max().unwrap_or(0);
    if max_cols == 0 { return String::new(); }
    let mut out = String::new();
    for (row_idx, row) in grid.iter().enumerate() {
        out.push('|');
        for col_idx in 0..max_cols {
            let txt = if col_idx < row.len() {
                let raw = cell_text(row_idx, col_idx);
                sanitize_cell(&raw)
            } else { String::new() };
            out.push(' ');
            out.push_str(&txt);
            out.push(' ');
            out.push('|');
        }
        out.push('\n');
        // Separator GFM dopo la prima riga (header convention)
        if row_idx == 0 {
            out.push('|');
            for _ in 0..max_cols { out.push_str(" --- |"); }
            out.push('\n');
        }
    }
    out
}

/// Sanitizza il testo di una cella per inserimento in GFM:
/// - escape pipe `|` → `\|`
/// - flatten newline → spazio (preserva continuità per NER)
/// - trim whitespace ai bordi
fn sanitize_cell(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = true; // per skip leading whitespace
    for ch in s.chars() {
        match ch {
            '|' => { out.push('\\'); out.push('|'); prev_space = false; }
            '\n' | '\r' | '\t' => {
                if !prev_space { out.push(' '); prev_space = true; }
            }
            ' ' => {
                if !prev_space { out.push(' '); prev_space = true; }
            }
            c => { out.push(c); prev_space = false; }
        }
    }
    // Trim trailing whitespace
    while out.ends_with(' ') { out.pop(); }
    out
}
