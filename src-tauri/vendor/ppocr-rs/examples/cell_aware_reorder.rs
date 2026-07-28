//! Esempio: riordino cell-aware delle line OCR in tabelle multi-colonna.
//!
//! Dimostra l'algoritmo `reorder_cell_aware` che converte l'output raster-scan
//! di PaddleOCR in un ordine row→col coerente (es. per drag-select su tabelle).
//!
//! Pipeline:
//!   1. Decodifica TIFF multi-pagina (path via arg CLI o `PPOCR_TEST_TIFF`).
//!   2. PaddleOCR full-page layout-aware (det+cls+rec + PP-DocLayoutV3).
//!   3. Per ogni `LayoutBox` con `class.semantic() == Table`:
//!      - Crop dell'area → RT-DETR-L cell detection
//!      - `derive_grid` → GFM Markdown (path classico)
//!      - Algoritmo cell-aware: column-cluster + Y-cluster → row-major order
//!   4. Stampa confronto ordine raster vs ordine cell-aware.
//!
//! ## Usage
//!
//! ```powershell
//! $env:ORT_DYLIB_PATH = "C:\path\to\onnxruntime.dll"
//! # Fornire un TIFF multi-pagina con almeno una tabella a griglia:
//! cargo run --example cell_aware_reorder --features example-dynamic -- <tiff_path> [page_index]
//! # Oppure via env var:
//! $env:PPOCR_TEST_TIFF = "path/to/table_document.tiff"
//! $env:PPOCR_TEST_PAGE = "1"   # 0-based
//! cargo run --example cell_aware_reorder --features example-dynamic
//! ```
//!
//! Path modelli: configurabili via env var PPOCR_MODELS_DIR (default: "models/paddleocr").

use anyhow::{anyhow, Context, Result};
use image::{DynamicImage, RgbImage};
use ppocr_rs::{
    derive_grid, grid_to_gfm, CellDetector, LayoutAnalyzer, OcrLite, OcrOptions,
    SemanticClass, TextBlockWithLayout,
};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::time::Instant;
use tiff::decoder::{Decoder, DecodingResult};
use tiff::ColorType as TiffColorType;

fn models_root() -> String {
    std::env::var("PPOCR_MODELS_DIR").unwrap_or_else(|_| "models/paddleocr".to_string())
}

fn tiff_path_from_args() -> PathBuf {
    // Priorità: argomento CLI → env var → errore esplicito
    if let Some(p) = std::env::args().nth(1) {
        return PathBuf::from(p);
    }
    if let Ok(p) = std::env::var("PPOCR_TEST_TIFF") {
        return PathBuf::from(p);
    }
    eprintln!("Uso: cell_aware_reorder <tiff_path> [page_index]");
    eprintln!("     oppure: PPOCR_TEST_TIFF=path/to/doc.tiff  PPOCR_TEST_PAGE=1");
    std::process::exit(1);
}

fn page_index_from_args() -> usize {
    std::env::args().nth(2)
        .or_else(|| std::env::var("PPOCR_TEST_PAGE").ok())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

fn main() -> Result<()> {
    let t_total   = Instant::now();
    let tiff_path = tiff_path_from_args();
    let page_idx  = page_index_from_args();
    let models_root = PathBuf::from(models_root());

    if !tiff_path.is_file() {
        eprintln!("[errore] TIFF non trovato: {}", tiff_path.display());
        std::process::exit(1);
    }

    println!("TIFF: {}  pagina: {}", tiff_path.display(), page_idx);
    let (mut ocr, mut layout, mut cell_det) = init_paddle_pipeline(&models_root)?;

    // gt opzionale: nessun ground-truth path richiesto
    let gt_path = PathBuf::from("");
    run_test_case(&tiff_path, page_idx, &gt_path, &mut ocr, &mut layout, &mut cell_det)?;

    println!("\nDone in {:?}", t_total.elapsed());
    Ok(())
}

fn init_paddle_pipeline(
    models_root: &PathBuf,
) -> Result<(OcrLite, LayoutAnalyzer, CellDetector)> {
    let det_path  = models_root.join("latin/det.onnx");
    let rec_path  = models_root.join("latin/rec_latin.onnx");
    let dict_path = models_root.join("latin/dict_latin.txt");
    let cls_path  = models_root.join("cls/ch_ppocr_mobile_v2.0_cls_infer.onnx");
    let layout_path = models_root.join("layout/PP-DocLayoutV3.onnx");
    let cell_path = models_root.join("table/RT-DETR-L_wired_table_cell_det.onnx");
    for p in [&det_path, &rec_path, &dict_path, &cls_path, &layout_path, &cell_path] {
        if !p.exists() {
            return Err(anyhow!("Modello mancante: {}", p.display()));
        }
    }
    let t = Instant::now();
    let mut ocr = OcrLite::new();
    ocr.init_models_with_dict(
        det_path.to_str().unwrap(),
        cls_path.to_str().unwrap(),
        rec_path.to_str().unwrap(),
        dict_path.to_str().unwrap(),
        4,
    ).context("init paddle det+cls+rec")?;
    println!("[init] det+cls+rec in {:?}", t.elapsed());
    let t = Instant::now();
    let layout = LayoutAnalyzer::from_path(&layout_path).context("init layout analyzer")?;
    println!("[init] PP-DocLayoutV3 in {:?}", t.elapsed());
    let t = Instant::now();
    let cell = CellDetector::from_path(&cell_path).context("init cell detector")?;
    println!("[init] RT-DETR-L cell in {:?}", t.elapsed());
    Ok((ocr, layout, cell))
}

fn run_test_case(
    tiff_path: &PathBuf,
    page_idx:  usize,
    gt_path:   &PathBuf,
    ocr:       &mut OcrLite,
    layout:    &mut LayoutAnalyzer,
    cell_det:  &mut CellDetector,
) -> Result<()> {
    let img = decode_tiff_page(tiff_path, page_idx)?;
    println!(
        "[1] TIFF decoded: page {}, {}×{} px",
        page_idx + 1, img.width(), img.height(),
    );

    // ── 2. Run layout-aware OCR ──────────────────────────────────────
    let t = Instant::now();
    let result = ocr
        .detect_with_layout(
            &img,
            layout,
            50,    // padding
            1024,  // max_side_len
            0.5,   // box_score_thresh
            0.3,   // box_thresh
            1.6,   // un_clip_ratio
            true,  // do_angle
            true,  // most_angle
            OcrOptions { return_word_box: false, lang: None, ..OcrOptions::default() },
        )
        .context("paddle full-page layout-aware OCR")?;
    println!(
        "[2] OCR in {:?}: {} layout boxes, {} text blocks",
        t.elapsed(),
        result.layout_boxes.len(),
        result.blocks.len(),
    );

    // Carica GT (best-effort: se manca, skip comparison).
    let gt_text = std::fs::read_to_string(gt_path).ok();
    if let Some(ref gt) = gt_text {
        println!("[gt] caricato: {} char, {} righe", gt.len(), gt.lines().count());
    } else {
        eprintln!("[gt] NON CARICATO: {}", gt_path.display());
    }

    // ── 3. Per ogni TABLE layout box → cell detection + algoritmi ───
    let mut all_drag_select_lines: Vec<String> = Vec::new();
    for (i, lb) in result.layout_boxes.iter().enumerate() {
        if lb.class.semantic() != SemanticClass::Table {
            continue;
        }
        println!("\n=== TABLE BLOCK #{i} ===");
        println!("Layout bbox: ({}, {}) → ({}, {}) [size {}×{}]",
            lb.x, lb.y, lb.x + lb.w, lb.y + lb.h, lb.w, lb.h);

        // Crop
        let (x0, y0, w, h) = (
            lb.x.max(0) as u32,
            lb.y.max(0) as u32,
            lb.w.max(0) as u32,
            lb.h.max(0) as u32,
        );
        let crop = image::imageops::crop_imm(&img, x0, y0, w, h).to_image();

        // Cell detection
        let t = Instant::now();
        let cells_detected = cell_det.detect(&crop)
            .context("cell detection")?;
        println!("[4a] Cell detection: {} cell(s) in {:?}",
            cells_detected.len(), t.elapsed());

        // derive_grid (path GFM rendering — legacy)
        let grid = derive_grid(cells_detected.clone());
        let n_rows = grid.len();
        let n_cols = grid.iter().map(|r| r.len()).max().unwrap_or(0);
        println!("[4b] derive_grid: {n_rows} rows × {n_cols} cols");

        // Filtra le line OCR di questo block (assigned a layout_index = i)
        let table_blocks: Vec<&TextBlockWithLayout> = result.blocks.iter()
            .filter(|tbl| tbl.layout_index == Some(i))
            .collect();
        println!("[4c] OCR lines in this table: {}", table_blocks.len());

        // ── Stampa ordine RASTER-SCAN originale ─────────────────────
        println!("\n--- ORIGINAL ORDER (PaddleOCR raster scan) ---");
        for (j, tbl) in table_blocks.iter().enumerate() {
            let bb = bbox_from_points(&tbl.block.box_points);
            println!("  [{j:>2}] {:>5},{:<5} {:>5}×{:<5}  '{}'",
                bb.left, bb.top, bb.right - bb.left, bb.bottom - bb.top,
                tbl.block.text);
        }

        // ── Stampa GFM ──────────────────────────────────────────────
        println!("\n--- GFM (derive_grid + cell text from OCR lines) ---");
        let gfm = grid_to_gfm(&grid, |r, c| {
            // Per ogni cell del grid, lookup le line OCR il cui centroid cade dentro.
            // Cell coords sono CROP-relative → convertirle in PAGE coords.
            if r >= grid.len() || c >= grid[r].len() {
                return String::new();
            }
            let cell = &grid[r][c];
            let cl = cell.left  + x0 as i32;
            let ct = cell.top   + y0 as i32;
            let cr = cell.right + x0 as i32;
            let cb = cell.bottom + y0 as i32;
            let mut texts: Vec<&str> = Vec::new();
            for tbl in &table_blocks {
                let bb = bbox_from_points(&tbl.block.box_points);
                let cx = (bb.left + bb.right) / 2;
                let cy = (bb.top  + bb.bottom) / 2;
                if cx >= cl && cx <= cr && cy >= ct && cy <= cb {
                    texts.push(&tbl.block.text);
                }
            }
            texts.join(" ")
        });
        println!("{gfm}");

        // ── Algoritmo NUOVO: cell-aware reorder geometrico ──────────
        println!("\n--- CELL-AWARE REORDER (new algorithm, geometric) ---");
        let cells_aware = reorder_cell_aware(&table_blocks);
        for (cell_idx, cell) in cells_aware.iter().enumerate() {
            for (line_idx, &line_global_idx) in cell.iter().enumerate() {
                let tbl = &table_blocks[line_global_idx];
                let prefix = if line_idx == 0 {
                    format!("CELL[{cell_idx:>2}]:")
                } else {
                    "        ".to_string()
                };
                println!("  {prefix} '{}'", tbl.block.text);
            }
        }

        // ── Drag-select simulation: concatena cell-by-cell con \n ───
        println!("\n--- SIMULATED DRAG-SELECT OUTPUT ---");
        for cell in &cells_aware {
            for &i in cell {
                let line = table_blocks[i].block.text.clone();
                println!("{}", line);
                all_drag_select_lines.push(line);
            }
        }
    }

    // ── 4. Confronto vs ground truth ────────────────────────────────
    if let Some(gt) = gt_text {
        println!("\n=== GROUND TRUTH COMPARISON ===");
        compare_vs_ground_truth(&all_drag_select_lines, &gt);
    }

    Ok(())
}

/// Confronta l'output del drag-select cell-aware con il ground truth.
/// La GT è quasi raster scan (PDF copy-paste), il drag-select è
/// cell-by-cell. Allineamento esatto non è atteso ma vogliamo verificare:
///   - Tutte le entità GT presenti nel drag-select (recall)
///   - Nessuna concatenazione cross-cell errata (es. 'Mario Rossi
///     Rappresentante Logistica' invece di 'Mario Rossi' + 'Rappresentante'
///     + 'Logistica' separati)
fn compare_vs_ground_truth(drag_select: &[String], gt: &str) {
    // GT entries (line per line, trim).
    let gt_lines: Vec<String> = gt.lines()
        .map(|l| l.trim().trim_start_matches(|c: char| c == '●' || c.is_whitespace() || c == '*').trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let drag_set: std::collections::HashSet<&str> = drag_select.iter().map(|s| s.as_str()).collect();

    let mut hits = 0usize;
    let mut misses: Vec<&str> = Vec::new();
    for gtl in &gt_lines {
        // Match esatto se la GT line è una sola token-cella.
        // Match per substring se la GT line ha più token (raster scan
        // concat di più cell sulla stessa Y).
        if drag_set.contains(gtl.as_str()) {
            hits += 1;
        } else {
            // Prova match parziale: la GT line potrebbe essere "Mario Rossi  Rappresentante"
            // (col1 + col2 line1 della stessa riga). Splittiamo per double-space e
            // verifichiamo che ogni token sia nel drag-select.
            let tokens: Vec<&str> = gtl.split("  ").map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            if tokens.len() > 1 && tokens.iter().all(|t| drag_set.contains(*t)) {
                hits += 1;
            } else {
                misses.push(gtl.as_str());
            }
        }
    }
    println!("GT lines: {}, drag-select lines: {}", gt_lines.len(), drag_select.len());
    println!("Match: {}/{} ({:.0}%)", hits, gt_lines.len(),
        (hits as f32 / gt_lines.len() as f32) * 100.0);
    if !misses.is_empty() {
        println!("Missing in drag-select ({}):", misses.len());
        for m in &misses {
            println!("  - {m:?}");
        }
    }
}

/// Bbox axis-aligned (i32) — utility ad-hoc per l'example.
#[derive(Debug, Clone, Copy)]
struct AABB { left: i32, top: i32, right: i32, bottom: i32 }

fn bbox_from_points(points: &[ppocr_rs::Point]) -> AABB {
    if points.is_empty() {
        return AABB { left: 0, top: 0, right: 0, bottom: 0 };
    }
    let xs: Vec<i32> = points.iter().map(|p| p.x as i32).collect();
    let ys: Vec<i32> = points.iter().map(|p| p.y as i32).collect();
    AABB {
        left:   *xs.iter().min().unwrap(),
        top:    *ys.iter().min().unwrap(),
        right:  *xs.iter().max().unwrap(),
        bottom: *ys.iter().max().unwrap(),
    }
}

/// Algoritmo cell-aware reorder operante DIRETTAMENTE sulle line OCR
/// (PaddleOCR text-blocks) di un layout-box tabella. Produce un Vec di
/// "celle logiche" — ognuna è un Vec di indici nel `table_blocks` slice
/// originale — in ordine row-major (top-to-bottom, left-to-right).
///
/// Parametri impliciti (heuristic):
///   - col_threshold = 4 × median_h: separa colonne ben distanti
///   - cell_threshold = 1.8 × median_h: chained linkage Y intra-colonna,
///     unisce line consecutive nella stessa cella visiva multi-line
///   - row_threshold = 2 × median_h: cluster delle CELL_CY in righe
///
/// Ritorna `Vec<Vec<line_idx>>` in ordine emit (cell-by-cell row-major).
fn reorder_cell_aware(blocks: &[&TextBlockWithLayout]) -> Vec<Vec<usize>> {
    let n = blocks.len();
    if n == 0 { return Vec::new(); }

    // Pre-compute centroidi e altezze.
    let bbs: Vec<AABB> = blocks.iter().map(|b| bbox_from_points(&b.block.box_points)).collect();
    let cx: Vec<i32> = bbs.iter().map(|b| (b.left + b.right) / 2).collect();
    let cy: Vec<i32> = bbs.iter().map(|b| (b.top  + b.bottom) / 2).collect();
    let mut hs: Vec<i32> = bbs.iter().map(|b| b.bottom - b.top).collect();
    hs.sort();
    let median_h = (*hs.get(hs.len() / 2).unwrap_or(&20)).max(8);

    // Step 1: cluster lines in COLONNE per X-centroid.
    let col_threshold = (median_h * 4).max(40);
    let mut col_of: Vec<usize> = vec![0; n];
    let mut col_cx: Vec<i32>    = Vec::new();
    let mut col_count: Vec<i32> = Vec::new();
    let mut order_x: Vec<usize> = (0..n).collect();
    order_x.sort_by_key(|&i| cx[i]);
    for &i in &order_x {
        let x = cx[i];
        match col_cx.iter().position(|&v| (x - v).abs() < col_threshold) {
            Some(c) => {
                col_of[i] = c;
                col_cx[c] = (col_cx[c] * col_count[c] + x) / (col_count[c] + 1);
                col_count[c] += 1;
            }
            None => {
                col_of[i] = col_cx.len();
                col_cx.push(x);
                col_count.push(1);
            }
        }
    }
    let n_cols = col_cx.len();
    eprintln!("[reorder] median_h={median_h}, col_threshold={col_threshold}, n_cols={n_cols}");

    // Step 2: per ogni colonna, cluster lines in CELLE per Y-centroid.
    // Chained linkage: confronta ogni nuovo Y con il precedente del cluster.
    //
    // **Threshold critico** = ~1.2 × median_h:
    //   - Inter-line gap intra-cell tipicamente ≈ 0.9 × median_h (next-line
    //     baseline). Threshold > 0.9 → merge multi-line cell ✓
    //   - Inter-row gap (cella → cella sotto) tipicamente ≈ 1.5-2 × median_h.
    //     Threshold < 1.5 → split fra righe ✓
    //   - 1.8 era troppo largo: collassava colonne intere in 1 cella.
    //   - 1.0-1.3 è il sweet spot per tabelle business standard.
    let cell_threshold = ((median_h as f32) * 1.2) as i32;
    let cell_threshold = cell_threshold.max(12);
    eprintln!("[reorder] cell_threshold={cell_threshold}");

    let mut cells: Vec<Vec<usize>> = Vec::new();
    let mut cell_cy:   Vec<i32> = Vec::new();
    let mut cell_left: Vec<i32> = Vec::new();
    for c in 0..n_cols {
        let mut col_indices: Vec<usize> = (0..n).filter(|&i| col_of[i] == c).collect();
        col_indices.sort_by_key(|&i| cy[i]);

        let mut current: Vec<usize> = Vec::new();
        let mut last_cy: Option<i32> = None;
        for i in col_indices {
            let yi = cy[i];
            let join = matches!(last_cy, Some(prev) if (yi - prev).abs() < cell_threshold);
            if join {
                current.push(i);
                last_cy = Some(yi);
            } else {
                flush_cell(&mut current, &cy, &bbs, &mut cells, &mut cell_cy, &mut cell_left);
                current = vec![i];
                last_cy = Some(yi);
            }
        }
        flush_cell(&mut current, &cy, &bbs, &mut cells, &mut cell_cy, &mut cell_left);
    }
    eprintln!("[reorder] {} celle dopo X+Y clustering", cells.len());

    // Step 3: cluster CELLE in RIGHE per Y-centroid del cell-mean.
    //
    // Threshold = 1.5 × median_h: separa righe ben distanziate ma tollera
    // celle multi-line con cy spostato. Caso reale tabella firmatari:
    //   - Header cells cy ≈ 2293
    //   - Row 1 'Mario Rossi' cy=2431 → diff 138 dal header
    //   - Threshold 2.0×median_h=140 catturava Mario Rossi nel header (BUG)
    //   - Threshold 1.5×median_h=105 separa correttamente.
    let row_threshold = ((median_h as f32) * 1.5) as i32;
    let row_threshold = row_threshold.max(10);
    eprintln!("[reorder] row_threshold={row_threshold}");
    let mut row_of: Vec<usize>    = vec![0; cells.len()];
    let mut row_cy: Vec<i32>      = Vec::new();
    let mut row_count: Vec<i32>   = Vec::new();
    let mut cell_order_y: Vec<usize> = (0..cells.len()).collect();
    cell_order_y.sort_by_key(|&i| cell_cy[i]);
    for &i in &cell_order_y {
        let y = cell_cy[i];
        match row_cy.iter().position(|&v| (y - v).abs() < row_threshold) {
            Some(r) => {
                row_of[i] = r;
                row_cy[r] = (row_cy[r] * row_count[r] + y) / (row_count[r] + 1);
                row_count[r] += 1;
            }
            None => {
                row_of[i] = row_cy.len();
                row_cy.push(y);
                row_count.push(1);
            }
        }
    }
    let n_rows = row_cy.len();
    eprintln!("[reorder] n_rows={n_rows}");

    // Step 4: emit cells in row-major order (rows by cy asc, cells in row by left asc).
    let mut row_rank: Vec<usize> = (0..n_rows).collect();
    row_rank.sort_by_key(|&r| row_cy[r]);

    let mut emitted: Vec<Vec<usize>> = Vec::new();
    for &row_idx in &row_rank {
        let mut cells_in_row: Vec<usize> = (0..cells.len())
            .filter(|&i| row_of[i] == row_idx)
            .collect();
        cells_in_row.sort_by_key(|&i| cell_left[i]);
        for cell_idx in cells_in_row {
            let mut idxs = std::mem::take(&mut cells[cell_idx]);
            if idxs.is_empty() { continue; }
            idxs.sort_by_key(|&i| bbs[i].top);
            emitted.push(idxs);
        }
    }
    emitted
}

fn flush_cell(
    current:   &mut Vec<usize>,
    cy:        &[i32],
    bbs:       &[AABB],
    cells:     &mut Vec<Vec<usize>>,
    cell_cy:   &mut Vec<i32>,
    cell_left: &mut Vec<i32>,
) {
    if current.is_empty() { return; }
    let avg_cy = current.iter().map(|&i| cy[i]).sum::<i32>() / (current.len() as i32);
    let min_l  = current.iter().map(|&i| bbs[i].left).min().unwrap_or(0);
    cells.push(std::mem::take(current));
    cell_cy.push(avg_cy);
    cell_left.push(min_l);
}

// ── TIFF page decoding ──────────────────────────────────────────────────

fn decode_tiff_page(path: &PathBuf, page_index: usize) -> Result<RgbImage> {
    let file = BufReader::new(File::open(path).context("open TIFF")?);
    let mut decoder = Decoder::new(file).context("init TIFF decoder")?;
    for _ in 0..page_index {
        if !decoder.more_images() {
            return Err(anyhow!(
                "TIFF ha solo {} pagine, richiesta page {} (0-based)",
                page_index, page_index
            ));
        }
        decoder.next_image().context("next TIFF page")?;
    }
    let (w, h) = decoder.dimensions().context("TIFF dimensions")?;
    let color = decoder.colortype().context("TIFF color type")?;
    let buf = decoder.read_image().context("read TIFF page")?;
    let dyn_img = match (color, buf) {
        (TiffColorType::Gray(8), DecodingResult::U8(b)) => DynamicImage::ImageLuma8(
            image::ImageBuffer::from_raw(w, h, b).context("build Luma8")?
        ),
        (TiffColorType::RGB(8), DecodingResult::U8(b)) => DynamicImage::ImageRgb8(
            image::ImageBuffer::from_raw(w, h, b).context("build RGB8")?
        ),
        (TiffColorType::RGBA(8), DecodingResult::U8(b)) => DynamicImage::ImageRgba8(
            image::ImageBuffer::from_raw(w, h, b).context("build RGBA8")?
        ),
        (c, _) => return Err(anyhow!("TIFF color type non gestito: {c:?}")),
    };
    Ok(dyn_img.to_rgb8())
}
