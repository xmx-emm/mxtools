# ppocr-rs

> Pure-Rust OCR pipeline — PP-OCRv6 (50 lingue) + PP-DocLayoutV3 +
> RT-DETR-L Table Cell Detection + SLANet_plus Table Structure +
> PP-LCNet Doc Orientation, su `ort 2.0.0-rc.9` (ONNX Runtime).

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-blue.svg)](#)
[![Rust 2021](https://img.shields.io/badge/Rust-2021-orange.svg)](https://www.rust-lang.org/)

Crate name: **`ppocr-rs`**. Maintained by [dariofinardi](https://github.com/dariofinardi)
under Apache-2.0.

---

## Overview

Pipeline OCR documentale completa, puro Rust, **senza dipendenze di sistema**
(no OpenCV, no Python, no PaddlePaddle). Tutto il runtime è in-process via
[`ort`](https://crates.io/crates/ort) (ONNX Runtime bindings). È il backend
OCR di [Pseudo-Edge](https://github.com/dariofinardi/Pseudo-Edge).

### Key features

- **Page orientation correction** — PP-LCNet_x1_0_doc_ori_onnx, 4 classi
  (0°/90°/180°/270°). Rileva e corregge automaticamente scansioni ruotate.
  **Abilitato per default** via `OcrOptions::default()`. Richiede
  `set_doc_orientation_model()` su `OcrLite`; senza modello, il flag è ignorato
  silenziosamente.
- **Text detection** — DBNet (PP-OCRv6 / PP-OCRv5), multi-oriented, any aspect ratio.
- **Text recognition** — PPLCNetV4 + LightSVTR + CTC/NRTR multi-head.
  - **PP-OCRv6** (default): **50 lingue** in un unico modello — CH / EN / JP + 46 Latin
    (IT, FR, DE, ES, PT, e altri 41). Tre tier: `tiny` (6 MB), `small`, `medium`.
  - **PP-OCRv5 Latin** (legacy): 6 EU languages, modello separato.
- **Per-line orientation classifier** — 0°/180° per-line (PP-OCRv2 cls).
- **Layout analysis** — PP-DocLayoutV3, 25 classi semantiche (testo, titolo, tabella,
  figura, header, footer, formula, list-item, …).
- **Table structure recognition** — SLANet_plus (488×488), output HTML token stream
  → cell bounding box → GFM Markdown. Utilizzato con `TableStructureRecognizer`.
- **Table cell detection** — RT-DETR-L (wired + wireless), griglia geometrica → GFM Markdown.
- **Word-level boxes** — CTC timestep tracking → per-word bbox (highlight / hit-test).
- **Auto-download modelli** — `ModelHub` scarica i pesi ONNX da HuggingFace al
  primo utilizzo e li conserva in cache locale.
- **Cross-platform** — Windows (x86_64 + ARM64), macOS (Intel + Apple Silicon), Linux.

---

## Performance (release build, ARM64 Snapdragon X Elite)

Misurato su 6 pagine PDF (2 documenti: paper A4 + IEEE template con tabelle e rotazioni):

| Fase | Tempo medio/pag |
|---|---|
| PDF→PNG (pdftoppm 200 DPI) | ~1400ms |
| Page orientation (PP-LCNet) | incluso in OCR |
| Layout (PP-DocLayoutV3) | **~820ms** |
| OCR (PP-OCRv6 tiny det+rec) | **~1800ms** |
| Table structure (SLANet_plus) | **~18ms/tabella** |
| **Totale pipeline/pag** | **~2.6s** |

> Build debug: layout ~3300ms, OCR ~20000ms — speedup release ~6-12×.

---

## Pipeline

```
Input image
    │
    ▼
┌──────────────────────────┐
│  PP-LCNet doc_ori        │  → rileva rotazione (0/90/180/270°)
│  (se use_doc_orientation)│    ruota l'immagine prima dell'OCR
└──────────┬───────────────┘    OcrResult.page_angle = gradi corretti
           │
           ▼
┌─────────────────┐
│  DBNet (det)    │  → text polygon boxes
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Cls (orient.)  │  → flip lines 180° se ruotate (per-line)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  PPLCNetV4 + SVTR-CTC (rec)     │  → stringhe + confidence (50 lingue)
└────────┬────────────────────────┘
         │
         ├────►  Plain OCR result: Vec<TextBlock>
         │
         │  (path layout-aware opzionale:)
         ▼
┌─────────────────────┐
│ PP-DocLayoutV3      │  → 25-class regions w/ reading order
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  XY-Cut / sort      │  → TextBlock taggati per SemanticClass
└────────┬────────────┘
         │  (per regioni Table:)
         ├──────────────────────────────────────┐
         ▼                                      ▼
┌─────────────────────┐              ┌──────────────────────┐
│ SLANet_plus         │              │ RT-DETR-L cell det   │
│ (table structure)   │              │ (wired / wireless)   │
└────────┬────────────┘              └──────────┬───────────┘
         │ HTML token stream                    │ cell bbox
         ▼                                      ▼
┌─────────────────────┐              ┌──────────────────────┐
│ cell_boxes + OCR    │              │ derive_grid (geom.)  │
│ → GFM Markdown      │              │ → GFM Markdown       │
└─────────────────────┘              └──────────────────────┘
```

---

## Crate layout

```
src/
├── lib.rs               — public re-exports + module overview
├── model_hub.rs         — auto-download ONNX da HuggingFace (feature fetch-models)
├── ocr_lite.rs          — OcrLite orchestrator (det + cls + rec + doc_orientation)
├── db_net.rs            — DBNet text detection (vendored da paddle-ocr-rs)
├── crnn_net.rs          — PPLCNetV4/SVTR recognition (vendored)
├── angle_net.rs         — Per-line orientation classifier (vendored)
├── ocr_utils.rs         — Image preprocessing, perspective warp (vendored)
├── scale_param.rs       — Resize-to-multiple-of-32 (vendored)
├── ocr_result.rs        — DTOs (TextBox, TextLine, OcrResult, WordBox)
├── ocr_error.rs         — Error type unificato via thiserror
├── compat.rs            — Shim permanente ort rc.9 vs rc.11 API
│
│   Aggiunto in questo fork (non in paddle-ocr-rs upstream):
├── layout.rs            — PP-DocLayoutV3 (RT-DETR-style) layout analyzer + XY-Cut
├── cell_detection.rs    — RT-DETR-L cell detector + derive_grid → GFM helper
├── table_classifier.rs  — PP-LCNet: TableTypeClassifier (wired/wireless) +
│                          DocOrientationClassifier (0/90/180/270°)
├── table_structure.rs   — SLANet_plus / SLANeXt table structure recognizer
│                          → HTML token stream → TableCellBox → GFM Markdown
├── doc_unwarp.rs        — UVDoc document unwarping (reserved, enabled=false)
└── formula_rec.rs       — PP-FormulaNet-plus-L LaTeX recognition (reserved)

tests/
├── compat_pp_ocrv6.rs   — Smoke test compatibilità PP-OCRv6 × ort rc.9
├── pipeline_layout.rs   — Layout + OCR + XY-Cut su TIFF multi-pagina (CER metric)
├── table_pipeline.rs    — Table detection + SLANet_plus decode su TIFF
└── art_pipeline.rs      — Pipeline end-to-end su PDF (pdftoppm + orient + layout
                           + OCR + table structure); benchmarking release vs debug

examples/
├── rogito_v6.rs         — OCR PP-OCRv6 su rogito notarile scansionato
└── cell_aware_reorder.rs — Pipeline completa + cell-aware reordering
```

---

## Modelli — PP-OCRv6 (default)

PP-OCRv6 è disponibile su HuggingFace in tre tier. I modelli ONNX sono
scaricabili via `ModelHub::ensure()` oppure manualmente.

### Tier disponibili

| Tier    | det.onnx | rec.onnx | Totale | Lingue |
|---------|----------|----------|--------|--------|
| `Tiny`  | 1.8 MB   | 4.5 MB   | **~6 MB** | 50  |
| `Small` | ~6 MB    | ~20 MB   | ~26 MB | 50   |
| `Medium`| 62 MB    | 77 MB    | ~139 MB | 50  |

Per deployment su ARM64 Snapdragon X Elite si consiglia **`Tiny`** come
punto di partenza (verifica i benchmark sulla tua macchina prima di scegliere).

### Architettura PP-OCRv6

**Detection** (`PP-OCRv6_{tiny|small|medium}_det`):
- Backbone: `PPLCNetV4` (unified, nuovo in v6)
- Neck: `RepLKPAN` (large-kernel convolutions)
- Head: `DBHead` + `DiceFocalLoss`
- Input: `[N, 3, H, W]` dinamico (min 32×32, opt 736×736)
- Normalizzazione: `mean=[0.485, 0.456, 0.406]`, `std=[0.229, 0.224, 0.225]`

**Recognition** (`PP-OCRv6_{tiny|small|medium}_rec`):
- Backbone: `PPLCNetV4 {tiny|small|medium}`
- Decoder: `LightSVTR` + `CTC + NRTR` multi-head
- Input: `[1, 3, 48, W]` dinamico (max W = 3200)
- Dizionario: `ppocrv6_dict.txt` — **18 708 caratteri** unificati (50 lingue)

Rispetto a PP-OCRv5: +5.1% recognition, +4.6% detection su eval set interno.

---

## Auto-download con ModelHub

```rust
use ppocr_rs::{
    ModelHub, PpOcrVersion, PpStructureModel,
    OcrLite, OcrOptions, DocOrientationClassifier,
};

// 1. Scarica PP-OCRv6 tiny e il classificatore orientamento pagina.
//    Default cache: %LOCALAPPDATA%\ppocr-rs\models\ (Windows)
//                  ~/.cache/ppocr-rs/models/       (Linux/macOS)
let hub      = ModelHub::with_default_cache()?;
let paths    = hub.ensure(PpOcrVersion::V6Tiny)?;
let ori_paths = hub.ensure_single(PpStructureModel::DocOrientation)?;

// 2. Inizializza OcrLite con il classificatore orientamento.
let mut ocr = OcrLite::new();
ocr.init_models_no_angle(
    paths.det_onnx.to_str().unwrap(),
    paths.rec_onnx.to_str().unwrap(),
    paths.dict_txt.to_str().unwrap(),
    4, // num_thread
)?;
// Carica il classificatore orientamento pagina (PP-LCNet, 7 MB).
// OcrOptions::default() ha use_doc_orientation=true: se il modello
// non è caricato, il flag è ignorato silenziosamente.
let ori_clf = DocOrientationClassifier::from_path(&ori_paths.onnx)?;
ocr.set_doc_orientation_model(ori_clf);

// 3. OCR con correzione orientamento automatica.
let img    = image::open("scan.png")?.to_rgb8();
let result = ocr.detect_with_options(
    &img, 10, 960, 0.6, 0.3, 1.6, false, false,
    OcrOptions::default(), // use_doc_orientation=true per default
)?;
if result.page_angle != 0 {
    println!("Pagina ruotata di {}° — corretta automaticamente", result.page_angle);
}
for line in &result.text_blocks {
    println!("{:.2}  {}", line.text_score, line.text);
}
```

> Il download è **bloccante**. In GUI o runtime async, esegui su un thread separato.

### Cache dir personalizzata

```rust
let hub = ModelHub::new("/mnt/models/ppocr-rs");
let paths = hub.ensure(PpOcrVersion::V6Medium)?;
```

### Feature flag richiesta

```toml
# Cargo.toml del tuo progetto
[dependencies]
ppocr-rs = { path = "...", features = ["fetch-models"] }
```

Senza `fetch-models`, `ensure()` ritorna `OcrError::ModelHubError` se i file
non sono già in cache. Utile per ambienti offline o deployment in cui i modelli
sono pre-installati.

---

## Download manuale (alternativa a ModelHub)

### PowerShell

```powershell
$HF = "https://huggingface.co/PaddlePaddle"
$DIR = "$env:LOCALAPPDATA\ppocr-rs\models\pp_ocrv6_tiny"
New-Item -ItemType Directory -Force $DIR | Out-Null

# Tiny (6 MB totali):
curl -L -o "$DIR\det.onnx"  "$HF/PP-OCRv6_tiny_det_onnx/resolve/main/inference.onnx"
curl -L -o "$DIR\rec.onnx"  "$HF/PP-OCRv6_tiny_rec_onnx/resolve/main/inference.onnx"
curl -L -o "$DIR\dict.txt"  "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/v3.7.0/ppocr/utils/dict/ppocrv6_dict.txt"

# Oppure Medium (139 MB):
$DIR_M = "$env:LOCALAPPDATA\ppocr-rs\models\pp_ocrv6_medium"
New-Item -ItemType Directory -Force $DIR_M | Out-Null
curl -L -o "$DIR_M\det.onnx"  "$HF/PP-OCRv6_medium_det_onnx/resolve/main/inference.onnx"
curl -L -o "$DIR_M\rec.onnx"  "$HF/PP-OCRv6_medium_rec_onnx/resolve/main/inference.onnx"
curl -L -o "$DIR_M\dict.txt"  "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/v3.7.0/ppocr/utils/dict/ppocrv6_dict.txt"
```

### Modelli legacy (PP-OCRv5 Latin, 6 EU languages)

```powershell
$ONNX = "https://github.com/jingsongliujing/OnnxOCR/raw/main/onnxocr/models/ppocrv5"
$DIR = "models\latin"
New-Item -ItemType Directory -Force $DIR | Out-Null
curl -L -o "$DIR\det.onnx"       "$ONNX/det/PP-OCRv5_server_det.onnx"
curl -L -o "$DIR\rec_latin.onnx" "$ONNX/rec/latin_PP-OCRv5_mobile_rec.onnx"
curl -L -o "$DIR\dict_latin.txt" "$ONNX/rec/dict/latin_dict.txt"
```

### Layout + Table + Orientation (PP-DocLayoutV3 + SLANet_plus + PP-LCNet)

```powershell
$HF  = "https://huggingface.co/PaddlePaddle"
$B2O = "https://huggingface.co/datasets/kreuzberg-dev/paddle-to-onnx/resolve/main"
New-Item -ItemType Directory -Force models\layout, models\table, models\orientation | Out-Null

# Layout
curl -L -o models\layout\PP-DocLayoutV3.onnx "$B2O/PP-DocLayoutV3.onnx"

# Table cell detection (wired + wireless)
curl -L -o models\table\RT-DETR-L_wired_table_cell_det.onnx    "$B2O/RT-DETR-L_wired_table_cell_det.onnx"
curl -L -o models\table\RT-DETR-L_wireless_table_cell_det.onnx "$B2O/RT-DETR-L_wireless_table_cell_det.onnx"

# Table structure — SLANet_plus (488×488, via ModelHub oppure manuale)
curl -L -o models\table\SLANet_plus.onnx "$HF/SLANet_plus_onnx/resolve/main/inference.onnx"
curl -L -o models\table\table_structure_dict.txt "$HF/SLANet_plus_onnx/resolve/main/table_structure_dict.txt"

# Page orientation (PP-LCNet, 224×224, 7 MB — via ModelHub oppure manuale)
curl -L -o models\orientation\inference.onnx "$HF/PP-LCNet_x1_0_doc_ori_onnx/resolve/main/inference.onnx"
```

---

## API

### Plain OCR con orientamento automatico (PP-OCRv6)

```rust
use ppocr_rs::{ModelHub, PpOcrVersion, PpStructureModel,
                     OcrLite, OcrOptions, DocOrientationClassifier};

let hub  = ModelHub::with_default_cache()?;
let ocr_paths = hub.ensure(PpOcrVersion::V6Tiny)?;
let ori_paths = hub.ensure_single(PpStructureModel::DocOrientation)?;

let mut ocr = OcrLite::new();
ocr.init_models_no_angle(
    ocr_paths.det_onnx.to_str().unwrap(),
    ocr_paths.rec_onnx.to_str().unwrap(),
    ocr_paths.dict_txt.to_str().unwrap(),
    4,
)?;
ocr.set_doc_orientation_model(
    DocOrientationClassifier::from_path(&ori_paths.onnx)?
);

let img    = image::open("scan.png")?.to_rgb8();
// OcrOptions::default() → use_doc_orientation=true
let result = ocr.detect_with_options(
    &img, 10, 960, 0.6, 0.3, 1.6, false, false, OcrOptions::default())?;

println!("Rotazione corretta: {}°", result.page_angle);
for line in &result.text_blocks {
    println!("{:>5.2}  {:?}  {}", line.text_score, line.box_points, line.text);
}
```

### Layout-aware OCR

```rust
use ppocr_rs::{LayoutAnalyzer, OcrOptions};

let mut layout = LayoutAnalyzer::from_path("models/layout/PP-DocLayoutV3.onnx")?;
let aware = ocr.detect_with_layout(
    &img, &mut layout,
    10, 960, 0.6, 0.3, 1.6, false, false, OcrOptions::default(),
)?;

for blk in &aware.blocks {
    let cls = blk.layout_index
        .map(|i| format!("{:?}", aware.layout_boxes[i].semantic_class()))
        .unwrap_or_default();
    println!("[{cls}] {}", blk.block.text);
}
```

### Table structure recognition → GFM Markdown

```rust
use ppocr_rs::{TableStructureRecognizer, LayoutAnalyzer, LayoutClass};

let mut layout = LayoutAnalyzer::from_path("models/layout/PP-DocLayoutV3.onnx")?;
let recognizer = TableStructureRecognizer::from_path_with_dict(
    "models/table/SLANet_plus.onnx",
    Some(std::path::Path::new("models/table/table_structure_dict.txt")),
)?.with_input_size(488); // SLANet_plus usa 488×488; SLANeXt usa 512×512

let layout_boxes = layout.analyze(&img)?;
for lb in layout_boxes.iter().filter(|lb| lb.class == LayoutClass::Table) {
    let crop      = image::imageops::crop_imm(&img, lb.x, lb.y, lb.w, lb.h).to_image();
    let structure = recognizer.recognize(&crop)?;
    println!("Tabella: {} celle, score {:.3}", structure.cell_boxes.len(), structure.score);
    // structure.cell_boxes → TableCellBox { x1,y1,x2,y2 }
    // structure.html_tokens → stringa HTML token per debug
}
```

### Table cell detection + Markdown (via RT-DETR-L geometrico)

```rust
use ppocr_rs::{CellDetector, derive_grid, grid_to_gfm};

let detector = CellDetector::from_path(
    "models/table/RT-DETR-L_wired_table_cell_det.onnx")?;
let cells = detector.detect(&table_crop, 0.4)?;
let grid  = derive_grid(&cells);
let gfm   = grid_to_gfm(&grid, &lines_within_table);
println!("{gfm}");
```

### Word-level boxes

```rust
let opts = OcrOptions { return_word_box: true, ..OcrOptions::default() };
let result = ocr.detect_with_options(
    &img, 10, 960, 0.6, 0.3, 1.6, false, false, opts)?;
for blk in &result.text_blocks {
    for wb in &blk.words {
        println!("  '{}'  {:?}", wb.text, wb.box_points);
    }
}
```

### `OcrOptions` — flag disponibili

| Flag | Default | Funzione |
|---|---|---|
| `use_doc_orientation` | **`true`** | Corregge rotazione pagina (0/90/180/270°) se modello caricato |
| `return_word_box` | `false` | Aggiunge bbox per-parola via CTC timestep tracking |
| `lang` | `None` | Routing lingua (reserved — PP-OCRv6 copre già 50 lingue) |
| `use_doc_unwarping` | `false` | UVDoc prospettico (reserved) |
| `use_seal` | `false` | Timbri circolari (reserved) |
| `use_formula` | `false` | PP-FormulaNet LaTeX (reserved) |

---

## Smoke test PP-OCRv6 × ort rc.9

Prima di integrare PP-OCRv6 nella pipeline completa, esegui i test di
compatibilità in [`tests/compat_pp_ocrv6.rs`](tests/compat_pp_ocrv6.rs).
Scaricano i modelli tiny (~6 MB) e verificano che ort rc.9 possa caricarli
e produrre output di shape corretta.

```powershell
# x86_64 (pyke prebuilt DLL):
cargo test --test compat_pp_ocrv6 --features test-binaries,fetch-models -- --nocapture

# ARM64 Snapdragon X Elite:
$env:ORT_DYLIB_PATH = "C:\path\to\onnxruntime.dll"
cargo test --test compat_pp_ocrv6 --features example-dynamic,fetch-models -- --nocapture
```

### Pipeline end-to-end su PDF (`tests/art_pipeline.rs`)

Test completo che processa PDF reali via `pdftoppm`, misura i tempi per fase
e verifica orientamento + layout + OCR + table structure:

```powershell
# Release (consigliato per benchmark):
$env:ORT_DYLIB_PATH = "...\onnxruntime.dll"
cargo test --test art_pipeline --release --features example-dynamic,fetch-models -- --nocapture
```

---

## Build

### Default (CPU only)

```bash
cargo build --release
```

ONNX Runtime **non** è linkato staticamente. Al primo run, `ort` cerca
`onnxruntime.dll` / `libonnxruntime.so` accanto al binario. Due modalità:

1. **`test-binaries`** — scarica la DLL prebuilt di pyke.io (solo x86_64):
   ```bash
   cargo test --features test-binaries
   ```

2. **`example-dynamic`** — dlopen della DLL a runtime (necessario su ARM64,
   dove pyke.io non pubblica binari per rc.9):
   ```powershell
   $env:ORT_DYLIB_PATH = "C:\path\to\onnxruntime.dll"
   cargo run --example cell_aware_reorder --features example-dynamic
   ```

### Feature flags

| Flag | Effetto |
|---|---|
| `fetch-models` | Abilita `ModelHub` HTTP download via `ureq` |
| `test-binaries` | `ort/download-binaries` — DLL x86_64 per `cargo test` |
| `example-dynamic` | `ort/load-dynamic` — dlopen per ARM64 / deploy offline |
| `directml` | DirectML (Windows GPU) |
| `coreml` | CoreML (macOS Apple Silicon) |
| `cuda` | CUDA + cuDNN |
| `xnnpack` | XNNPACK CPU SIMD (ARM + x86) |

QNN (Snapdragon Hexagon NPU) è **escluso**: benchmark su Snapdragon X Elite
mostrano che PP-OCRv5/v6 non beneficia dell'NPU per shape dinamiche e
post-processing CPU-bound.

---

## Differenze rispetto a upstream `paddle-ocr-rs`

Fork di [meibel-ai/paddle-ocr-rs](https://github.com/meibel-ai/paddle-ocr-rs)
(branch `ort-rc11`, Apache-2.0), che deriva da
[mg-chao/paddle-ocr-rs](https://github.com/mg-chao/paddle-ocr-rs).

| Cambiamento | Motivo |
|---|---|
| `ort = =2.0.0-rc.9` (era rc.11) | rc.11+ si blocca su ARM64 Snapdragon X Elite — versione target permanente del workspace. |
| `ndarray = 0.16` (era 0.17) | Richiesto da ort rc.9 come transitive dep. Mix di versioni → errori `IntoValueTensor`. |
| `compat.rs` shim `try_extract_tensor` | Return type cambiato fra rc.9 e rc.11. Shim permanente, stabile. |
| Edition `2021` (era `2024`) | Compat con il toolchain minimo del workspace. |
| **`layout.rs`** aggiunto | PP-DocLayoutV3 (25 classi) + XY-Cut reading order. Non presente upstream. |
| **`cell_detection.rs`** aggiunto | RT-DETR-L cell detector + grid derivation → GFM. Non presente upstream. |
| **`table_classifier.rs`** aggiunto | PP-LCNet wired/wireless classifier + DocOrientationClassifier (224×224). |
| **`table_structure.rs`** aggiunto | SLANet_plus / SLANeXt structure recognizer → HTML token → cell bbox → GFM. |
| **`doc_unwarp.rs`** aggiunto | UVDoc document unwarping (reserved). |
| **`formula_rec.rs`** aggiunto | PP-FormulaNet-plus-L LaTeX output (reserved). |
| **`model_hub.rs`** aggiunto | Auto-download ONNX da HuggingFace. Non presente upstream. |
| **`OcrLite.set_doc_orientation_model()`** | Integra DocOrientationClassifier nella pipeline; attivato via `OcrOptions.use_doc_orientation` (default `true`). |
| **`OcrResult.page_angle`** aggiunto | Riporta i gradi di rotazione applicati (0/90/180/270). |

---

## Compatibility matrix

| OS | Architecture | Status |
|---|---|---|
| Windows 10 / 11 | x86_64 | ✅ Produzione (Pseudo-Edge) |
| Windows 11 | ARM64 (Snapdragon) | ✅ Produzione (`load-dynamic`) |
| macOS 13+ | Intel | ✅ Testato |
| macOS 13+ | Apple Silicon | ✅ Testato (CoreML EP) |
| Linux | x86_64 | ✅ Testato (Ubuntu 22.04+) |
| Linux | aarch64 | 🟡 Non testato, atteso funzionante |

---

## Roadmap

- [ ] **ModelHub: checksum SHA-256** — verifica integrità post-download.
- [ ] **ModelHub: progress callback** — per GUI / progress bar.
- [ ] **Per-word boxes su testo verticale** — skip attuale su `crop_h >= crop_w`.
- [ ] **Modelli CJK / non-Latin** — routing per-lingua quando richiesto (PP-OCRv6
  copre già CH/JP nello stesso modello; serve solo il routing in `OcrOptions.lang`).
- [ ] **`detect_with_layout` + orientamento** — pre-rotazione prima di `layout.analyze()`
  per coerenza coordinate quando `use_doc_orientation=true`.
- [ ] **ByT5 OCR post-correction** — correzione errori OCR byte-level (O↔0, doppie
  consonanti, spazi mancanti) tra OCR e cache.

---

## Sorgenti dei modelli

| Modello | Sorgente | Note |
|---|---|---|
| PP-OCRv6 tiny/small/medium det+rec ONNX | `PaddlePaddle/PP-OCRv6_*_onnx` su HuggingFace | Apache-2.0. Scaricati via `ModelHub`. |
| `ppocrv6_dict.txt` | [PaddleOCR v3.7.0](https://github.com/PaddlePaddle/PaddleOCR/tree/v3.7.0) | 18 708 caratteri. Apache-2.0. |
| PP-OCRv5 Latin (legacy) | [`jingsongliujing/OnnxOCR`](https://github.com/jingsongliujing/OnnxOCR) | 6 EU languages. Apache-2.0. |
| PP-DocLayoutV3 ONNX | [`kreuzberg-dev/paddle-to-onnx`](https://github.com/kreuzberg-dev/paddle-to-onnx) | 125 MB. Apache-2.0. |
| RT-DETR-L wired/wireless cell det | [`kreuzberg-dev/paddle-to-onnx`](https://github.com/kreuzberg-dev/paddle-to-onnx) | 123 MB cad. Apache-2.0. |
| SLANet_plus ONNX + dict | `PaddlePaddle/SLANet_plus_onnx` su HuggingFace | 488×488 input. Scaricato via `ModelHub`. |
| PP-LCNet_x1_0_doc_ori_onnx | `PaddlePaddle/PP-LCNet_x1_0_doc_ori_onnx` su HuggingFace | 7 MB, 224×224 input. Scaricato via `ModelHub`. |
| PP-LCNet_x1_0_table_cls_onnx | `PaddlePaddle/PP-LCNet_x1_0_table_cls_onnx` su HuggingFace | 7 MB, 48×192 input. |
| Per-line orientation cls | [`jingsongliujing/OnnxOCR`](https://github.com/jingsongliujing/OnnxOCR) | PP-OCRv2 cls, < 1 MB. |

---

## Credits

- [`mg-chao/paddle-ocr-rs`](https://github.com/mg-chao/paddle-ocr-rs) — Rust port originale (Apache-2.0)
- [`meibel-ai/paddle-ocr-rs`](https://github.com/meibel-ai/paddle-ocr-rs) — branch `ort-rc11` (Apache-2.0)
- [PaddlePaddle / PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) — modelli PP-OCRv5/v6
- [PaddleX](https://github.com/PaddlePaddle/PaddleX) — PP-DocLayoutV3, SLANet_plus, PP-LCNet classifiers
- [`kreuzberg-dev/paddle-to-onnx`](https://github.com/kreuzberg-dev/paddle-to-onnx) — ONNX pre-convertiti
- [`jingsongliujing/OnnxOCR`](https://github.com/jingsongliujing/OnnxOCR) — ONNX alternativi + dizionari

## License

Apache License 2.0 — vedi [`LICENSE`](LICENSE). I file vendorati conservano
i loro header di copyright originali.
