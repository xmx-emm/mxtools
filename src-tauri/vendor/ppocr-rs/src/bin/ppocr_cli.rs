//! ppocr-cli — interfaccia subprocess JSON per integrazione con pipeline esterne.
//!
//! ## Usage
//!
//! ```
//! ppocr-cli <image_path>
//! ```
//!
//! Processa una singola immagine (PNG, JPEG, TIFF singola pagina) attraverso
//! l'intera pipeline:
//!   1. DocOrientationClassifier (PP-LCNet 224×224, 4 classi)
//!   2. Rotazione immagine al canonical upright
//!   3. PP-DocLayoutV3 (25 classi, reading-order)
//!   4. PP-OCRv6 det + rec con word-level bboxes
//!
//! Output: JSON su stdout.  Errori su stderr.
//!
//! ## Env vars
//!
//! | Variabile            | Default                            | Descrizione                           |
//! |----------------------|------------------------------------|---------------------------------------|
//! | `ORT_DYLIB_PATH`     | —                                  | Path onnxruntime.dll (ARM64 / dynamic)|
//! | `PPOCR_LAYOUT_MODEL` | `$PPOCR_MODELS_DIR/layout/PP-DocLayoutV3.onnx` | Path modello layout |
//! | `PPOCR_ORI_MODEL`    | ModelHub cache auto-download       | Path `inference.onnx` doc-orientation |
//! | `PPOCR_MODELS_DIR`   | `models/paddleocr`                 | Dir base modelli external             |
//! | `PPOCR_TIER`         | `tiny`                             | `tiny` / `small` / `medium`           |
//! | `PPOCR_NUM_THREADS`  | `4`                                | Thread inference ONNX                 |
//!
//! ## Output JSON
//!
//! ```json
//! {
//!   "page_angle": 90,
//!   "page_width": 2480,
//!   "page_height": 3508,
//!   "layout_boxes": [
//!     { "class": "Text", "semantic": "Text",
//!       "x1": 120, "y1": 200, "x2": 900, "y2": 420,
//!       "reading_order": 0 }
//!   ],
//!   "words": [
//!     { "text": "Ciao", "x1": 120, "y1": 205, "x2": 210, "y2": 240,
//!       "confidence": 0.97, "layout_idx": 0 }
//!   ]
//! }
//! ```
//!
//! `layout_idx` è l'indice in `layout_boxes`; `-1` se nessuna regione associata.
//! Quando `return_word_box` è attivo ma una linea non ha word bbox (testo
//! verticale o linee molto corte), il testo dell'intera linea viene emesso
//! come una singola entry word con bbox della linea.

use ppocr_rs::{
    DocOrientation, DocOrientationClassifier, LayoutAnalyzer,
    ModelHub, OcrLite, OcrOptions, Point, PpOcrVersion, PpStructureModel,
};
use serde::Serialize;
use std::path::PathBuf;

// ─── Strutture JSON output ────────────────────────────────────────────────────

#[derive(Serialize)]
struct CliOutput {
    page_angle:   u32,
    page_width:   u32,
    page_height:  u32,
    layout_boxes: Vec<CliLayoutBox>,
    words:        Vec<CliWord>,
}

#[derive(Serialize)]
struct CliLayoutBox {
    /// Nome classe PP-DocLayoutV3 (es. "Text", "Table", "Figure", …)
    class:         String,
    /// Categoria semantica semplificata (es. "Text", "Table", "Title", …)
    semantic:      String,
    x1: u32, y1: u32, x2: u32, y2: u32,
    /// Ordine di lettura dal modello; -1 se non disponibile.
    reading_order: i32,
}

#[derive(Serialize)]
struct CliWord {
    text:       String,
    x1: u32, y1: u32, x2: u32, y2: u32,
    /// Confidence CTC [0.0, 1.0].
    confidence: f32,
    /// Indice in `layout_boxes`; -1 se nessuna regione assegnata.
    layout_idx: i32,
}

// ─── Entry point ─────────────────────────────────────────────────────────────

fn main() {
    if let Err(e) = run() {
        eprintln!("[ppocr-cli] {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    // ── Argomenti ─────────────────────────────────────────────────────────
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 || args[1] == "--help" || args[1] == "-h" {
        print_help();
        std::process::exit(0);
    }
    let img_path = &args[1];

    // ── Carica immagine ───────────────────────────────────────────────────
    let img = image::open(img_path)
        .map_err(|e| format!("apertura immagine {img_path:?}: {e}"))?
        .to_rgb8();

    // ── Configurazione ────────────────────────────────────────────────────
    let tier = match std::env::var("PPOCR_TIER").as_deref() {
        Ok("small")  => PpOcrVersion::V6Small,
        Ok("medium") => PpOcrVersion::V6Medium,
        _            => PpOcrVersion::V6Tiny,
    };
    let num_threads: usize = std::env::var("PPOCR_NUM_THREADS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(4);

    // ── Modelli via ModelHub (con override env var) ───────────────────────
    let hub      = ModelHub::with_default_cache()?;
    let ocr_p    = hub.ensure(tier)?;
    let ori_path = ori_model_path(&hub)?;
    let lay_path = layout_model_path();

    if !lay_path.exists() {
        return Err(format!(
            "PP-DocLayoutV3.onnx non trovato: {} \
             (set PPOCR_LAYOUT_MODEL o PPOCR_MODELS_DIR)",
            lay_path.display()
        ).into());
    }

    // ── Step 1: orientamento pagina ───────────────────────────────────────
    // Viene eseguito PRIMA di detect_with_layout in modo che layout e word
    // bbox condividano lo stesso spazio di coordinate (immagine upright).
    let ori_clf = DocOrientationClassifier::from_path(&ori_path)?;
    let (orient, _conf) = ori_clf.classify(&img)?;
    let page_angle = orient.degrees();
    let upright    = rotate_to_upright(img, orient);
    let (out_w, out_h) = upright.dimensions();

    // ── Step 2: OcrLite ──────────────────────────────────────────────────
    let mut ocr = OcrLite::new();
    ocr.init_models_no_angle(
        ocr_p.det_onnx.to_str().unwrap(),
        ocr_p.rec_onnx.to_str().unwrap(),
        ocr_p.dict_txt.to_str().unwrap(),
        num_threads,
    )?;

    // ── Step 3: LayoutAnalyzer ────────────────────────────────────────────
    let mut layout = LayoutAnalyzer::from_path(&lay_path)?;

    // ── Step 4: pipeline layout-aware OCR ────────────────────────────────
    let opts = OcrOptions {
        return_word_box:     true,
        use_doc_orientation: false, // già corretto al passo 1
        ..OcrOptions::default()
    };
    let result = ocr.detect_with_layout(
        &upright, &mut layout,
        10, 960, 0.6, 0.3, 1.6,
        false, // do_angle  (per-line cls disabilitato, word_box funziona meglio)
        false, // most_angle
        opts,
    )?;

    // ── Build output ──────────────────────────────────────────────────────
    let layout_boxes: Vec<CliLayoutBox> = result.layout_boxes.iter().map(|lb| {
        CliLayoutBox {
            class:         format!("{:?}", lb.class),
            semantic:      format!("{:?}", lb.class.semantic()),
            x1: lb.xmin(), y1: lb.ymin(),
            x2: lb.xmax(), y2: lb.ymax(),
            reading_order: lb.reading_order,
        }
    }).collect();

    let mut words: Vec<CliWord> = Vec::new();
    for blk in &result.blocks {
        let layout_idx = blk.layout_index.map(|i| i as i32).unwrap_or(-1);

        if blk.block.words.is_empty() {
            // Word bbox non disponibili (testo verticale o linea troppo corta):
            // emetti l'intera linea come singola entry.
            let (x1, y1, x2, y2) = aabb_points(&blk.block.box_points);
            words.push(CliWord {
                text: blk.block.text.clone(),
                x1, y1, x2, y2,
                confidence: blk.block.text_score,
                layout_idx,
            });
        } else {
            for w in &blk.block.words {
                let (x1, y1, x2, y2) = aabb_points(&w.box_points);
                words.push(CliWord {
                    text: w.text.clone(),
                    x1, y1, x2, y2,
                    confidence: w.score,
                    layout_idx,
                });
            }
        }
    }

    let output = CliOutput {
        page_angle, page_width: out_w, page_height: out_h,
        layout_boxes, words,
    };
    println!("{}", serde_json::to_string(&output)?);
    Ok(())
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/// Ruota l'immagine in modo che il testo risulti orizzontale (upright).
fn rotate_to_upright(img: image::RgbImage, orient: DocOrientation) -> image::RgbImage {
    match orient {
        DocOrientation::Deg0   => img,
        DocOrientation::Deg90  => image::imageops::rotate270(&img),
        DocOrientation::Deg180 => image::imageops::rotate180(&img),
        DocOrientation::Deg270 => image::imageops::rotate90(&img),
    }
}

/// Calcola AABB (axis-aligned bounding box) da un quadrilatero di Points.
fn aabb_points(pts: &[Point]) -> (u32, u32, u32, u32) {
    let x1 = pts.iter().map(|p| p.x).min().unwrap_or(0);
    let y1 = pts.iter().map(|p| p.y).min().unwrap_or(0);
    let x2 = pts.iter().map(|p| p.x).max().unwrap_or(0);
    let y2 = pts.iter().map(|p| p.y).max().unwrap_or(0);
    (x1, y1, x2, y2)
}

/// Path del modello doc-orientation da env var (`PPOCR_ORI_MODEL`) o ModelHub.
fn ori_model_path(hub: &ModelHub) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Ok(p) = std::env::var("PPOCR_ORI_MODEL") {
        return Ok(PathBuf::from(p));
    }
    let paths = hub.ensure_single(PpStructureModel::DocOrientation)?;
    Ok(paths.onnx)
}

/// Path del modello PP-DocLayoutV3 da env var o fallback.
fn layout_model_path() -> PathBuf {
    if let Ok(p) = std::env::var("PPOCR_LAYOUT_MODEL") {
        return PathBuf::from(p);
    }
    let base = std::env::var("PPOCR_MODELS_DIR")
        .unwrap_or_else(|_| "models/paddleocr".to_string());
    PathBuf::from(base).join("layout").join("PP-DocLayoutV3.onnx")
}

fn print_help() {
    eprintln!("ppocr-cli <image_path>");
    eprintln!();
    eprintln!("Env vars:");
    eprintln!("  ORT_DYLIB_PATH      path a onnxruntime.dll (ARM64 / load-dynamic)");
    eprintln!("  PPOCR_LAYOUT_MODEL  path completo PP-DocLayoutV3.onnx");
    eprintln!("  PPOCR_ORI_MODEL     path completo orientation inference.onnx (default: ModelHub)");
    eprintln!("  PPOCR_MODELS_DIR    dir base modelli (default: models/paddleocr)");
    eprintln!("  PPOCR_TIER          tiny|small|medium (default: tiny)");
    eprintln!("  PPOCR_NUM_THREADS   thread inference (default: 4)");
}
