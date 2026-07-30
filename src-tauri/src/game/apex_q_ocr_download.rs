//! RapidOCR 模型 + ONNX Runtime DLL 下载：镜像 + SHA256 + 进度事件。
//! ORT 不随安装包分发，与模型一并装到 AppData。

use crate::game::apex_q_rapid_ocr::{
    invalidate_engine, ocr_dir, ort_dll_path, paths, rapid_files_present, set_ort_dylib_env,
    OCR_PACK_VERSION,
};
use flate2::read::GzDecoder;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;
use tar::Archive;
use tauri::{AppHandle, Emitter};

const PROGRESS_EVENT: &str = "apex-q-ocr-download-progress";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);

/// ort 2.0.0-rc.9 / ONNX Runtime 1.20 dylib (cu12 package; CPU inference only needs the main DLL).
const ORT_DLL_NAME: &str = "onnxruntime.dll";
const ORT_DLL_SHA256: &str = "9e445fe56edf8a62de05031d80e23aec4792e3f6f9ce680f8dd3578e8a3c296a";
/// Official pyke delivery tarball (hash is of the archive; we verify the extracted DLL).
/// ModelScope single-file mirror can be added later for CN users.
const ORT_TGZ_MIRRORS: &[(&str, &str)] = &[(
  "Pyke.io",
  "https://parcel.pyke.io/v2/delivery/ortrs/packages/msort-binary/1.20.0/ortrs_dylib_cu12-v1.20.0-x86_64-pc-windows-msvc.tgz",
)];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    file_name: String,
    percent: f64,
    mirror_label: String,
}

#[derive(Serialize, Deserialize)]
struct Manifest {
    version: String,
    files: Vec<String>,
}

struct DownloadAsset {
    dest_name: &'static str,
    sha256: &'static str,
    mirrors: &'static [(&'static str, &'static str)],
}

// RapidAI/RapidOCR 官方 ONNX：PP-OCRv5 mobile 检测 + 英文识别。
// HUD 只需英文、数字和标点，英文模型比通用大字典更小、更聚焦。
const ASSETS: &[DownloadAsset] = &[
  DownloadAsset {
    dest_name: "det.onnx",
    sha256: "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae",
    mirrors: &[(
      "ModelScope",
      "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.1/onnx/PP-OCRv5/det/ch_PP-OCRv5_det_mobile.onnx",
    )],
  },
  DownloadAsset {
    dest_name: "rec.onnx",
    sha256: "c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8",
    mirrors: &[(
      "ModelScope",
      "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.1/onnx/PP-OCRv5/rec/en_PP-OCRv5_rec_mobile.onnx",
    )],
  },
  DownloadAsset {
    dest_name: "cls.onnx",
    sha256: "e47acedf663230f8863ff1ab0e64dd2d82b838fceb5957146dab185a89d6215c",
    mirrors: &[(
      "ModelScope",
      "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.1/onnx/PP-OCRv4/cls/ch_ppocr_mobile_v2.0_cls_mobile.onnx",
    )],
  },
];

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(Duration::from_secs(600))
        .user_agent(concat!("mxtools/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

fn emit_progress(app: &AppHandle, file: &str, percent: f64, mirror: &str) {
    let _ = app.emit(
        PROGRESS_EVENT,
        ProgressPayload {
            file_name: file.to_string(),
            percent,
            mirror_label: mirror.to_string(),
        },
    );
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut f = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

async fn download_to_file(
    client: &reqwest::Client,
    app: &AppHandle,
    url: &str,
    dest: &Path,
    label: &str,
    display_name: &str,
) -> Result<(), String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("{label}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("{label}: HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    let part = dest.with_file_name(format!(
        "{}.part",
        dest.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("download")
    ));
    if let Some(parent) = part.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = File::create(&part).map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    let mut done: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("{label} read: {e}"))?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        let pct = if total > 0 {
            (done as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        emit_progress(app, display_name, pct.min(99.0), label);
    }
    drop(file);
    fs::rename(&part, dest).map_err(|e| format!("rename: {e}"))?;
    emit_progress(app, display_name, 100.0, label);
    Ok(())
}

async fn download_asset(
    client: &reqwest::Client,
    app: &AppHandle,
    dir: &Path,
    asset: &DownloadAsset,
) -> Result<(), String> {
    let dest = dir.join(asset.dest_name);
    if dest.is_file() && sha256_file(&dest)? == asset.sha256 {
        emit_progress(app, asset.dest_name, 100.0, "cached");
        return Ok(());
    }

    let mut last_err = String::from("no mirrors");
    for (label, url) in asset.mirrors {
        let _ = fs::remove_file(&dest);
        match download_to_file(client, app, url, &dest, label, asset.dest_name).await {
            Ok(()) => {
                let got = sha256_file(&dest)?;
                if got != asset.sha256 {
                    let _ = fs::remove_file(&dest);
                    last_err = format!("{label}: SHA256 mismatch");
                    continue;
                }
                return Ok(());
            }
            Err(e) => {
                last_err = e;
                let _ = fs::remove_file(&dest);
            }
        }
    }
    Err(format!("{}: {last_err}", asset.dest_name))
}

fn extract_ort_dll_from_tgz(tgz: &Path, dest_dll: &Path) -> Result<(), String> {
    let file = File::open(tgz).map_err(|e| e.to_string())?;
    let mut archive = Archive::new(GzDecoder::new(file));
    let entries = archive.entries().map_err(|e| e.to_string())?;
    for entry in entries {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        if !name.eq_ignore_ascii_case(ORT_DLL_NAME) {
            continue;
        }
        if let Some(parent) = dest_dll.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let part = dest_dll.with_extension("dll.part");
        {
            let mut out = File::create(&part).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
        fs::rename(&part, dest_dll).map_err(|e| format!("rename dll: {e}"))?;
        return Ok(());
    }
    Err(format!("{ORT_DLL_NAME} not found in ORT archive"))
}

async fn download_ort_dll(
    client: &reqwest::Client,
    app: &AppHandle,
    dir: &Path,
) -> Result<(), String> {
    let dest = dir.join(ORT_DLL_NAME);
    if dest.is_file() && sha256_file(&dest)? == ORT_DLL_SHA256 {
        emit_progress(app, ORT_DLL_NAME, 100.0, "cached");
        return Ok(());
    }

    let mut last_err = String::from("no mirrors");
    for (label, url) in ORT_TGZ_MIRRORS {
        let tgz = dir.join("onnxruntime.tgz.part");
        let _ = fs::remove_file(&dest);
        let _ = fs::remove_file(&tgz);
        match download_to_file(client, app, url, &tgz, label, ORT_DLL_NAME).await {
            Ok(()) => match extract_ort_dll_from_tgz(&tgz, &dest) {
                Ok(()) => {
                    let _ = fs::remove_file(&tgz);
                    let got = sha256_file(&dest)?;
                    if got != ORT_DLL_SHA256 {
                        let _ = fs::remove_file(&dest);
                        last_err = format!("{label}: DLL SHA256 mismatch");
                        continue;
                    }
                    return Ok(());
                }
                Err(e) => {
                    last_err = e;
                    let _ = fs::remove_file(&tgz);
                    let _ = fs::remove_file(&dest);
                }
            },
            Err(e) => {
                last_err = e;
                let _ = fs::remove_file(&tgz);
            }
        }
    }
    Err(format!("{ORT_DLL_NAME}: {last_err}"))
}

pub async fn download_ocr_pack(app: AppHandle) -> Result<(), String> {
    let dir = ocr_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let client = http_client()?;

    download_ort_dll(&client, &app, &dir).await?;
    set_ort_dylib_env(&ort_dll_path()?);

    for asset in ASSETS {
        download_asset(&client, &app, &dir, asset).await?;
    }

    let mut files: Vec<String> = vec![ORT_DLL_NAME.to_string()];
    files.extend(ASSETS.iter().map(|a| a.dest_name.to_string()));
    let manifest = Manifest {
        version: OCR_PACK_VERSION.to_string(),
        files,
    };
    let p = paths()?;
    let json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    fs::write(&p.manifest, json).map_err(|e| e.to_string())?;
    invalidate_engine();
    Ok(())
}

pub fn delete_ocr_pack() -> Result<(), String> {
    invalidate_engine();
    let dir = ocr_dir()?;
    if dir.is_dir() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn status_install_dir() -> String {
    ocr_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[allow(dead_code)]
pub fn is_pack_ready() -> bool {
    paths().map(|p| rapid_files_present(&p)).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::http_client;

    #[test]
    fn windows_tls_http_client_builds() {
        assert!(http_client().is_ok());
    }
}
