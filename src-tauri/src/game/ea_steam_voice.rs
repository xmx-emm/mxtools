use super::apex_language_download as steam;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use windows_tool::game::apex::{apex_languages_depots, get_apex_depot_download_folder_path};

pub(super) fn prefer_steam(language: &str, steam_installed: bool, restore_pending: bool) -> bool {
    steam_installed && !restore_pending && language_depot(language).is_some()
}

pub(super) fn language_depot(language: &str) -> Option<u32> {
    apex_languages_depots()
        .iter()
        .find(|(entry, _)| entry.language == language)
        .map(|(_, depot)| *depot as u32)
}

pub(super) fn copy_voice_files(
    source: &Path,
    destination: &Path,
    language: &str,
) -> Result<(), String> {
    language_depot(language).ok_or("apex.milesDlEa.badLanguage")?;
    if !destination.is_dir() {
        return Err("apex.milesDlEa.eaNotInstalled".into());
    }
    let names = [
        format!("general_{language}.mstr"),
        format!("general_{language}_patch_1.mstr"),
    ];
    // Validate both files before replacing either installed file.
    for name in &names {
        if !std::fs::metadata(source.join(name)).is_ok_and(|m| m.is_file() && m.len() > 0) {
            return Err("toast.milesLanguageNotFound".into());
        }
        if destination.join(name).exists() && !destination.join(name).is_file() {
            return Err("apex.errors.applyMilesCopyFailed".into());
        }
    }
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let staging = destination.join(format!(".mxtools-voice-{}-{nonce}", std::process::id()));
    std::fs::create_dir(&staging).map_err(|e| format!("apex.errors.applyMilesCopyFailed: {e}"))?;
    let mut backed_up = Vec::new();
    let mut installed = Vec::new();
    let result = (|| -> std::io::Result<()> {
        for name in &names {
            let bytes = std::fs::copy(source.join(name), staging.join(name))?;
            if bytes != std::fs::metadata(source.join(name))?.len() {
                return Err(std::io::Error::other("voice file size changed"));
            }
        }
        for name in &names {
            let target = destination.join(name);
            if target.exists() {
                std::fs::rename(&target, staging.join(format!("{name}.backup")))?;
                backed_up.push(name);
            }
            std::fs::rename(staging.join(name), target)?;
            installed.push(name);
        }
        Ok(())
    })();
    if let Err(error) = result {
        let mut restored = true;
        for name in installed {
            restored &= std::fs::remove_file(destination.join(name)).is_ok();
        }
        for name in backed_up {
            restored &= std::fs::rename(
                staging.join(format!("{name}.backup")),
                destination.join(name),
            )
            .is_ok();
        }
        if restored {
            let _ = std::fs::remove_dir_all(&staging);
        }
        return Err(format!(
            "apex.errors.applyMilesCopyFailed: {error}; {}",
            staging.display()
        ));
    }
    let _ = std::fs::remove_dir_all(staging);
    Ok(())
}

pub(super) async fn download(
    language: &str,
    destination: &Path,
    cancel: &Arc<AtomicBool>,
    report: &(dyn Fn(&steam::MilesDownloadProgress) + Send + Sync),
) -> Result<(), String> {
    let depot = language_depot(language).ok_or("apex.milesDlEa.badLanguage")?;
    let source =
        get_apex_depot_download_folder_path(depot as usize).ok_or("apex.milesDl.steamNotFound")?;
    let root = source
        .parent()
        .and_then(Path::parent)
        .ok_or("apex.milesDl.badDepot")?
        .to_path_buf();
    steam::ensure_cef_debugging(depot, cancel, report).await?;
    steam::download_depot_via_cef(
        &steam::DownloadTarget {
            app_id: 1172470,
            depot,
            depot_root: root,
        },
        cancel,
        &|done, total| {
            let mut p = steam::MilesDownloadProgress::new(depot, steam::phase::DOWNLOADING);
            p.downloaded_chunks = done;
            p.total_chunks = total;
            p.progress_known = total > 0;
            if total > 0 {
                p.percent = (done as f64 / total as f64 * 100.0).min(99.9);
            }
            report(&p);
        },
    )
    .await?;
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".into());
    }
    report(&steam::MilesDownloadProgress::new(
        depot,
        steam::phase::APPLYING,
    ));
    let language = language.to_string();
    let destination = destination.to_path_buf();
    crate::utils::blocking_cmd(move || {
        if super::apex::apex_is_running_sync()? {
            return Err("apex.milesDl.apexRunning".into());
        }
        copy_voice_files(&source, &destination, &language)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/game/ea_steam_voice.rs"
    ));
}
