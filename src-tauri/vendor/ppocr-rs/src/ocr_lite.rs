use std::collections::HashMap;

use image::ImageBuffer;
use ort::session::builder::SessionBuilder;

use crate::{
    angle_net::AngleNet,
    base_net::BaseNet,
    crnn_net::CrnnNet,
    db_net::DbNet,
    layout::{LayoutAnalyzer, LayoutBox},
    ocr_error::OcrError,
    ocr_result::{OcrResult, Point, TextBlock, WordBox},
    ocr_utils::OcrUtils,
    scale_param::ScaleParam,
    table_classifier::{DocOrientation, DocOrientationClassifier},
};

/// Opzioni di runtime per la pipeline OCR.
///
/// # Mappa degli stage opzionali PP-OCRv6 / PP-StructureV3
///
/// | Flag                    | Stato        | Modello / API                                   | Default |
/// |-------------------------|:------------:|-------------------------------------------------|:-------:|
/// | `return_word_box`       | ✅           | CTC timestep tracking (in-process)              | false   |
/// | `lang`                  | ✅ (routing) | PP-OCRv6 CH+Latin unico                         | None    |
/// | `use_doc_orientation`   | ✅           | [`DocOrientationClassifier`] (0/90/180/270°)    | true    |
/// | `use_doc_unwarping`     | ❌ reserved  | TextImageUnwarping (UVDoc)                      | false   |
/// | `use_seal`              | ❌ reserved  | SealTextDet + SealTextRec                       | false   |
/// | `use_formula`           | ❌ reserved  | PP-FormulaNet-plus-L (LaTeX)                    | false   |
/// | `use_chart`             | ❌ n/a       | ChartRecognition (non disponibile come ONNX)    | false   |
///
/// ## Moduli standalone
///
/// Layout e cell-detection si invocano separatamente:
/// - **Layout**: [`LayoutAnalyzer`] + `detect_with_layout`
/// - **Tipo tabella**: [`TableTypeClassifier`] standalone
/// - **Struttura tabella**: [`TableStructureRecognizer`] standalone
///
/// I flag `❌ reserved` / `❌ n/a` sono **sempre ignorati**: il campo
/// esiste per stabilire l'API surface senza breaking changes.
///
/// [`DocOrientationClassifier`]: crate::table_classifier::DocOrientationClassifier
/// [`TableTypeClassifier`]: crate::table_classifier::TableTypeClassifier
/// [`TableStructureRecognizer`]: crate::table_structure::TableStructureRecognizer
#[derive(Debug, Clone)]
pub struct OcrOptions {
    // ── Output arricchito ────────────────────────────────────────────────────

    /// Popola `TextBlock.words` con bbox per-parola via CTC timestep
    /// tracking. Default `false` (costo negligibile ma disabilitato per
    /// back-compat con callers che non usano i word bbox).
    ///
    /// **Limitazione**: le linee verticali (crop_h ≥ crop_w × 3/2)
    /// restituiscono `words = []`; il line-level `box_points` è sempre
    /// valido.
    pub return_word_box: bool,

    // ── Routing lingua ────────────────────────────────────────────────────────

    /// ISO 639-1 (`"it"`, `"en"`, `"fr"`, `"de"`, `"es"`, `"pt"`) o
    /// codice 3-lettere. **Oggi ignorato**: PP-OCRv6 CH+Latin unico copre
    /// tutte le 6 lingue EU. Riservato per routing a modelli per-lingua
    /// futuri (Tesseract / fine-tuned rec).
    pub lang: Option<String>,

    // ── Stage documento (PP-OCRv6 opzionali) ─────────────────────────────────

    /// Corregge automaticamente la rotazione della pagina (0°/90°/180°/270°)
    /// prima dell'OCR. Richiede che il classificatore sia caricato via
    /// [`OcrLite::set_doc_orientation_model`]; senza modello il flag è ignorato
    /// silenziosamente. Default `true`.
    pub use_doc_orientation: bool,

    /// **⚠ riservato.** Correzione prospettica pre-det via UVDoc.
    /// Modello disponibile (`PpStructureModel::DocUnwarp`) ma non integrato
    /// nella pipeline detect.
    pub use_doc_unwarping: bool,

    // ── Stage struttura (PP-StructureV3 opzionali) ────────────────────────────

    /// **⚠ riservato.** Riconoscimento timbri circolari (PII nei rogiti notarili).
    /// Modello non ancora scaricato/integrato.
    pub use_seal: bool,

    /// **⚠ riservato.** Riconoscimento formule LaTeX via PP-FormulaNet-plus-L.
    /// Modello disponibile (`PpStructureModel::FormulaRec`) ma non integrato;
    /// irrilevante per PII su documenti legali/medici.
    pub use_formula: bool,

    /// **⚠ n/a.** ChartRecognition non è disponibile come ONNX su HuggingFace.
    /// Vedi `tools/convert/` per convertire il modello Paddle.
    pub use_chart: bool,
}

impl Default for OcrOptions {
    fn default() -> Self {
        Self {
            return_word_box:     false,
            lang:                None,
            use_doc_orientation: true,  // abilitato di default: corregge scansioni ruotate
            use_doc_unwarping:   false,
            use_seal:            false,
            use_formula:         false,
            use_chart:           false,
        }
    }
}

#[derive(Debug)]
pub struct OcrLite {
    db_net: DbNet,
    angle_net: AngleNet,
    crnn_net: CrnnNet,
    doc_orientation_clf: Option<DocOrientationClassifier>,
}

impl Default for OcrLite {
    fn default() -> Self {
        Self::new()
    }
}

impl OcrLite {
    pub fn new() -> Self {
        Self {
            db_net: DbNet::new(),
            angle_net: AngleNet::new(),
            crnn_net: CrnnNet::new(),
            doc_orientation_clf: None,
        }
    }

    /// Carica il classificatore orientamento pagina (PP-LCNet_x1_0_doc_ori_onnx).
    /// Necessario per `OcrOptions { use_doc_orientation: true }`.
    pub fn set_doc_orientation_model(&mut self, clf: DocOrientationClassifier) {
        self.doc_orientation_clf = Some(clf);
    }

    pub fn init_models(
        &mut self,
        det_path: &str,
        cls_path: &str,
        rec_path: &str,
        num_thread: usize,
    ) -> Result<(), OcrError> {
        self.db_net.init_model(det_path, num_thread, None)?;
        self.angle_net.init_model(cls_path, num_thread, None)?;
        self.crnn_net.init_model(rec_path, num_thread, None)?;
        Ok(())
    }

    pub fn init_models_with_dict(
        &mut self,
        det_path: &str,
        cls_path: &str,
        rec_path: &str,
        dict_path: &str,
        num_thread: usize,
    ) -> Result<(), OcrError> {
        self.db_net.init_model(det_path, num_thread, None)?;
        self.angle_net.init_model(cls_path, num_thread, None)?;
        self.crnn_net
            .init_model_dict_file(rec_path, num_thread, None, dict_path)?;
        Ok(())
    }

    /// Variante senza angle-net: init solo det + rec, salta il cls model.
    /// Usare con `do_angle: false` (se `do_angle=true` l'inferenza fallisce
    /// con `SessionNotInitialized`). Utile nei test dove il cls ONNX non è
    /// disponibile in cache.
    pub fn init_models_no_angle(
        &mut self,
        det_path: &str,
        rec_path: &str,
        dict_path: &str,
        num_thread: usize,
    ) -> Result<(), OcrError> {
        self.db_net.init_model(det_path, num_thread, None)?;
        self.crnn_net
            .init_model_dict_file(rec_path, num_thread, None, dict_path)?;
        Ok(())
    }

    /// Variante di `init_models_with_dict` che accetta un `builder_fn`
    /// custom da applicare a tutti e 3 i `Session::builder()` (det+cls+rec).
    /// Usato dai consumer (Edge) per registrare execution provider
    /// hardware-accelerated (QNN-HTP / DirectML / CoreML / CUDA / XNNPACK)
    /// invece del default CPU-only del path standard.
    pub fn init_models_with_dict_and_builder(
        &mut self,
        det_path: &str,
        cls_path: &str,
        rec_path: &str,
        dict_path: &str,
        num_thread: usize,
        builder_fn: Option<fn(ort::session::builder::SessionBuilder) -> Result<ort::session::builder::SessionBuilder, ort::Error>>,
    ) -> Result<(), OcrError> {
        self.db_net.init_model(det_path, num_thread, builder_fn)?;
        self.angle_net.init_model(cls_path, num_thread, builder_fn)?;
        self.crnn_net
            .init_model_dict_file(rec_path, num_thread, builder_fn, dict_path)?;
        Ok(())
    }

    pub fn init_models_custom(
        &mut self,
        det_path: &str,
        cls_path: &str,
        rec_path: &str,
        builder_fn: fn(SessionBuilder) -> Result<SessionBuilder, ort::Error>,
    ) -> Result<(), OcrError> {
        self.db_net.init_model(det_path, 0, Some(builder_fn))?;
        self.angle_net.init_model(cls_path, 0, Some(builder_fn))?;
        self.crnn_net.init_model(rec_path, 0, Some(builder_fn))?;
        Ok(())
    }

    pub fn init_models_custom_with_dict(
        &mut self,
        det_path: &str,
        cls_path: &str,
        rec_path: &str,
        dict_path: &str,
        builder_fn: fn(SessionBuilder) -> Result<SessionBuilder, ort::Error>,
    ) -> Result<(), OcrError> {
        self.db_net.init_model(det_path, 0, Some(builder_fn))?;
        self.angle_net.init_model(cls_path, 0, Some(builder_fn))?;
        self.crnn_net
            .init_model_dict_file(rec_path, 0, Some(builder_fn), dict_path)?;
        Ok(())
    }

    pub fn init_models_from_memory(
        &mut self,
        det_bytes: &[u8],
        cls_bytes: &[u8],
        rec_bytes: &[u8],
        num_thread: usize,
    ) -> Result<(), OcrError> {
        self.db_net
            .init_model_from_memory(det_bytes, num_thread, None)?;
        self.angle_net
            .init_model_from_memory(cls_bytes, num_thread, None)?;
        self.crnn_net
            .init_model_from_memory(rec_bytes, num_thread, None)?;
        Ok(())
    }

    pub fn init_models_from_memory_custom(
        &mut self,
        det_bytes: &[u8],
        cls_bytes: &[u8],
        rec_bytes: &[u8],
        builder_fn: fn(SessionBuilder) -> Result<SessionBuilder, ort::Error>,
    ) -> Result<(), OcrError> {
        self.db_net
            .init_model_from_memory(det_bytes, 0, Some(builder_fn))?;
        self.angle_net
            .init_model_from_memory(cls_bytes, 0, Some(builder_fn))?;
        self.crnn_net
            .init_model_from_memory(rec_bytes, 0, Some(builder_fn))?;
        Ok(())
    }

    fn detect_base(
        &mut self,
        img_src: &image::RgbImage,
        padding: u32,
        max_side_len: u32,
        box_score_thresh: f32,
        box_thresh: f32,
        un_clip_ratio: f32,
        do_angle: bool,
        most_angle: bool,
        angle_rollback: bool,
        angle_rollback_threshold: f32,
    ) -> Result<OcrResult, OcrError> {
        let origin_max_side = img_src.width().max(img_src.height());
        let mut resize;
        if max_side_len == 0 || max_side_len > origin_max_side {
            resize = origin_max_side;
        } else {
            resize = max_side_len;
        }
        resize += 2 * padding;

        let padding_src = OcrUtils::make_padding(img_src, padding)?;

        let scale = ScaleParam::get_scale_param(&padding_src, resize);

        self.detect_once(
            &padding_src,
            &scale,
            padding,
            box_score_thresh,
            box_thresh,
            un_clip_ratio,
            do_angle,
            most_angle,
            angle_rollback,
            angle_rollback_threshold,
            OcrOptions::default(),
        )
    }

    /// 检测图片
    ///
    /// # Arguments
    ///
    /// - `&self` (`undefined`) - Describe this parameter.
    /// - `img_src` (`&image`) - 图片
    /// - `padding` (`u32`) - 变换图片时添加边框的宽度（提高检测效果）
    /// - `max_side_len` (`u32`) - 变换图片后图片宽和高保留的最大边长（超出该尺寸的图片将缩小）
    /// - `box_score_thresh` (`f32`) - 检测存在文本的区域的分值阈值
    /// - `do_angle` (`bool`) - 是否进行角度检测
    /// ```
    pub fn detect(
        &mut self,
        img_src: &image::RgbImage,
        padding: u32,
        max_side_len: u32,
        box_score_thresh: f32,
        box_thresh: f32,
        un_clip_ratio: f32,
        do_angle: bool,
        most_angle: bool,
    ) -> Result<OcrResult, OcrError> {
        self.detect_base(
            img_src,
            padding,
            max_side_len,
            box_score_thresh,
            box_thresh,
            un_clip_ratio,
            do_angle,
            most_angle,
            false,
            0.0,
        )
    }

    /// 支持角度回滚的检测图片
    /// 在 do_angle 为 true 时生效，如果图片经过了角度纠正，但识别效果过差，则取消角度纠正
    ///
    /// # Arguments
    ///
    /// - `&self` (`undefined`) - Describe this parameter.
    /// - `img_src` (`&image`) - 图片
    /// - `padding` (`u32`) - 变换图片时添加的边框的宽度（提高检测效果）
    /// - `max_side_len` (`u32`) - 变换图片后图片宽和高保留的最大边长（超出该尺寸的图片将缩小）
    /// - `box_score_thresh` (`f32`) - 检测存在文本的区域的分值阈值
    /// - `do_angle` (`bool`) - 是否进行角度检测
    /// - `angle_rollback_threshold` (`f32`) - 角度回滚的阈值，如果识别到的文字得分低于该值（或等于 NaN），则取消角度回滚
    /// ```
    pub fn detect_angle_rollback(
        &mut self,
        img_src: &image::RgbImage,
        padding: u32,
        max_side_len: u32,
        box_score_thresh: f32,
        box_thresh: f32,
        un_clip_ratio: f32,
        do_angle: bool,
        most_angle: bool,
        angle_rollback_threshold: f32,
    ) -> Result<OcrResult, OcrError> {
        self.detect_base(
            img_src,
            padding,
            max_side_len,
            box_score_thresh,
            box_thresh,
            un_clip_ratio,
            do_angle,
            most_angle,
            true,
            angle_rollback_threshold,
        )
    }

    pub fn detect_from_path(
        &mut self,
        img_path: &str,
        padding: u32,
        max_side_len: u32,
        box_score_thresh: f32,
        box_thresh: f32,
        un_clip_ratio: f32,
        do_angle: bool,
        most_angle: bool,
    ) -> Result<OcrResult, OcrError> {
        let img_src = image::open(img_path)?.to_rgb8();

        self.detect(
            &img_src,
            padding,
            max_side_len,
            box_score_thresh,
            box_thresh,
            un_clip_ratio,
            do_angle,
            most_angle,
        )
    }

    fn detect_once(
        &mut self,
        img_src: &image::RgbImage,
        scale: &ScaleParam,
        padding: u32,
        box_score_thresh: f32,
        box_thresh: f32,
        un_clip_ratio: f32,
        do_angle: bool,
        most_angle: bool,
        angle_rollback: bool,
        angle_rollback_threshold: f32,
        options: OcrOptions,
    ) -> Result<OcrResult, OcrError> {
        let text_boxes = self.db_net.get_text_boxes(
            img_src,
            scale,
            box_score_thresh,
            box_thresh,
            un_clip_ratio,
        )?;

        let part_images = OcrUtils::get_part_images(img_src, &text_boxes);

        let angles = self
            .angle_net
            .get_angles(&part_images, do_angle, most_angle)?;

        let mut rotated_images: Vec<image::RgbImage> = Vec::with_capacity(part_images.len());

        // 角度纠正回滚
        let mut angle_rollback_records =
            HashMap::<usize, ImageBuffer<image::Rgb<u8>, Vec<u8>>>::new();

        for (index, (angle, mut part_image)) in
            angles.iter().zip(part_images.into_iter()).enumerate()
        {
            if angle.index == 1 {
                if angle_rollback {
                    // 保留原始副本
                    angle_rollback_records.insert(index, part_image.clone());
                }

                OcrUtils::mat_rotate_clock_wise_180(&mut part_image);
            }
            rotated_images.push(part_image);
        }

        // CRNN: ritorna anche le info necessarie per l'inverse-warp quando
        // `options.return_word_box=true`. Quando `false`, le ignoriamo
        // (`words` resta `Vec::new()` nel `TextBlock`).
        let lines_meta = self.crnn_net.get_text_lines_with_word_ranges(
            &rotated_images,
            &angle_rollback_records,
            angle_rollback_threshold,
        )?;

        let mut text_blocks = Vec::with_capacity(lines_meta.len());
        for (i, (text_line, word_ranges, crop_size, target_w, t_steps)) in lines_meta.into_iter().enumerate() {
            // Polygon nello spazio dell'immagine ORIGINALE (post -padding).
            let box_points: Vec<Point> = text_boxes[i].points.iter().map(|p| Point {
                x: ((p.x as f32) - padding as f32) as u32,
                y: ((p.y as f32) - padding as f32) as u32,
            }).collect();

            let words: Vec<WordBox> = if options.return_word_box {
                build_word_boxes(
                    &word_ranges,
                    &text_boxes[i].points, // padded space
                    crop_size,
                    target_w,
                    t_steps,
                    angles[i].index == 1,
                    padding,
                )
            } else {
                Vec::new()
            };

            text_blocks.push(TextBlock {
                box_points,
                box_score:   text_boxes[i].score,
                angle_index: angles[i].index,
                angle_score: angles[i].score,
                text:        text_line.text,
                text_score:  text_line.text_score,
                words,
            });
        }

        Ok(OcrResult { text_blocks, page_angle: 0 })
    }

    /// Pipeline layout-aware completa: cls (per-line) → layout → ppocr
    /// (det+cls+rec) → associazione text-line ↔ layout-box → orphan
    /// recovery (nearest-neighbor) → sort per reading-order.
    ///
    /// Vincolo utente: le **text-line di OCR sono fonte di verità per il
    /// testo** (non si filtrano per layout, evitando i buchi quando il
    /// layout omette regioni). Il layout serve per ordering + classifica
    /// semantica + associazione spaziale.
    ///
    /// **Ordering**:
    /// 1. Primary: `LayoutBox.reading_order` (-1 va in fondo).
    /// 2. Secondary: y-position del centroide del text-block dentro lo
    ///    stesso box (top-to-bottom).
    /// 3. Tertiary: x-position del centroide (left-to-right) — utile per
    ///    box che contengono testo affiancato.
    ///
    /// **Orphan recovery**: text-line con centroide fuori da TUTTI i
    /// layout-box → assigned al box più vicino (centroid distance).
    /// Se non ci sono layout-box → tutto torna come orphan ordinato per
    /// y/x (fallback graceful per pagine senza layout detection).
    pub fn detect_with_layout(
        &mut self,
        image: &image::RgbImage,
        layout: &mut LayoutAnalyzer,
        padding: u32,
        max_side_len: u32,
        box_score_thresh: f32,
        box_thresh: f32,
        un_clip_ratio: f32,
        do_angle: bool,
        most_angle: bool,
        options: OcrOptions,
    ) -> Result<LayoutAwareResult, OcrError> {
        // ── Step 1: layout analysis (pre-OCR) ───────────────────────────
        let layout_boxes = layout.analyze(image)?;

        // ── Step 2: full OCR (det + cls + rec, con word-box se richiesto)
        let ocr = self.detect_with_options(
            image,
            padding,
            max_side_len,
            box_score_thresh,
            box_thresh,
            un_clip_ratio,
            do_angle,
            most_angle,
            options,
        )?;

        // ── Step 3: associate ogni text-block a un layout-box ───────────
        // Containment via centroid → fallback nearest-neighbor (orphan
        // recovery: line OCR fuori da tutti i layout-box).
        let mut associated: Vec<TextBlockWithLayout> = ocr.text_blocks
            .into_iter()
            .map(|tb| {
                let (cx, cy) = OcrUtils::polygon_centroid(&tb.box_points);
                let contained = layout_boxes.iter().position(|lb| lb.contains(cx, cy));
                let (idx, dist) = match contained {
                    Some(i) => (Some(i), 0.0),
                    None    => nearest_layout_box(&layout_boxes, cx, cy),
                };
                TextBlockWithLayout {
                    block: tb,
                    layout_index: idx,
                    distance: dist,
                    centroid_x: cx,
                    centroid_y: cy,
                }
            })
            .collect();

        // ── Step 4: sort by reading_order primary, y secondary, x tertiary
        associated.sort_by(|a, b| {
            let ra = a.layout_index
                .map(|i| layout_boxes[i].reading_order)
                .filter(|&r| r >= 0)
                .unwrap_or(i32::MAX);
            let rb = b.layout_index
                .map(|i| layout_boxes[i].reading_order)
                .filter(|&r| r >= 0)
                .unwrap_or(i32::MAX);
            ra.cmp(&rb)
                .then_with(|| a.centroid_y.cmp(&b.centroid_y))
                .then_with(|| a.centroid_x.cmp(&b.centroid_x))
        });

        Ok(LayoutAwareResult {
            layout_boxes,
            blocks: associated,
        })
    }

    fn rotate_to_upright(img: image::RgbImage, orient: DocOrientation) -> image::RgbImage {
        match orient {
            DocOrientation::Deg0   => img,
            DocOrientation::Deg90  => image::imageops::rotate270(&img),
            DocOrientation::Deg180 => image::imageops::rotate180(&img),
            DocOrientation::Deg270 => image::imageops::rotate90(&img),
        }
    }

    /// Variante "ricca" di [`Self::detect`] con [`OcrOptions`].
    ///
    /// I flag `use_seal`, `use_formula`, `use_chart`, `use_doc_orientation`
    /// e `use_doc_unwarping` sono **riservati e non ancora implementati**:
    /// se impostati a `true` viene emesso un warning su `eprintln!` e
    /// l'esecuzione prosegue senza lo stage corrispondente. Questo garantisce
    /// che i caller esistenti non si rompano quando gli stage verranno
    /// aggiunti in futuro.
    pub fn detect_with_options(
        &mut self,
        img_src: &image::RgbImage,
        padding: u32,
        max_side_len: u32,
        box_score_thresh: f32,
        box_thresh: f32,
        un_clip_ratio: f32,
        do_angle: bool,
        most_angle: bool,
        options: OcrOptions,
    ) -> Result<OcrResult, OcrError> {
        // ── Orientamento pagina ─────────────────────────────────────────────
        if options.use_doc_orientation {
            match &self.doc_orientation_clf {
                None => {} // modello non caricato: salta silenziosamente
                Some(clf) => {
                    let (orient, _conf) = clf.classify(img_src)?;
                    if orient != DocOrientation::Deg0 {
                        let rotated = Self::rotate_to_upright(img_src.clone(), orient);
                        let mut opts2 = options.clone();
                        opts2.use_doc_orientation = false; // evita doppia rotazione nel ricorso
                        let mut result = self.detect_with_options(
                            &rotated, padding, max_side_len,
                            box_score_thresh, box_thresh, un_clip_ratio,
                            do_angle, most_angle, opts2,
                        )?;
                        result.page_angle = orient.degrees();
                        return Ok(result);
                    }
                }
            }
        }

        // Warn su flag riservati non ancora implementati.
        if options.use_doc_unwarping {
            eprintln!("[ppocr-rs] WARN: use_doc_unwarping non implementato (TextImageUnwarping)");
        }
        if options.use_seal {
            eprintln!("[ppocr-rs] WARN: use_seal non implementato (SealTextDet + SealTextRec)");
        }
        if options.use_formula {
            eprintln!("[ppocr-rs] WARN: use_formula non implementato (PP-FormulaNet-L)");
        }
        if options.use_chart {
            eprintln!("[ppocr-rs] WARN: use_chart non implementato (ChartRecognition)");
        }

        let origin_max_side = img_src.width().max(img_src.height());
        let mut resize;
        if max_side_len == 0 || max_side_len > origin_max_side {
            resize = origin_max_side;
        } else {
            resize = max_side_len;
        }
        resize += 2 * padding;

        let padding_src = OcrUtils::make_padding(img_src, padding)?;
        let scale = ScaleParam::get_scale_param(&padding_src, resize);

        self.detect_once(
            &padding_src,
            &scale,
            padding,
            box_score_thresh,
            box_thresh,
            un_clip_ratio,
            do_angle,
            most_angle,
            false,
            0.0,
            options,
        )
    }
}

/// Output di [`OcrLite::detect_with_layout`]. Contiene sia i layout-box
/// (sorted by reading_order) sia i text-block OCR (associati ai layout-box,
/// sorted per reading-order then y-position).
///
/// **Vincolo testuale**: NON si perde mai un text-block. Se il layout
/// omette regioni, i text-block in quelle regioni finiscono come orphan
/// recovery sul box più vicino (`distance > 0`). Il consumer può
/// filtrare per `distance == 0.0` se vuole solo containment esatto.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LayoutAwareResult {
    /// Layout-box rilevati da PP-DocLayoutV3, ordinati per
    /// `reading_order` ascending (-1 in fondo). Vec vuoto se il modello
    /// non rileva regioni → tutto va in orphan path.
    pub layout_boxes: Vec<LayoutBox>,
    /// Text-block OCR (det+rec+cls) con annotazione layout. Ordinati per
    /// reading-order primario, y-position secondario, x-position
    /// terziario. **Fonte di verità del testo riconosciuto**.
    pub blocks: Vec<TextBlockWithLayout>,
}

/// Text-block OCR con metadata di associazione layout. Output di
/// [`LayoutAwareResult::blocks`].
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TextBlockWithLayout {
    pub block: TextBlock,
    /// Index in `LayoutAwareResult.layout_boxes` del box associato
    /// (containment via centroid, fallback nearest-neighbor). `None`
    /// solo se non ci sono layout-box (lista vuota).
    pub layout_index: Option<usize>,
    /// `0.0` se il centroide del block è dentro il layout-box assegnato.
    /// `> 0.0` se siamo arrivati al box via orphan-recovery (centroid
    /// distance pixel-space). `INFINITY` se non c'erano layout-box.
    pub distance:  f32,
    /// Centroide del polygon block (cache di `polygon_centroid`, usato
    /// per il sort secondario y/x).
    pub centroid_x: u32,
    pub centroid_y: u32,
}

/// Trova il layout-box più vicino al punto `(cx, cy)` via distanza dal
/// centroide del box. Ritorna `(Some(idx), dist)` o `(None, INF)` se
/// `boxes` è vuoto.
fn nearest_layout_box(boxes: &[LayoutBox], cx: u32, cy: u32) -> (Option<usize>, f32) {
    if boxes.is_empty() { return (None, f32::INFINITY); }
    let mut best_idx = 0usize;
    let mut best_dist = f32::INFINITY;
    for (i, lb) in boxes.iter().enumerate() {
        let d = lb.distance_to(cx, cy);
        if d < best_dist {
            best_dist = d;
            best_idx = i;
        }
    }
    (Some(best_idx), best_dist)
}

/// Mappa i `WordRange` CTC dal cropped-line space allo spazio dell'immagine
/// originale. Percorso:
///
/// 1. `(start_ts, end_ts)` → `x_crnn_input` via `target_w / T` (≈ 8 px/ts).
/// 2. `x_crnn_input` → `x_crop` via il rapporto `crop_w / resized_w` (con
///    clamp a `crop_w` per timestep dentro la zona di padding).
/// 3. Se `was_180_rotated` (angle.index==1), flippa `x_crop` orizzontalmente
///    (la rotazione 180° è stata applicata DOPO il warp e PRIMA del CRNN).
/// 4. 4-corner quad nel crop space → invocazione [`OcrUtils::inverse_warp_quad`]
///    con il polygon (in PADDED image space) → quad in PADDED image space.
/// 5. De-padding: sottrai `(padding, padding)` da ogni Point.
///
/// **Skip rule**: se la crop fu ruotata 90° dentro `get_rotate_crop_image`
/// (caso testo verticale, `crop_h >= crop_w * 3/2`), non possiamo derivare
/// word-box meaningful — ritorniamo `Vec::new()` per quella linea.
fn build_word_boxes(
    word_ranges: &[crate::crnn_net::WordRange],
    polygon_padded: &[Point], // 4 corner nello spazio padded
    crop_size:      (u32, u32),
    target_w:       usize,
    t_steps:        usize,
    was_180_rotated: bool,
    padding: u32,
) -> Vec<WordBox> {
    if word_ranges.is_empty() || polygon_padded.len() != 4 || t_steps == 0 || target_w == 0 {
        return Vec::new();
    }
    let (crop_w, crop_h) = crop_size;
    if crop_h == 0 || crop_w == 0 { return Vec::new(); }

    // Rilevazione "crop ruotato 90°": dopo `get_rotate_crop_image`, se la
    // line era verticale, l'immagine arriva al CRNN già con dimensioni
    // swappate. Heuristic: il crop normale di una line di testo è ~3-30×
    // più largo che alto. Se crop_h >= crop_w (cioè il crop è quadrato o
    // più alto che largo), molto probabilmente è stato ruotato 90° → no
    // word-box. Documento orizzontale tipico avrà sempre `crop_w > crop_h`.
    if crop_h >= crop_w {
        return Vec::new();
    }

    // resized_w è la larghezza che il CRNN ha visto PRIMA del padding right.
    // Da get_text_line_with_wh_ratio:
    //   scale = 48 / crop_h
    //   resized_w = crop_w * scale = crop_w * 48 / crop_h
    let dst_h = crate::crnn_net::CRNN_DST_HEIGHT as f32;
    let resized_w = ((crop_w as f32) * dst_h / (crop_h as f32)).ceil() as u32;
    let resized_w = resized_w.min(target_w as u32).max(1);

    // x per timestep nello spazio CRNN-input (post-padding).
    let x_per_ts = (target_w as f32) / (t_steps as f32).max(1.0);

    // Polygon (4 punti) in PADDED space — array fisso per inverse_warp_quad.
    let poly: [Point; 4] = [
        polygon_padded[0], polygon_padded[1], polygon_padded[2], polygon_padded[3],
    ];

    let mut out = Vec::with_capacity(word_ranges.len());
    for w in word_ranges {
        // Step 1+2: timestep → crop x.
        let x_crnn_start = (w.start_ts as f32)       * x_per_ts;
        let x_crnn_end   = ((w.end_ts + 1) as f32)   * x_per_ts;
        // Clamp dentro resized_w (oltre = padding zone).
        let x_crnn_start = x_crnn_start.min(resized_w as f32);
        let x_crnn_end   = x_crnn_end  .min(resized_w as f32);
        // CRNN-input → crop space.
        let ratio = (crop_w as f32) / (resized_w as f32);
        let mut x_crop_start = x_crnn_start * ratio;
        let mut x_crop_end   = x_crnn_end   * ratio;
        if x_crop_end <= x_crop_start { continue; }

        // Step 3: 180° rotation → flip orizzontale nel crop space.
        if was_180_rotated {
            let new_start = (crop_w as f32) - x_crop_end;
            let new_end   = (crop_w as f32) - x_crop_start;
            x_crop_start = new_start.max(0.0);
            x_crop_end   = new_end.max(0.0);
        }

        // Step 4: 4-corner quad nel crop space (full height).
        let quad = [
            (x_crop_start, 0.0),
            (x_crop_end,   0.0),
            (x_crop_end,   crop_h as f32),
            (x_crop_start, crop_h as f32),
        ];

        // Step 5: inverse-warp → padded image space → de-padding.
        if let Some(image_pts_padded) = OcrUtils::inverse_warp_quad(&poly, crop_size, &quad) {
            let image_pts: Vec<Point> = image_pts_padded.iter().map(|p| Point {
                x: p.x.saturating_sub(padding),
                y: p.y.saturating_sub(padding),
            }).collect();
            out.push(WordBox {
                text:       w.text.clone(),
                box_points: image_pts,
                score:      w.score,
            });
        }
    }
    out
}
