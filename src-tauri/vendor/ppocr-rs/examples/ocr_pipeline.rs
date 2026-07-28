//! Pipeline PP-OCRv6 completa — det + rec + word-level coordinates.
//!
//! Scarica automaticamente i modelli via `ModelHub` (richiede feature `fetch-models`).
//! Carica un TIFF (singola pagina) da `PPOCR_TEST_TIFF` env var o dalla CLI,
//! esegue OCR e stampa testo + coordinate per-parola.
//!
//! Pipeline:
//!   1. `ModelHub` scarica (o riusa dalla cache) det + rec PP-OCRv6.
//!   2. `OcrLite` inizializzato con det + cls (opzionale) + rec.
//!   3. Decodifica pagina TIFF (index 0).
//!   4. `detect_with_options(return_word_box=true)` → stampa righe + word coords.
//!
//! ## Run (ARM64, load-dynamic)
//!
//! ```powershell
//! $env:ORT_DYLIB_PATH = "C:\path\to\onnxruntime.dll"
//! $env:PPOCR_TEST_TIFF = "path\to\document.tiff"
//! cargo run --example ocr_pipeline --features example-dynamic,fetch-models
//! # oppure variante medium:
//! cargo run --example ocr_pipeline --features example-dynamic,fetch-models -- medium
//! ```
//!
//! ## Run (x86_64, ort prebuilt)
//!
//! ```powershell
//! $env:PPOCR_TEST_TIFF = "path\to\document.tiff"
//! cargo run --example ocr_pipeline --features test-binaries,fetch-models -- medium
//! ```

use anyhow::{anyhow, Context, Result};
use image::DynamicImage;
use ppocr_rs::{ModelHub, OcrLite, OcrOptions, PpOcrVersion};
use std::io::BufReader;
use std::path::Path;
use std::time::Instant;
use tiff::decoder::{Decoder, DecodingResult};
use tiff::ColorType as TiffColorType;

/// Scegli la versione passando `tiny`, `small` o `medium` come primo argomento.
fn version_from_args() -> PpOcrVersion {
    match std::env::args().nth(1).as_deref() {
        Some("medium") => PpOcrVersion::V6Medium,
        Some("small")  => PpOcrVersion::V6Small,
        _              => PpOcrVersion::V6Tiny,
    }
}

// Cls model PP-OCRv5 — compatibile con la pipeline PP-OCRv6.
// Non disponibile in ModelHub: usa env var PPOCR_CLS_MODEL per specificare il path.
fn cls_path() -> String {
    std::env::var("PPOCR_CLS_MODEL").unwrap_or_default()
}

// TIFF da processare. Usa CLI arg o env var PPOCR_TEST_TIFF.
fn input_tiff() -> String {
    std::env::args().nth(2)
        .or_else(|| std::env::var("PPOCR_TEST_TIFF").ok())
        .unwrap_or_else(|| {
            eprintln!("Uso: PPOCR_TEST_TIFF=path/to/doc.tiff cargo run --example ocr_pipeline");
            std::process::exit(1);
        })
}

fn main() -> Result<()> {
    let t0 = Instant::now();

    // ── 1. Modelli PP-OCRv6 via ModelHub ─────────────────────────────────────
    let version = version_from_args();
    println!("=== PP-OCRv6 {version:?} — det + rec + word coords ===\n");

    let t = Instant::now();
    let hub   = ModelHub::with_default_cache().context("cache dir")?;
    let paths = hub.ensure(version).context("ModelHub::ensure")?;
    println!("[1] modelli pronti in {:?}", t.elapsed());

    let det_size = std::fs::metadata(&paths.det_onnx).map(|m| m.len()).unwrap_or(0);
    let rec_size = std::fs::metadata(&paths.rec_onnx).map(|m| m.len()).unwrap_or(0);
    let dict_entries = std::fs::read_to_string(&paths.dict_txt)
        .map(|s| s.lines().count())
        .unwrap_or(0);

    println!("    det  : {} ({:.1} MB)", paths.det_onnx.display(), det_size as f64 / 1_048_576.0);
    println!("    rec  : {} ({:.1} MB)", paths.rec_onnx.display(), rec_size as f64 / 1_048_576.0);
    println!("    dict : {} ({} voci)", paths.dict_txt.display(), dict_entries);

    // ── 2. Init OcrLite ──────────────────────────────────────────────────────
    let t = Instant::now();
    let cls = cls_path();
    let mut ocr = OcrLite::new();
    if cls.is_empty() || !Path::new(&cls).exists() {
        eprintln!("[WARN] cls model non trovato — uso init_models_no_angle (set PPOCR_CLS_MODEL)");
        ocr.init_models_no_angle(
            paths.det_onnx.to_str().unwrap(),
            paths.rec_onnx.to_str().unwrap(),
            paths.dict_txt.to_str().unwrap(),
            4,
        ).context("init_models_no_angle")?;
    } else {
        ocr.init_models_with_dict(
            paths.det_onnx.to_str().unwrap(),
            &cls,
            paths.rec_onnx.to_str().unwrap(),
            paths.dict_txt.to_str().unwrap(),
            4,
        ).context("init_models_with_dict")?;
    }
    println!("[2] OcrLite init in {:?}", t.elapsed());

    // ── 3. Decode TIFF — pagina 1 (index 0) ─────────────────────────────────
    let t = Instant::now();
    let tiff = input_tiff();
    let img = decode_tiff_page(&tiff, 0).context("decode TIFF pag.1")?;
    println!("[3] TIFF decoded in {:?}: {}×{} px", t.elapsed(), img.width(), img.height());

    // ── 4. OCR con word-level coordinates ────────────────────────────────────
    let t = Instant::now();
    let result = ocr.detect_with_options(
        &img,
        50,    // padding
        1024,  // max_side_len
        0.5,   // box_score_thresh
        0.3,   // box_thresh
        1.6,   // un_clip_ratio
        true,  // do_angle
        true,  // most_angle
        OcrOptions { return_word_box: true, lang: None, ..OcrOptions::default() },
    ).context("detect_with_options")?;
    let dur = t.elapsed();

    let total_words: usize = result.text_blocks.iter().map(|b| b.words.len()).sum();
    println!(
        "[4] OCR in {:?}: {} line, {} word bbox\n",
        dur, result.text_blocks.len(), total_words
    );

    // ── 5. Stampa ordinato per Y ─────────────────────────────────────────────
    let mut blocks = result.text_blocks;
    blocks.sort_by_key(|b| b.box_points.iter().map(|p| p.y).min().unwrap_or(0));

    for block in &blocks {
        let y_top = block.box_points.iter().map(|p| p.y).min().unwrap_or(0);
        let x_left = block.box_points.iter().map(|p| p.x).min().unwrap_or(0);

        println!(
            "[{:>4},{:>4}] score={:.3}  \"{}\"",
            x_left, y_top, block.text_score, block.text
        );

        // Coordinate per-parola (CTC timestep tracking + inverse warp)
        if block.words.is_empty() {
            println!("             (nessun word bbox — testo verticale o score zero)");
        } else {
            for w in &block.words {
                let wx = w.box_points.iter().map(|p| p.x).min().unwrap_or(0);
                let wy = w.box_points.iter().map(|p| p.y).min().unwrap_or(0);
                let ww = w.box_points.iter().map(|p| p.x).max().unwrap_or(0).saturating_sub(wx);
                let wh = w.box_points.iter().map(|p| p.y).max().unwrap_or(0).saturating_sub(wy);
                println!(
                    "    word [{:>4},{:>4} {:>3}×{:>3}] score={:.3}  \"{}\"",
                    wx, wy, ww, wh, w.score, w.text
                );
            }
        }
    }

    println!("\n{}", "─".repeat(80));
    println!(
        "TOT: {} line  {}  word bbox | {:?}",
        blocks.len(), total_words, t0.elapsed()
    );
    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn decode_tiff_page(path: &str, page_index: usize) -> Result<image::RgbImage> {
    let file = BufReader::new(std::fs::File::open(path)
        .with_context(|| format!("open TIFF: {path}"))?);
    let mut decoder = Decoder::new(file).context("init TIFF decoder")?;
    for _ in 0..page_index {
        if !decoder.more_images() {
            return Err(anyhow!(
                "TIFF ha solo {} pagine, richiesta index {page_index} (0-based)",
                page_index
            ));
        }
        decoder.next_image().context("next TIFF page")?;
    }
    let (w, h) = decoder.dimensions().context("TIFF dimensions")?;
    let color  = decoder.colortype().context("TIFF color type")?;
    let buf    = decoder.read_image().context("read TIFF page")?;
    let dyn_img = match (color, buf) {
        (TiffColorType::Gray(8), DecodingResult::U8(b)) => DynamicImage::ImageLuma8(
            image::ImageBuffer::from_raw(w, h, b).context("Luma8")?),
        (TiffColorType::RGB(8),  DecodingResult::U8(b)) => DynamicImage::ImageRgb8(
            image::ImageBuffer::from_raw(w, h, b).context("RGB8")?),
        (TiffColorType::RGBA(8), DecodingResult::U8(b)) => DynamicImage::ImageRgba8(
            image::ImageBuffer::from_raw(w, h, b).context("RGBA8")?),
        (c, _) => return Err(anyhow!("color type TIFF non gestito: {c:?}")),
    };
    Ok(dyn_img.to_rgb8())
}
