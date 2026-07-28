//! Document unwarping via UVDoc ONNX (PP-StructureV3 / PaddleX).
//!
//! UVDoc rettifica geometricamente immagini di documenti fotografati o
//! scansionati con distorsioni prospettiche / di curvatura.
//!
//! ## Come funziona internamente (PaddleX 3.7)
//!
//! Il modello gestisce internamente la riduzione di risoluzione:
//!
//! ```text
//! input (originale, qualsiasi risoluzione)
//!   → interpolate a [712, 488] per il backbone
//!   → head produce sampling grid a [712, 488]
//!   → grid upsample a dimensioni originali
//!   → grid_sample(input_originale, grid_hires)
//!   → output a dimensioni originali, qualità piena
//! ```
//!
//! **Implicazione**: passare l'immagine all'ONNX SENZA resize preventivo.
//! L'ONNX ha shape dinamica e restituisce output alle stesse dimensioni
//! dell'input, preservando tutta la risoluzione originale.
//!
//! ## Modello
//!
//! `PaddlePaddle/UVDoc_onnx` su HuggingFace (~30 MB).
//! Download via `ModelHub::ensure_single(PpStructureModel::DocUnwarp)`.
//!
//! ## Formati output gestiti
//!
//! Il metodo [`DocUnwarper::unwarp`] rileva automaticamente il formato
//! dell'output ONNX e applica la decodifica corretta:
//!
//! | Shape output      | Interpretazione                                        |
//! |-------------------|--------------------------------------------------------|
//! | `[1, 3, H, W]`    | Immagine rettificata diretta (float32 [0,1])           |
//! | `[1, H, W, 2]`    | Grid campionamento normalizzato in `[-1, 1]`           |
//! | `[1, H*W, 2]`     | Grid flat (H=W=sqrt(N))                                |
//! | `[1, 2, H, W]`    | Campo flusso/offset (CHW layout)                       |
//!
//! ## Preprocessing
//!
//! Solo normalizzazione ImageNet ([0,1] → mean/std): **nessun resize**.
//! Il modello si aspetta l'immagine originale a piena risoluzione.

use crate::ocr_error::OcrError;
use ndarray::{Array, Array4};
use ort::{
    inputs,
    session::{builder::GraphOptimizationLevel, Session},
    value::Tensor,
};
use std::path::Path;

/// Risoluzione interna usata dal backbone UVDoc (PaddleX default).
/// Usato solo come fallback informativo nei log — l'ONNX accetta shape
/// dinamica e opera internamente a questa risoluzione indipendentemente
/// dalla dimensione dell'input passato.
const BACKBONE_INPUT_SIZE: u32 = 488;

// ─── Output type ─────────────────────────────────────────────────────────────

/// Immagine rettificata prodotta da UVDoc.
pub struct UnwarpResult {
    /// Immagine documento rettificata (stessa dimensione dell'input originale).
    pub image: image::RgbImage,
    /// True se il modello ha emesso l'immagine direttamente (senza grid sampling).
    pub is_direct_output: bool,
}

// ─── DocUnwarper ─────────────────────────────────────────────────────────────

/// Wrapper ONNX per UVDoc document unwarping.
pub struct DocUnwarper {
    session: Session,
    /// Abilita la rettificazione. **Default `false`**: quando disabilitato
    /// [`unwarp`] restituisce l'immagine originale invariata senza alcuna
    /// inferenza. Impostare a `true` solo su documenti fotografati/distorti.
    pub enabled: bool,
}

impl DocUnwarper {
    /// Carica il modello da file.
    ///
    /// L'ONNX ha shape dinamica: accetta l'immagine a qualsiasi risoluzione e
    /// restituisce output alle stesse dimensioni. Il backbone interno opera a
    /// ~488×712 indipendentemente dalla risoluzione passata.
    pub fn from_path(model_path: impl AsRef<Path>) -> Result<Self, OcrError> {
        log_backbone_size();
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .commit_from_file(model_path)?;
        Ok(Self { session, enabled: false })
    }

    /// Costruttore da Session pre-caricata.
    pub fn from_session(session: Session) -> Self {
        log_backbone_size();
        Self { session, enabled: false }
    }

    /// Rettifica un'immagine documento distorta.
    ///
    /// Se `self.enabled == false` (default) restituisce l'immagine originale
    /// clonata senza eseguire alcuna inferenza.
    ///
    /// L'immagine di output ha **le stesse dimensioni dell'input originale**:
    /// il modello riduce internamente a ~488×712 per l'estrazione features,
    /// poi upsampling la griglia alle dimensioni originali e applica il
    /// grid_sample sull'immagine originale ad alta risoluzione.
    pub fn unwarp(&self, image: &image::RgbImage) -> Result<UnwarpResult, OcrError> {
        if !self.enabled {
            return Ok(UnwarpResult { image: image.clone(), is_direct_output: true });
        }

        let orig_w = image.width();
        let orig_h = image.height();

        // ── Preprocess: solo normalizzazione, nessun resize ─────────────────
        // Il modello gestisce internamente la riduzione di risoluzione per il
        // backbone e restituisce output alle dimensioni originali.
        let blob = preprocess_normalize_only(image);
        let input_name = self.session.inputs[0].name.clone();

        let outputs = self.session.run(
            inputs![input_name => Tensor::from_array(blob)?]?
        )?;

        let (_, first_out) = outputs.iter().next()
            .ok_or_else(|| OcrError::ModelOutput("UVDoc: nessun output".into()))?;
        let (shape, data) = crate::compat::tensor_extract_with_shape_f32(&first_out)?;

        eprintln!("[UVDoc] input: {orig_w}×{orig_h}  output shape: {shape:?}");

        // ── Interpreta output ───────────────────────────────────────────────
        let result_img = match shape.as_slice() {
            // Immagine rettificata diretta: [1, 3, H, W]
            // H e W devono essere uguali all'input originale (pipeline PaddleX).
            // Se per qualsiasi ragione non coincidono, resize di sicurezza.
            [1, 3, out_h, out_w] => {
                let img = float_chw_to_rgb(&data, *out_h as u32, *out_w as u32);
                if *out_h as u32 == orig_h && *out_w as u32 == orig_w {
                    return Ok(UnwarpResult { image: img, is_direct_output: true });
                }
                // fallback: output a dimensione diversa dall'input (ONNX non standard)
                eprintln!(
                    "[UVDoc] WARN: output {out_w}×{out_h} ≠ originale {orig_w}×{orig_h} \
                     — upsampling con Lanczos3 (perdita qualità)"
                );
                let resized = image::imageops::resize(
                    &img, orig_w, orig_h, image::imageops::FilterType::Lanczos3,
                );
                return Ok(UnwarpResult { image: resized, is_direct_output: true });
            }

            // Sampling grid [1, H, W, 2]: coordinate normalizzate in [-1, 1]
            // Applicato sull'immagine originale → output a dimensioni originali.
            [1, grid_h, grid_w, 2] => {
                let grid: Vec<(f32, f32)> = (0..(*grid_h * *grid_w) as usize)
                    .map(|i| (data[i * 2], data[i * 2 + 1]))
                    .collect();
                // Se la griglia è più piccola dell'originale, interpola prima
                // di applicare (come fa PaddleX con F.interpolate sul bm).
                if *grid_h as u32 != orig_h || *grid_w as u32 != orig_w {
                    let grid_upsampled = upsample_grid(
                        &grid, *grid_w as u32, *grid_h as u32, orig_w, orig_h,
                    );
                    grid_sample_to_rgb(image, &grid_upsampled, orig_w, orig_h)
                } else {
                    grid_sample_to_rgb(image, &grid, *grid_w as u32, *grid_h as u32)
                }
            }

            // Grid flat [1, N, 2]: N = grid_h × grid_w
            [1, n, 2] => {
                let side = (*n as f32).sqrt().round() as u32;
                let grid: Vec<(f32, f32)> = (0..*n as usize)
                    .map(|i| (data[i * 2], data[i * 2 + 1]))
                    .collect();
                let grid_up = upsample_grid(&grid, side, side, orig_w, orig_h);
                grid_sample_to_rgb(image, &grid_up, orig_w, orig_h)
            }

            // Flusso / offset [1, 2, H, W]: sommare alla meshgrid canonica
            [1, 2, out_h, out_w] => {
                let (oh, ow) = (*out_h as usize, *out_w as usize);
                let mut grid: Vec<(f32, f32)> = Vec::with_capacity(oh * ow);
                for y in 0..oh {
                    for x in 0..ow {
                        let cx = (x as f32 / (ow - 1) as f32) * 2.0 - 1.0 + data[x + y * ow];
                        let cy = (y as f32 / (oh - 1) as f32) * 2.0 - 1.0 + data[oh * ow + x + y * ow];
                        grid.push((cx, cy));
                    }
                }
                let grid_up = upsample_grid(&grid, *out_w as u32, *out_h as u32, orig_w, orig_h);
                grid_sample_to_rgb(image, &grid_up, orig_w, orig_h)
            }

            other => {
                return Err(OcrError::ModelOutput(format!(
                    "UVDoc: formato output non riconosciuto: {other:?}"
                )));
            }
        };

        Ok(UnwarpResult { image: result_img, is_direct_output: false })
    }
}

// ─── Preprocessing ────────────────────────────────────────────────────────────

/// Normalizza senza resize. PaddleX divide per 255, nessuna sottrazione mean/std.
/// Il modello UVDoc (sia Paddle che ONNX) opera internamente su [0,1].
fn preprocess_normalize_only(image: &image::RgbImage) -> Array4<f32> {
    let h = image.height() as usize;
    let w = image.width() as usize;
    let mut blob: Array4<f32> = Array::zeros((1, 3, h, w));
    for y in 0..h {
        for x in 0..w {
            let p = image.get_pixel(x as u32, y as u32);
            for c in 0..3usize {
                blob[[0, c, y, x]] = p[c] as f32 / 255.0;
            }
        }
    }
    blob
}

fn log_backbone_size() {
    eprintln!(
        "[UVDoc] backbone interno ~{BACKBONE_INPUT_SIZE}×712 — \
         passare immagine originale senza resize per output ad alta risoluzione"
    );
}

// ─── Output decoding ─────────────────────────────────────────────────────────

/// Campiona `src` secondo la griglia di coordinate normalizzate `grid` usando
/// interpolazione bilineare. Equivalente a `torch.nn.functional.grid_sample`
/// con `mode="bilinear"`, `padding_mode="border"`, `align_corners=True`.
///
/// `grid[i]` = `(x_norm, y_norm)` ∈ `[-1, 1]` dove:
/// - `(-1, -1)` = angolo top-left dell'immagine sorgente
/// - `(+1, +1)` = angolo bottom-right
fn grid_sample_to_rgb(
    src:    &image::RgbImage,
    grid:   &[(f32, f32)],
    out_w:  u32,
    out_h:  u32,
) -> image::RgbImage {
    let src_w = src.width() as f32;
    let src_h = src.height() as f32;
    let mut out = image::RgbImage::new(out_w, out_h);

    for gy in 0..out_h as usize {
        for gx in 0..out_w as usize {
            let (xn, yn) = grid[gy * out_w as usize + gx];

            // Da normalizzato [-1,1] a pixel floating-point
            let sx = (xn + 1.0) * 0.5 * (src_w - 1.0);
            let sy = (yn + 1.0) * 0.5 * (src_h - 1.0);

            let rgb = bilinear_sample(src, sx, sy);
            out.put_pixel(gx as u32, gy as u32, image::Rgb(rgb));
        }
    }
    out
}

#[inline]
fn bilinear_sample(src: &image::RgbImage, sx: f32, sy: f32) -> [u8; 3] {
    let sw = src.width() as i32;
    let sh = src.height() as i32;

    let x0 = sx.floor() as i32;
    let y0 = sy.floor() as i32;
    let x1 = x0 + 1;
    let y1 = y0 + 1;

    let wx1 = sx - sx.floor();
    let wy1 = sy - sy.floor();
    let wx0 = 1.0 - wx1;
    let wy0 = 1.0 - wy1;

    let p00 = get_pixel_clamped(src, x0, y0, sw, sh);
    let p01 = get_pixel_clamped(src, x1, y0, sw, sh);
    let p10 = get_pixel_clamped(src, x0, y1, sw, sh);
    let p11 = get_pixel_clamped(src, x1, y1, sw, sh);

    let mut out = [0u8; 3];
    for c in 0..3 {
        let v = wy0 * (wx0 * p00[c] as f32 + wx1 * p01[c] as f32)
              + wy1 * (wx0 * p10[c] as f32 + wx1 * p11[c] as f32);
        out[c] = v.round().clamp(0.0, 255.0) as u8;
    }
    out
}

#[inline]
fn get_pixel_clamped(img: &image::RgbImage, x: i32, y: i32, w: i32, h: i32) -> image::Rgb<u8> {
    let xc = x.clamp(0, w - 1) as u32;
    let yc = y.clamp(0, h - 1) as u32;
    *img.get_pixel(xc, yc)
}

/// Converte un blob float32 CHW [0,1] in `RgbImage`.
fn float_chw_to_rgb(data: &[f32], h: u32, w: u32) -> image::RgbImage {
    let hw = (h * w) as usize;
    let mut img = image::RgbImage::new(w, h);
    for y in 0..h as usize {
        for x in 0..w as usize {
            let i = y * w as usize + x;
            let r = (data[i].clamp(0.0, 1.0) * 255.0).round() as u8;
            let g = (data[hw + i].clamp(0.0, 1.0) * 255.0).round() as u8;
            let b = (data[2 * hw + i].clamp(0.0, 1.0) * 255.0).round() as u8;
            img.put_pixel(x as u32, y as u32, image::Rgb([r, g, b]));
        }
    }
    img
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Upsampling bilineare di una griglia di coordinate normalizzate da
/// `(src_w × src_h)` a `(dst_w × dst_h)`.
///
/// Equivalente a `F.interpolate(grid, size=(dst_h, dst_w), mode="bilinear")`
/// in PaddleX — usato quando la griglia è a risoluzione ridotta rispetto
/// all'immagine originale.
fn upsample_grid(
    grid: &[(f32, f32)],
    src_w: u32,
    src_h: u32,
    dst_w: u32,
    dst_h: u32,
) -> Vec<(f32, f32)> {
    if src_w == dst_w && src_h == dst_h {
        return grid.to_vec();
    }
    let mut out = Vec::with_capacity((dst_w * dst_h) as usize);
    for dy in 0..dst_h {
        for dx in 0..dst_w {
            // Coordinate nel grid sorgente (floating point)
            let sx = dx as f32 * (src_w - 1) as f32 / (dst_w - 1).max(1) as f32;
            let sy = dy as f32 * (src_h - 1) as f32 / (dst_h - 1).max(1) as f32;

            let x0 = sx.floor() as i32;
            let y0 = sy.floor() as i32;
            let x1 = (x0 + 1).min(src_w as i32 - 1);
            let y1 = (y0 + 1).min(src_h as i32 - 1);
            let wx = sx - sx.floor();
            let wy = sy - sy.floor();

            let idx = |x: i32, y: i32| (y * src_w as i32 + x) as usize;
            let g00 = grid[idx(x0.max(0), y0.max(0))];
            let g10 = grid[idx(x1, y0.max(0))];
            let g01 = grid[idx(x0.max(0), y1)];
            let g11 = grid[idx(x1, y1)];

            let interp = |a: f32, b: f32, c: f32, d: f32| {
                (1.0 - wy) * ((1.0 - wx) * a + wx * b) + wy * ((1.0 - wx) * c + wx * d)
            };
            out.push((interp(g00.0, g10.0, g01.0, g11.0), interp(g00.1, g10.1, g01.1, g11.1)));
        }
    }
    out
}
