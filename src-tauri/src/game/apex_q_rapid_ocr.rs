//! RapidOCR / Paddle ONNX 引擎封装（模型与 ORT DLL 位于 AppData，按需下载）。

use image::{RgbImage, RgbaImage};
use ppocr_rs::ocr_lite::OcrLite;
use serde::{Deserialize, Serialize};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const OCR_PACK_VERSION: &str = "3";
pub const ORT_DLL_NAME: &str = "onnxruntime.dll";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrStatus {
    pub rapid_ready: bool,
    pub win_ready: bool,
    pub install_dir: String,
    pub active_engine: String,
}

static RAPID: Mutex<Option<OcrLite>> = Mutex::new(None);

#[derive(Debug, Clone, Default)]
pub struct RapidOcrResult {
    pub text: String,
    pub confidence: Option<f32>,
}

#[derive(Deserialize)]
struct PackManifest {
    version: String,
    files: Vec<String>,
}

pub fn ocr_dir() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "APPDATA not set".to_string())?;
    Ok(base.join("mxtools").join("ocr"))
}

pub fn ort_dll_path() -> Result<PathBuf, String> {
    Ok(ocr_dir()?.join(ORT_DLL_NAME))
}

/// Point ort load-dynamic at the AppData DLL (must run before first ORT API use).
pub fn set_ort_dylib_env(path: &Path) {
    if path.is_file() {
        std::env::set_var("ORT_DYLIB_PATH", path.to_string_lossy().into_owned());
    }
}

pub fn ensure_ort_dylib_env() -> Result<(), String> {
    let dll = ort_dll_path()?;
    if !dll.is_file() {
        return Err("ONNX Runtime DLL not installed".into());
    }
    set_ort_dylib_env(&dll);
    Ok(())
}

pub fn paths() -> Result<OcrPaths, String> {
    let dir = ocr_dir()?;
    Ok(OcrPaths {
        dir: dir.clone(),
        det: dir.join("det.onnx"),
        rec: dir.join("rec.onnx"),
        cls: dir.join("cls.onnx"),
        ort: dir.join(ORT_DLL_NAME),
        manifest: dir.join("manifest.json"),
    })
}

pub struct OcrPaths {
    #[allow(dead_code)]
    pub dir: PathBuf,
    pub det: PathBuf,
    pub rec: PathBuf,
    pub cls: PathBuf,
    pub ort: PathBuf,
    pub manifest: PathBuf,
}

pub fn rapid_files_present(p: &OcrPaths) -> bool {
    let files_exist = p.det.is_file()
        && p.rec.is_file()
        && p.cls.is_file()
        && p.ort.is_file()
        && p.manifest.is_file();
    if !files_exist {
        return false;
    }

    let Ok(raw) = std::fs::read_to_string(&p.manifest) else {
        return false;
    };
    let Ok(manifest) = serde_json::from_str::<PackManifest>(&raw) else {
        return false;
    };
    const REQUIRED: [&str; 4] = [ORT_DLL_NAME, "det.onnx", "rec.onnx", "cls.onnx"];
    manifest.version == OCR_PACK_VERSION
        && REQUIRED
            .iter()
            .all(|required| manifest.files.iter().any(|file| file == required))
}

pub fn rapid_ready() -> bool {
    paths().map(|p| rapid_files_present(&p)).unwrap_or(false)
}

pub fn invalidate_engine() {
    if let Ok(mut g) = RAPID.lock() {
        *g = None;
    }
}

fn ensure_engine() -> Result<(), String> {
    let p = paths()?;
    if !rapid_files_present(&p) {
        return Err("RapidOCR pack not installed".into());
    }
    ensure_ort_dylib_env()?;

    let mut g = RAPID.lock().map_err(|e| e.to_string())?;
    if g.is_some() {
        return Ok(());
    }
    let mut ocr = OcrLite::new();
    ocr.init_models(
        p.det.to_str().ok_or("det path")?,
        p.cls.to_str().ok_or("cls path")?,
        p.rec.to_str().ok_or("rec path")?,
        2,
    )
    .map_err(|e| format!("init RapidOCR models: {e}"))?;
    *g = Some(ocr);
    Ok(())
}

/// 对一个 ROI 候选做 OCR，并返回按阅读顺序拼接的文本及加权置信度。
pub fn recognize_rgba(img: &RgbaImage) -> Result<RapidOcrResult, String> {
    ensure_engine()?;
    let rgb: RgbImage = image::DynamicImage::ImageRgba8(img.clone()).to_rgb8();
    let mut g = RAPID.lock().map_err(|e| e.to_string())?;
    let ocr = g.as_mut().ok_or("RapidOCR not initialized")?;
    // ppocr-rs 0.7.3 can panic while grouping a decoded line when a dictionary
    // token expands to more than one Unicode scalar. Treat that candidate as a
    // normal OCR miss so the next preprocessing variant / Windows OCR can run.
    let detected = catch_unwind(AssertUnwindSafe(|| {
        ocr.detect(
            &rgb,
            24,   // 小 ROI 不宜使用过厚留白，否则会稀释 HUD 字符分辨率
            1024, // max_side_len
            0.35, // ROI 已由用户限定，适当提高小字召回
            0.22, // box_thresh
            1.5,  // un_clip_ratio
            false, false,
        )
    }));
    let mut res = match detected {
        Ok(result) => result.map_err(|e| format!("RapidOCR detect: {e}"))?,
        Err(_) => return Err("RapidOCR decode rejected an inconsistent text candidate".into()),
    };

    // 检测器输出顺序并非稳定的阅读顺序。HUD ROI 通常只有一行，但排序能避免
    // 多块文本在不同机器上被拼成不同字符串。
    res.text_blocks.sort_by(|a, b| {
        let a_y = a.box_points.iter().map(|p| p.y).min().unwrap_or(0);
        let b_y = b.box_points.iter().map(|p| p.y).min().unwrap_or(0);
        let a_x = a.box_points.iter().map(|p| p.x).min().unwrap_or(0);
        let b_x = b.box_points.iter().map(|p| p.x).min().unwrap_or(0);
        a_y.cmp(&b_y).then_with(|| a_x.cmp(&b_x))
    });

    let mut parts = Vec::new();
    let mut weighted_score = 0.0_f32;
    let mut total_weight = 0.0_f32;
    for block in &res.text_blocks {
        let t = block.text.trim();
        if !t.is_empty() {
            parts.push(t.to_string());
            let weight = t.chars().count().max(1) as f32;
            if block.text_score.is_finite() {
                weighted_score += block.text_score.clamp(0.0, 1.0) * weight;
                total_weight += weight;
            }
        }
    }
    let confidence = (total_weight > 0.0).then(|| weighted_score / total_weight);
    Ok(RapidOcrResult {
        text: parts.join(" "),
        confidence,
    })
}

#[allow(dead_code)]
pub fn recognize_path(path: &Path) -> Result<String, String> {
    let img = image::open(path).map_err(|e| e.to_string())?.to_rgba8();
    Ok(recognize_rgba(&img)?.text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_manifest_is_required() {
        let root =
            std::env::temp_dir().join(format!("mxtools-ocr-manifest-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        for name in ["det.onnx", "rec.onnx", "cls.onnx", ORT_DLL_NAME] {
            std::fs::write(root.join(name), b"fixture").unwrap();
        }
        let paths = OcrPaths {
            dir: root.clone(),
            det: root.join("det.onnx"),
            rec: root.join("rec.onnx"),
            cls: root.join("cls.onnx"),
            ort: root.join(ORT_DLL_NAME),
            manifest: root.join("manifest.json"),
        };

        std::fs::write(
            &paths.manifest,
            r#"{"version":"2","files":["onnxruntime.dll","det.onnx","rec.onnx","cls.onnx"]}"#,
        )
        .unwrap();
        assert!(!rapid_files_present(&paths));

        std::fs::write(
      &paths.manifest,
      format!(
        r#"{{"version":"{}","files":["onnxruntime.dll","det.onnx","rec.onnx","cls.onnx"]}}"#,
        OCR_PACK_VERSION
      ),
    )
    .unwrap();
        assert!(rapid_files_present(&paths));
        std::fs::remove_dir_all(root).unwrap();
    }
}
