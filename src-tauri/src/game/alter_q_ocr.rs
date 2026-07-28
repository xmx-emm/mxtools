//! Windows.Media.Ocr 封装：裁剪 ROI 后识别文本。

use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, RgbaImage};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoiRect {
    /// 相对宽高的左上角 x（0–1）
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl RoiRect {
    pub fn clamp01(&self) -> Self {
        let x = self.x.clamp(0.0, 1.0);
        let y = self.y.clamp(0.0, 1.0);
        let w = self.w.clamp(0.005, 1.0 - x);
        let h = self.h.clamp(0.005, 1.0 - y);
        Self { x, y, w, h }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrParseResult {
    pub alpha: Option<f64>,
    /// ang 第二个数（偏航）；仅展示用
    pub ang_yaw: Option<f64>,
    /// ang 第三个数（滚转）；仅展示用
    pub ang_roll: Option<f64>,
    pub distance_m: Option<f64>,
    pub showpos_text: String,
    pub ping_text: String,
    /// 送入 OCR 的 showpos 裁剪预览（data URL）
    pub showpos_preview: String,
    /// 送入 OCR 的 ping 裁剪预览（data URL）
    pub ping_preview: String,
    /// 实际产出 showpos 结果的引擎。
    pub showpos_engine: String,
    /// 实际产出 ping 结果的引擎。
    pub ping_engine: String,
    /// RapidOCR 文本置信度（Windows OCR 不提供）。
    pub showpos_confidence: Option<f32>,
    pub ping_confidence: Option<f32>,
}

#[derive(Debug, Clone, Default)]
struct ShowposReading {
    text: String,
    preview: String,
    ang: AngComponents,
    engine: &'static str,
    confidence: Option<f32>,
}

impl ShowposReading {
    fn is_valid(&self) -> bool {
        self.ang.pitch.is_some()
    }
}

#[derive(Debug, Clone, Default)]
struct PingReading {
    text: String,
    preview: String,
    distance_m: Option<f64>,
    engine: &'static str,
    confidence: Option<f32>,
}

impl PingReading {
    fn is_valid(&self) -> bool {
        self.distance_m.is_some()
    }
}

/// 默认只框 `ang:` 一行（仰角），避免整块 showpos + 小地图干扰 OCR。
pub fn default_showpos_roi() -> RoiRect {
    RoiRect {
        x: 0.0,
        y: 0.038,
        w: 0.105,
        h: 0.028,
    }
}

pub fn default_ping_roi() -> RoiRect {
    RoiRect {
        x: 0.529,
        y: 0.364,
        w: 0.115,
        h: 0.099,
    }
}

/// 检测 OCR 是否可用（Rapid 包或 Windows 英文 OCR）。
#[cfg(windows)]
pub fn ocr_available() -> bool {
    crate::game::alter_q_rapid_ocr::rapid_ready() || try_create_ocr_engine().is_ok()
}

#[cfg(not(windows))]
pub fn ocr_available() -> bool {
    false
}

#[cfg(windows)]
pub fn ocr_status() -> crate::game::alter_q_rapid_ocr::OcrStatus {
    let rapid = crate::game::alter_q_rapid_ocr::rapid_ready();
    let win = try_create_ocr_engine().is_ok();
    let active = if rapid {
        "rapid"
    } else if win {
        "win"
    } else {
        "none"
    };
    crate::game::alter_q_rapid_ocr::OcrStatus {
        rapid_ready: rapid,
        win_ready: win,
        install_dir: crate::game::alter_q_ocr_download::status_install_dir(),
        active_engine: active.into(),
    }
}

#[cfg(not(windows))]
pub fn ocr_status() -> crate::game::alter_q_rapid_ocr::OcrStatus {
    crate::game::alter_q_rapid_ocr::OcrStatus {
        rapid_ready: false,
        win_ready: false,
        install_dir: String::new(),
        active_engine: "none".into(),
    }
}

#[cfg(windows)]
fn try_create_ocr_engine() -> Result<windows::Media::Ocr::OcrEngine, String> {
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Media::Ocr::OcrEngine;

    // 只认英文+数字（ang / Xm）；不用中文包，避免干扰
    for tag in ["en-US", "en-GB"] {
        if let Ok(lang) = Language::CreateLanguage(&HSTRING::from(tag)) {
            if OcrEngine::IsLanguageSupported(&lang).unwrap_or(false) {
                if let Ok(engine) = OcrEngine::TryCreateFromLanguage(&lang) {
                    return Ok(engine);
                }
            }
        }
    }
    Err(
    "OCR_UNAVAILABLE: English OCR language pack required (en-US). Install via Windows Language settings → Optical character recognition."
      .into(),
  )
}

/// `kind`: `Some("showpos")` / `Some("ping")` 只识别对应 ROI；`None` 两个都识别。
/// `engine`: `Some("rapid")` / `Some("win")` / `None`(=auto：Rapid 优先，Win 兜底)。
#[cfg(windows)]
pub fn parse_screenshot_kind(
    path: &Path,
    showpos_roi: &RoiRect,
    ping_roi: &RoiRect,
    kind: Option<&str>,
    engine: Option<&str>,
) -> Result<OcrParseResult, String> {
    let prefer = engine.unwrap_or("auto").to_ascii_lowercase();
    let want_rapid = prefer == "rapid" || prefer == "auto";
    let want_win = prefer == "win" || prefer == "auto";

    let rapid_ok = want_rapid && crate::game::alter_q_rapid_ocr::rapid_ready();
    let win_engine = if want_win {
        try_create_ocr_engine().ok()
    } else {
        None
    };

    if prefer == "rapid" && !rapid_ok {
        return Err(
      "OCR_UNAVAILABLE: RapidOCR pack not installed. Download it in Alter Q → OCR / Settings."
        .into(),
    );
    }
    if prefer == "win" && win_engine.is_none() {
        return Err(
      "OCR_UNAVAILABLE: English OCR language pack required (en-US). Install via Windows Language settings."
        .into(),
    );
    }
    if !rapid_ok && win_engine.is_none() {
        return Err(
      "OCR_UNAVAILABLE: Download RapidOCR pack in Alter Q window, or install English OCR language pack (en-US)."
        .into(),
    );
    }

    let img = image::open(path).map_err(|e| format!("Failed to open screenshot: {e}"))?;
    let do_showpos = kind.is_none() || kind == Some("showpos");
    let do_ping = kind.is_none() || kind == Some("ping");

    let showpos = if do_showpos {
        ocr_showpos_with_fallback(rapid_ok, win_engine.as_ref(), &img, &showpos_roi.clamp01())?
    } else {
        ShowposReading::default()
    };

    let ping = if do_ping {
        ocr_ping_with_fallback(rapid_ok, win_engine.as_ref(), &img, &ping_roi.clamp01())?
    } else {
        PingReading::default()
    };

    Ok(OcrParseResult {
        alpha: showpos.ang.pitch,
        ang_yaw: showpos.ang.yaw,
        ang_roll: showpos.ang.roll,
        distance_m: ping.distance_m,
        showpos_text: showpos.text,
        ping_text: ping.text,
        showpos_preview: showpos.preview,
        ping_preview: ping.preview,
        showpos_engine: showpos.engine.into(),
        ping_engine: ping.engine.into(),
        showpos_confidence: showpos.confidence,
        ping_confidence: ping.confidence,
    })
}

#[cfg(not(windows))]
pub fn parse_screenshot_kind(
    _path: &Path,
    _showpos_roi: &RoiRect,
    _ping_roi: &RoiRect,
    _kind: Option<&str>,
    _engine: Option<&str>,
) -> Result<OcrParseResult, String> {
    Err("OCR is only supported on Windows".into())
}

fn rgba_to_jpeg_data_url(img: &RgbaImage) -> Result<String, String> {
    use base64::Engine;
    use image::codecs::jpeg::JpegEncoder;
    use image::ImageEncoder;

    let rgb = image::DynamicImage::ImageRgba8(img.clone()).to_rgb8();
    let mut buf = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut buf, 80);
    encoder
        .write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("encode crop jpeg: {e}"))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:image/jpeg;base64,{b64}"))
}

/// showpos：多路预处理 OCR，命中合法俯仰即停；预览用成功那一路。
#[cfg(windows)]
fn ocr_showpos_with_fallback(
    rapid_ok: bool,
    win_engine: Option<&windows::Media::Ocr::OcrEngine>,
    img: &DynamicImage,
    roi: &RoiRect,
) -> Result<ShowposReading, String> {
    if rapid_ok {
        if let Ok(r) = ocr_showpos_rapid(img, roi) {
            if r.is_valid() {
                return Ok(r);
            }
            // Rapid 有字但解析失败 → 尝试 Win 兜底
            if let Some(engine) = win_engine {
                if let Ok(w) = ocr_showpos_multivariant(engine, img, roi) {
                    if w.is_valid() {
                        return Ok(w);
                    }
                }
            }
            return Ok(r);
        }
    }
    if let Some(engine) = win_engine {
        return ocr_showpos_multivariant(engine, img, roi);
    }
    Err("OCR_UNAVAILABLE".into())
}

#[cfg(windows)]
fn ocr_ping_with_fallback(
    rapid_ok: bool,
    win_engine: Option<&windows::Media::Ocr::OcrEngine>,
    img: &DynamicImage,
    roi: &RoiRect,
) -> Result<PingReading, String> {
    if rapid_ok {
        if let Ok(r) = ocr_ping_rapid(img, roi) {
            if r.is_valid() {
                return Ok(r);
            }
            if let Some(engine) = win_engine {
                let win_crop = crop_roi_for_ocr(img, roi, "ping")?;
                if let Ok(raw_w) = ocr_rgba_image(engine, &win_crop) {
                    let text_w = whitelist_ocr_text(&raw_w);
                    let d = parse_distance_m(&text_w);
                    if d.is_some() {
                        return Ok(PingReading {
                            text: text_w,
                            preview: rgba_to_jpeg_data_url(&win_crop)?,
                            distance_m: d,
                            engine: "win",
                            confidence: None,
                        });
                    }
                }
            }
            return Ok(r);
        }
    }
    if let Some(engine) = win_engine {
        let crop = crop_roi_for_ocr(img, roi, "ping")?;
        let preview = rgba_to_jpeg_data_url(&crop)?;
        let raw = ocr_rgba_image(engine, &crop)?;
        let text = whitelist_ocr_text(&raw);
        let distance_m = parse_distance_m(&text);
        return Ok(PingReading {
            text,
            preview,
            distance_m,
            engine: "win",
            confidence: None,
        });
    }
    Err("OCR_UNAVAILABLE".into())
}

/// RapidOCR：小 HUD ROI 先等比放大，再对原色、灰度对比度和二值化候选择优。
#[cfg(windows)]
fn ocr_showpos_rapid(img: &DynamicImage, roi: &RoiRect) -> Result<ShowposReading, String> {
    let variants = rapid_variants(img, roi, true)?;
    let mut best: Option<ShowposReading> = None;
    for variant in variants {
        let Ok(raw) = crate::game::alter_q_rapid_ocr::recognize_rgba(&variant) else {
            continue;
        };
        let text = whitelist_ocr_text(&raw.text);
        if text.trim().is_empty() {
            continue;
        }
        let candidate = ShowposReading {
            ang: parse_ang_components(&text),
            text,
            preview: rgba_to_jpeg_data_url(&variant)?,
            engine: "rapid",
            confidence: raw.confidence,
        };
        let decisive =
            candidate.is_valid() && candidate.confidence.is_some_and(|value| value >= 0.82);
        if reading_is_better(
            candidate.is_valid(),
            candidate.confidence,
            best.as_ref().map(|v| (v.is_valid(), v.confidence)),
        ) {
            best = Some(candidate);
        }
        if decisive {
            break;
        }
    }
    best.ok_or_else(|| "RapidOCR returned no showpos text".into())
}

#[cfg(windows)]
fn ocr_ping_rapid(img: &DynamicImage, roi: &RoiRect) -> Result<PingReading, String> {
    let variants = rapid_variants(img, roi, false)?;
    let mut best: Option<PingReading> = None;
    for variant in variants {
        let Ok(raw) = crate::game::alter_q_rapid_ocr::recognize_rgba(&variant) else {
            continue;
        };
        let text = whitelist_ocr_text(&raw.text);
        if text.trim().is_empty() {
            continue;
        }
        let candidate = PingReading {
            distance_m: parse_distance_m(&text),
            text,
            preview: rgba_to_jpeg_data_url(&variant)?,
            engine: "rapid",
            confidence: raw.confidence,
        };
        let decisive =
            candidate.is_valid() && candidate.confidence.is_some_and(|value| value >= 0.82);
        if reading_is_better(
            candidate.is_valid(),
            candidate.confidence,
            best.as_ref().map(|v| (v.is_valid(), v.confidence)),
        ) {
            best = Some(candidate);
        }
        if decisive {
            break;
        }
    }
    best.ok_or_else(|| "RapidOCR returned no ping text".into())
}

/// showpos：多路预处理 OCR，命中合法俯仰即停；预览用成功那一路。
#[cfg(windows)]
fn ocr_showpos_multivariant(
    engine: &windows::Media::Ocr::OcrEngine,
    img: &DynamicImage,
    roi: &RoiRect,
) -> Result<ShowposReading, String> {
    let base = prepare_showpos_crop(img, roi)?;
    let gray = to_grayscale(&base);
    let variants = [
        gray.clone(),
        contrast_stretch(&gray),
        binarize_light_on_dark(&gray, false),
        binarize_light_on_dark(&gray, true),
    ];

    let mut last_text = String::new();
    let mut last_idx = 0usize;

    for (i, variant) in variants.iter().enumerate() {
        let raw = ocr_rgba_image(engine, variant).unwrap_or_default();
        let text = whitelist_ocr_text(&raw);
        if text.trim().is_empty() {
            continue;
        }
        last_text = text;
        last_idx = i;
        let ang = parse_ang_components(&last_text);
        if ang.pitch.is_some() {
            let preview = rgba_to_jpeg_data_url(variant)?;
            return Ok(ShowposReading {
                text: last_text,
                preview,
                ang,
                engine: "win",
                confidence: None,
            });
        }
    }

    let preview = rgba_to_jpeg_data_url(&variants[last_idx])?;
    let ang = parse_ang_components(&last_text);
    Ok(ShowposReading {
        text: last_text,
        preview,
        ang,
        engine: "win",
        confidence: None,
    })
}

/// 仅裁剪用户 ROI，保持原图像素（给 RapidOCR）。
fn crop_roi_raw(img: &DynamicImage, roi: &RoiRect) -> Result<RgbaImage, String> {
    let (iw, ih) = img.dimensions();
    let x = ((roi.x * iw as f64).floor() as u32).min(iw.saturating_sub(1));
    let y = ((roi.y * ih as f64).floor() as u32).min(ih.saturating_sub(1));
    let w = ((roi.w * iw as f64).ceil() as u32).max(1).min(iw - x);
    let h = ((roi.h * ih as f64).ceil() as u32).max(1).min(ih - y);
    Ok(img.crop_imm(x, y, w, h).to_rgba8())
}

fn rapid_variants(
    img: &DynamicImage,
    roi: &RoiRect,
    showpos: bool,
) -> Result<Vec<RgbaImage>, String> {
    let raw = crop_roi_raw(img, roi)?;
    let target_w = if showpos { 640 } else { 480 };
    if !showpos {
        // The calibrated ping ROI deliberately includes the marker icon and its
        // localized label. A second, tighter band isolates the numeric distance;
        // otherwise a Chinese label stroke is often decoded as a leading `1`
        // (for example 200 m -> 1200).
        let x = (raw.width() * 38 / 100).min(raw.width().saturating_sub(1));
        let y = (raw.height() * 29 / 100).min(raw.height().saturating_sub(1));
        let w = (raw.width() * 55 / 100).max(1).min(raw.width() - x);
        let h = (raw.height() * 50 / 100).max(1).min(raw.height() - y);
        let tight = image::imageops::crop_imm(&raw, x, y, w, h).to_image();
        let tight_base = upscale_nearest_to_min(&tight, target_w, 160);
        let tight_gray = to_grayscale(&tight_base);
        let base = upscale_nearest_to_min(&raw, target_w, 160);
        let gray = to_grayscale(&base);
        return Ok(vec![
            tight_base,
            contrast_stretch(&tight_gray),
            binarize_light_on_dark(&tight_gray, true),
            base,
            contrast_stretch(&gray),
            binarize_light_on_dark(&gray, true),
        ]);
    }
    let base = upscale_nearest_to_min(&raw, target_w, 160);
    let gray = to_grayscale(&base);
    Ok(vec![
        base,
        contrast_stretch(&gray),
        binarize_light_on_dark(&gray, true),
    ])
}

fn reading_is_better(
    valid: bool,
    confidence: Option<f32>,
    previous: Option<(bool, Option<f32>)>,
) -> bool {
    let Some((previous_valid, previous_confidence)) = previous else {
        return true;
    };
    if valid != previous_valid {
        return valid;
    }
    confidence.unwrap_or(-1.0) > previous_confidence.unwrap_or(-1.0)
}

/// 裁剪 ROI 并放大；ping 仍单路对比度拉伸（给 Windows OCR）。
fn crop_roi_for_ocr(img: &DynamicImage, roi: &RoiRect, label: &str) -> Result<RgbaImage, String> {
    let mut rgba = crop_and_upscale(img, roi, label == "showpos")?;
    if label != "showpos" {
        rgba = contrast_stretch(&rgba);
    }
    Ok(rgba)
}

/// showpos 专用：严格按用户 ROI 裁剪 + 最小尺寸放大，不做 contrast（交给多路变体）。
fn prepare_showpos_crop(img: &DynamicImage, roi: &RoiRect) -> Result<RgbaImage, String> {
    crop_and_upscale(img, roi, true)
}

/// Windows OCR 经验阈值：宽 < 40 或高 < 50 经常直接空结果。
const OCR_MIN_W: u32 = 40;
const OCR_MIN_H: u32 = 50;

fn crop_and_upscale(img: &DynamicImage, roi: &RoiRect, showpos: bool) -> Result<RgbaImage, String> {
    let (iw, ih) = img.dimensions();
    let x = ((roi.x * iw as f64).floor() as u32).min(iw.saturating_sub(1));
    let y = ((roi.y * ih as f64).floor() as u32).min(ih.saturating_sub(1));
    let w = ((roi.w * iw as f64).ceil() as u32).max(1).min(iw - x);
    let h = ((roi.h * ih as f64).ceil() as u32).max(1).min(ih - y);

    // 严格使用用户框选区域，不向四周扩 ROI
    let cropped = img.crop_imm(x, y, w, h).to_rgba8();
    // 先保证 OCR 最小像素门槛（整图放大，不扩选区取样）
    let sized = ensure_ocr_min_size(&cropped, OCR_MIN_W, OCR_MIN_H);
    // HUD 像素字：最近邻整数倍再拉到更舒适的识别尺寸
    let target_w = if showpos { 640 } else { 480 };
    Ok(upscale_nearest_to_min(&sized, target_w, 160))
}

/// 宽/高不足时用最近邻整数倍放大到至少 min_w × min_h。
fn ensure_ocr_min_size(img: &RgbaImage, min_w: u32, min_h: u32) -> RgbaImage {
    let (w, h) = (img.width().max(1), img.height().max(1));
    if w >= min_w && h >= min_h {
        return img.clone();
    }
    let factor_w = ((min_w as f32) / w as f32).ceil().max(1.0) as u32;
    let factor_h = ((min_h as f32) / h as f32).ceil().max(1.0) as u32;
    let factor = factor_w.max(factor_h).max(1);
    let nw = w.saturating_mul(factor);
    let nh = h.saturating_mul(factor);
    DynamicImage::ImageRgba8(img.clone())
        .resize_exact(nw, nh, FilterType::Nearest)
        .to_rgba8()
}

/// 再最近邻放大到目标最小边（HUD 字保留锐利边缘）。
fn upscale_nearest_to_min(img: &RgbaImage, min_w: u32, min_h: u32) -> RgbaImage {
    let (w, h) = (img.width().max(1), img.height().max(1));
    let scale_w = (min_w as f32) / w as f32;
    let scale_h = (min_h as f32) / h as f32;
    let scale = scale_w.max(scale_h);
    if scale <= 1.01 {
        return img.clone();
    }
    // 优先整数倍最近邻，避免平滑糊笔画像素字
    let int_scale = scale.ceil().clamp(2.0, 12.0) as u32;
    let nw = w.saturating_mul(int_scale);
    let nh = h.saturating_mul(int_scale);
    DynamicImage::ImageRgba8(img.clone())
        .resize_exact(nw, nh, FilterType::Nearest)
        .to_rgba8()
}

fn to_grayscale(img: &RgbaImage) -> RgbaImage {
    let mut out = RgbaImage::new(img.width(), img.height());
    for (x, y, p) in img.enumerate_pixels() {
        let l = (0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32)
            .round()
            .clamp(0.0, 255.0) as u8;
        out.put_pixel(x, y, image::Rgba([l, l, l, 255]));
    }
    out
}

/// 线性对比度拉伸，改善深色底浅色字的 OCR。
fn contrast_stretch(img: &RgbaImage) -> RgbaImage {
    let mut min_l = 255.0_f32;
    let mut max_l = 0.0_f32;
    for p in img.pixels() {
        let l = 0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32;
        min_l = min_l.min(l);
        max_l = max_l.max(l);
    }
    let span = (max_l - min_l).max(1.0);
    let mut out = RgbaImage::new(img.width(), img.height());
    for (x, y, p) in img.enumerate_pixels() {
        let l = 0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32;
        let nl = ((l - min_l) / span * 255.0).clamp(0.0, 255.0).round() as u8;
        out.put_pixel(x, y, image::Rgba([nl, nl, nl, 255]));
    }
    out
}

/// 浅色字/深色底 → 白底黑字（`invert=true` 则反过来）。
fn binarize_light_on_dark(img: &RgbaImage, invert: bool) -> RgbaImage {
    let mut sum = 0.0_f64;
    let mut n = 0.0_f64;
    for p in img.pixels() {
        sum += 0.299 * p[0] as f64 + 0.587 * p[1] as f64 + 0.114 * p[2] as f64;
        n += 1.0;
    }
    let mean = if n > 0.0 { sum / n } else { 128.0 };
    // 浅字阈值略低于均值，尽量保住笔画
    let thr = (mean * 0.85).clamp(40.0, 200.0);

    let mut out = RgbaImage::new(img.width(), img.height());
    for (x, y, p) in img.enumerate_pixels() {
        let l = 0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32;
        let is_light = (l as f64) >= thr;
        let ink = if invert { is_light } else { !is_light };
        let v = if ink { 0 } else { 255 };
        out.put_pixel(x, y, image::Rgba([v, v, v, 255]));
    }
    out
}

#[cfg(windows)]
fn ocr_rgba_image(
    engine: &windows::Media::Ocr::OcrEngine,
    img: &RgbaImage,
) -> Result<String, String> {
    use windows::Graphics::Imaging::{BitmapDecoder, BitmapPixelFormat, SoftwareBitmap};
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};

    let mut png_bytes = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut png_bytes);
        image::DynamicImage::ImageRgba8(img.clone())
            .write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| format!("encode png: {e}"))?;
    }

    let stream = InMemoryRandomAccessStream::new().map_err(|e| e.to_string())?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| e.to_string())?;
    writer
        .WriteBytes(&png_bytes)
        .map_err(|e| format!("WriteBytes: {e}"))?;
    writer
        .StoreAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    writer.DetachStream().map_err(|e| e.to_string())?;
    stream.Seek(0).map_err(|e| e.to_string())?;

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    let software_bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    let bitmap = match software_bitmap.BitmapPixelFormat() {
        Ok(BitmapPixelFormat::Gray8) | Ok(BitmapPixelFormat::Bgra8) => software_bitmap,
        _ => SoftwareBitmap::Convert(&software_bitmap, BitmapPixelFormat::Gray8)
            .map_err(|e| format!("SoftwareBitmap::Convert: {e}"))?,
    };

    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|e| format!("RecognizeAsync: {e}"))?
        .get()
        .map_err(|e| format!("OCR recognize: {e}"))?;

    let text = result.Text().map_err(|e| e.to_string())?;
    Ok(text.to_string())
}

#[derive(Debug, Clone, Copy, Default)]
pub struct AngComponents {
    /// 俯仰角（pitch）——计算用
    pub pitch: Option<f64>,
    /// 偏航（yaw）
    pub yaw: Option<f64>,
    /// 滚转（roll）
    pub roll: Option<f64>,
}

/// 先归一化 OCR 常见 Unicode 标点，再保留解析需要的 ASCII 字符。
/// 归一化必须发生在白名单之前，否则全角冒号和 Unicode 负号会被直接丢弃。
fn whitelist_ocr_text(text: &str) -> String {
    text.replace('：', ":")
        .replace(['−', '–', '—'], "-")
        .replace([',', '·'], ".")
        .chars()
        .filter(|c| {
            c.is_ascii_alphanumeric()
                || matches!(c, '.' | ':' | '=' | '-' | ' ' | '\n' | '\r' | '\t')
        })
        .collect()
}

fn clean_ocr_text(text: &str) -> String {
    let mut s = whitelist_ocr_text(text);

    // 仅在数字邻域修正常见字形混淆，避免把普通英文标签全局改坏。
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    for (index, ch) in chars.iter().copied().enumerate() {
        let is_numeric_neighbor = |candidate: Option<&char>| {
            candidate.is_some_and(|c| c.is_ascii_digit() || matches!(c, '.' | '-'))
        };
        let near_number = is_numeric_neighbor(index.checked_sub(1).and_then(|i| chars.get(i)))
            || is_numeric_neighbor(chars.get(index + 1));
        let normalized = match ch {
            'O' | 'o' if near_number => '0',
            'I' | 'l' if near_number => '1',
            'S' | 's' if near_number => '5',
            other => other,
        };
        out.push(normalized);
    }
    s = out;

    // 合并碎空格小数：7 . 00 / - 6 . 5 → 7.00 / -6.5
    // 输入已经 whitelist_ocr_text 过滤为纯 ASCII，全部正则用 (?-u) ASCII 模式
    //（regex 已关闭 unicode 特性以缩减体积）。
    static SPACED_NUM: OnceLock<Regex> = OnceLock::new();
    let spaced = SPACED_NUM.get_or_init(|| Regex::new(r"(?-u)(-?\d+)\s*\.\s*(\d+)").unwrap());
    s = spaced.replace_all(&s, "$1.$2").into_owned();

    // 负号与数字之间的空格：- 6.56 → -6.56
    static SPACED_NEG: OnceLock<Regex> = OnceLock::new();
    let spaced_neg = SPACED_NEG.get_or_init(|| Regex::new(r"(?-u)-\s+(\d)").unwrap());
    spaced_neg.replace_all(&s, "-$1").into_owned()
}

/// 从 showpos 文本拆分 `ang: pitch yaw roll`（依次为俯仰/偏航/滚转）。
pub fn parse_ang_components(text: &str) -> AngComponents {
    let cleaned = clean_ocr_text(text);

    static RE_LABELED: OnceLock<Regex> = OnceLock::new();
    let re_labeled = RE_LABELED.get_or_init(|| {
    Regex::new(
      r"(?i-u)(?:a\s*n\s*[gq]|ange?|avg|anc|amg)\s*[:=.]?\s*(-?\d+(?:\.\d{1,2})?)(?:\s+(-?\d+(?:\.\d+)?))?(?:\s+(-?\d+(?:\.\d+)?))?",
    )
    .unwrap()
  });
    if let Some(c) = re_labeled.captures(&cleaned) {
        let pitch = c.get(1).and_then(|m| m.as_str().parse().ok());
        let yaw = c.get(2).and_then(|m| m.as_str().parse().ok());
        let roll = c.get(3).and_then(|m| m.as_str().parse().ok());
        if ang_values_are_plausible(pitch, yaw, roll) {
            return AngComponents { pitch, yaw, roll };
        }
    }

    // OCR 漏掉标签：找「三浮点数且首数像俯仰」的一组
    static THREE: OnceLock<Regex> = OnceLock::new();
    let three = THREE.get_or_init(|| {
        Regex::new(r"(?m-u)(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)").unwrap()
    });
    for caps in three.captures_iter(&cleaned) {
        let pitch = caps[1].parse::<f64>().ok();
        let yaw = caps[2].parse::<f64>().ok();
        let roll = caps[3].parse::<f64>().ok();
        if ang_values_are_plausible(pitch, yaw, roll) {
            return AngComponents { pitch, yaw, roll };
        }
    }

    // 单行只框了俯仰数值。若有多个无标签数字则拒绝冒进猜测，避免把
    // 坐标、帧率或其它 HUD 数值误当作俯仰角。
    static ONE: OnceLock<Regex> = OnceLock::new();
    let one = ONE.get_or_init(|| Regex::new(r"(?-u)-?\d+(?:\.\d+)?").unwrap());
    let candidates: Vec<f64> = one
        .find_iter(&cleaned)
        .filter_map(|m| m.as_str().parse::<f64>().ok())
        .filter(|v| v.is_finite() && v.abs() <= 90.0)
        .collect();
    let pitch = (candidates.len() == 1).then(|| candidates[0]);
    AngComponents {
        pitch,
        yaw: None,
        roll: None,
    }
}

fn ang_values_are_plausible(pitch: Option<f64>, yaw: Option<f64>, roll: Option<f64>) -> bool {
    pitch.is_some_and(|v| v.is_finite() && v.abs() <= 90.0)
        && yaw.is_none_or(|v| v.is_finite() && v.abs() <= 360.0)
        && roll.is_none_or(|v| v.is_finite() && v.abs() <= 180.0)
}

#[cfg(test)]
fn parse_ang_pitch(text: &str) -> Option<f64> {
    parse_ang_components(text).pitch
}

pub fn parse_distance_m(text: &str) -> Option<f64> {
    let cleaned = clean_ocr_text(text);
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?-u)(\d+(?:\.\d+)?)\s*[mM]").unwrap());
    if let Some(c) = re.captures(&cleaned) {
        return c.get(1)?.as_str().parse().ok();
    }
    static NUM: OnceLock<Regex> = OnceLock::new();
    let num = NUM.get_or_init(|| Regex::new(r"(?-u)\d+(?:\.\d+)?").unwrap());
    let candidates: Vec<f64> = num
        .find_iter(&cleaned)
        .filter_map(|m| m.as_str().parse::<f64>().ok())
        .filter(|v| *v > 0.0 && *v < 5000.0)
        .collect();
    (candidates.len() == 1).then(|| candidates[0])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ang_from_showpos() {
        let t = "name: player\npos: 1 2 3\nang: -12.5 90.0 0.0\nvel: 0";
        assert!((parse_ang_pitch(t).unwrap() - (-12.5)).abs() < 1e-6);
    }

    #[test]
    fn parse_ang_ocr_spaced() {
        assert!((parse_ang_pitch("a n g : -3.25 90 0").unwrap() - (-3.25)).abs() < 1e-6);
    }

    #[test]
    fn parse_ang_skips_pos_coords() {
        let t = "18724.81 -9079.49 265.49\n-6.56 119.42 0.01\n0.00";
        assert!((parse_ang_pitch(t).unwrap() - (-6.56)).abs() < 1e-6);
    }

    #[test]
    fn parse_ang_ocr_avg_misread() {
        assert!((parse_ang_pitch("avg: -6.56 119.42 0.01").unwrap() - (-6.56)).abs() < 1e-6);
    }

    #[test]
    fn parse_ang_ocr_label_and_joined_fields() {
        assert_eq!(
            parse_ang_pitch("ANGE 6.62145.86-0.04 VELB 0.88"),
            Some(6.62)
        );
    }

    #[test]
    fn parse_ang_splits_pitch_yaw_roll() {
        let a = parse_ang_components("ANG : 7.00 352.01 0.00");
        assert!((a.pitch.unwrap() - 7.0).abs() < 1e-6);
        assert!((a.yaw.unwrap() - 352.01).abs() < 1e-6);
        assert!((a.roll.unwrap() - 0.0).abs() < 1e-6);
    }

    #[test]
    fn parse_ang_spaced_decimal() {
        assert!((parse_ang_pitch("ANG : 7 . 00 352 . 01 0 . 00").unwrap() - 7.0).abs() < 1e-6);
    }

    #[test]
    fn parse_ang_bare_number() {
        assert!((parse_ang_pitch("-6.56").unwrap() - (-6.56)).abs() < 1e-6);
    }

    #[test]
    fn parse_ang_spaced_negative() {
        assert!((parse_ang_pitch("ang: - 12.5 90 0").unwrap() - (-12.5)).abs() < 1e-6);
    }

    #[test]
    fn parse_ang_ocr_o_as_zero() {
        assert!((parse_ang_pitch("ang: 7.0O 352.01 0.00").unwrap() - 7.0).abs() < 1e-6);
    }

    #[test]
    fn whitelist_strips_non_ascii() {
        let t = whitelist_ocr_text("ANG：-6.56 中文 119.42");
        assert!(!t.contains('中'));
        assert!(t.contains("ANG:"));
        assert!(t.contains("-6.56"));
    }

    #[test]
    fn parse_unicode_punctuation_before_whitelist() {
        let a = parse_ang_components("ANG：−6,56 119,42 0,01");
        assert_eq!(a.pitch, Some(-6.56));
        assert_eq!(a.yaw, Some(119.42));
        assert_eq!(a.roll, Some(0.01));
    }

    #[test]
    fn parse_numeric_glyph_confusions_in_context() {
        assert_eq!(parse_ang_pitch("ang: -I2.5 9O 0"), Some(-12.5));
        assert_eq!(parse_distance_m("I23m"), Some(123.0));
    }

    #[test]
    fn rejects_ambiguous_unlabeled_numbers() {
        assert_eq!(parse_ang_pitch("12.5 44.0"), None);
        assert_eq!(parse_distance_m("12 345"), None);
    }

    #[test]
    fn parse_distance() {
        assert_eq!(parse_distance_m("123m"), Some(123.0));
        assert_eq!(parse_distance_m("45.5 m"), Some(45.5));
    }

    #[test]
    fn reading_selection_prefers_valid_then_confident() {
        assert!(reading_is_better(true, Some(0.4), Some((false, Some(0.9)))));
        assert!(!reading_is_better(
            false,
            Some(0.9),
            Some((true, Some(0.4)))
        ));
        assert!(reading_is_better(true, Some(0.8), Some((true, Some(0.7)))));
    }
}
