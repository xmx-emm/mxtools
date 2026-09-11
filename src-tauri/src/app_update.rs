use crate::app_info::{get_app_info, AppDistribution};
use crate::background_coordinator::BackgroundCoordinator;
use crate::ipc_error::{IpcError, IpcResult};
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;
use tauri_plugin_updater::{Update, UpdaterBuilder, UpdaterExt};

const GITHUB_ENDPOINT: &str =
    "https://github.com/xmx-emm/mxtools/releases/latest/download/latest.json";
const GITEE_ENDPOINT: &str = "https://gitee.com/mengxin_code/mxtools/raw/updates/latest.json";
static OPERATION: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static PENDING: Mutex<Option<PendingUpdate>> = Mutex::new(None);

#[derive(Clone, Copy, PartialEq, Eq)]
enum UpdateSource {
    Gitee,
    GitHub,
}

struct PendingUpdate {
    update: Update,
    source: UpdateSource,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current_version: String,
    version: Option<String>,
    notes: Option<String>,
    availability: String,
}

fn error(message: impl Into<String>) -> IpcError {
    IpcError::operation_failed("updater", message.into())
}

fn packaged_windows_app() -> bool {
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn GetCurrentPackageFullName(length: *mut u32, name: *mut u16) -> i32;
        }
        let mut length = 0;
        // APPMODEL_ERROR_NO_PACKAGE is 15700. All other results are conservative.
        unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) != 15700 }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn availability(app: &tauri::AppHandle) -> &'static str {
    if packaged_windows_app() {
        return "store";
    }
    if get_app_info().distribution != AppDistribution::Installer {
        return "manual";
    }
    if app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|value| value.get("pubkey"))
        .and_then(|value| value.as_str())
        .is_none_or(|key| key.trim().is_empty())
    {
        return "unconfigured";
    }
    "ready"
}

fn require_main(window: &tauri::WebviewWindow) -> IpcResult<()> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err(error("updates.mainWindowOnly"))
    }
}

#[tauri::command]
pub async fn check_app_update(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> IpcResult<UpdateInfo> {
    require_main(&window)?;
    let _guard = OPERATION.try_lock().map_err(|_| error("updates.busy"))?;
    *PENDING.lock().map_err(|_| error("updates.busy"))? = None;
    let state = availability(&app);
    let mut info = UpdateInfo {
        current_version: get_app_info().version,
        version: None,
        notes: None,
        availability: state.into(),
    };
    if state != "ready" {
        return Ok(info);
    }
    let pending = check_candidates(
        || update_builder(&app),
        &[
            (UpdateSource::Gitee, GITEE_ENDPOINT),
            (UpdateSource::GitHub, GITHUB_ENDPOINT),
        ],
    )
    .await?;
    if let Some(pending) = pending {
        info.version = Some(pending.update.version.clone());
        info.notes = pending.update.body.clone();
        *PENDING.lock().map_err(|_| error("updates.busy"))? = Some(pending);
    }
    Ok(info)
}

fn update_builder(app: &tauri::AppHandle) -> UpdaterBuilder {
    let exit_app = app.clone();
    app.updater_builder().on_before_exit(move || {
        BackgroundCoordinator::shutdown_and_restore(&exit_app);
        // This replaces the plugin's default hook, so retain Tauri cleanup.
        exit_app.cleanup_before_exit();
    })
}

async fn check_source(
    builder: UpdaterBuilder,
    source: UpdateSource,
    endpoint: &str,
) -> IpcResult<Option<PendingUpdate>> {
    let update = builder
        .endpoints(vec![endpoint.parse().map_err(|e| error(format!("{e}")))?])
        .map_err(|e| error(e.to_string()))?
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| error(e.to_string()))?
        .check()
        .await
        .map_err(|e| error(e.to_string()))?;
    if let Some(mut update) = update {
        if !valid_update_url(&update.download_url, source) {
            return Err(error("updates.invalidSource"));
        }
        update.timeout = Some(Duration::from_secs(180));
        return Ok(Some(PendingUpdate { update, source }));
    }
    Ok(None)
}

async fn check_candidates<F: FnMut() -> UpdaterBuilder>(
    mut builder: F,
    endpoints: &[(UpdateSource, &str)],
) -> IpcResult<Option<PendingUpdate>> {
    let mut last_error = None;
    let mut checked = false;
    for &(source, endpoint) in endpoints {
        match check_source(builder(), source, endpoint).await {
            Ok(Some(update)) => return Ok(Some(update)),
            Ok(None) => checked = true,
            Err(err) => last_error = Some(err),
        }
    }
    if checked {
        Ok(None)
    } else {
        Err(last_error.unwrap_or_else(|| error("updates.unconfigured")))
    }
}

fn valid_update_url(url: &reqwest::Url, source: UpdateSource) -> bool {
    let (host, prefix) = match source {
        UpdateSource::GitHub => ("github.com", "/xmx-emm/mxtools/releases/download/"),
        UpdateSource::Gitee => ("gitee.com", "/mengxin_code/mxtools/releases/download/"),
    };
    url.scheme() == "https"
        && url.host_str() == Some(host)
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path().starts_with(prefix)
}

async fn download_verified<C: FnMut(u64, Option<u64>)>(
    update: &Update,
    progress: &mut C,
) -> IpcResult<Vec<u8>> {
    let mut downloaded = 0;
    progress(0, None);
    update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                progress(downloaded, total);
            },
            || {},
        )
        .await
        .map_err(|e| error(e.to_string()))
}

async fn download_with_fallback<F: FnMut() -> UpdaterBuilder, C: FnMut(u64, Option<u64>)>(
    pending: PendingUpdate,
    mut builder: F,
    github_endpoint: &str,
    mut progress: C,
) -> IpcResult<(Update, Vec<u8>)> {
    match download_verified(&pending.update, &mut progress).await {
        Ok(bytes) => return Ok((pending.update, bytes)),
        Err(err) if pending.source == UpdateSource::GitHub => return Err(err),
        Err(_) => {}
    }
    let fallback = check_source(builder(), UpdateSource::GitHub, github_endpoint)
        .await?
        .ok_or_else(|| error("updates.checkFirst"))?;
    // Never silently switch the version or the signed artifact the user confirmed.
    if fallback.update.version != pending.update.version
        || fallback.update.signature != pending.update.signature
    {
        return Err(error("updates.checkFirst"));
    }
    let bytes = download_verified(&fallback.update, &mut progress).await?;
    Ok((fallback.update, bytes))
}

#[tauri::command]
pub async fn install_app_update(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    version: String,
) -> IpcResult<()> {
    require_main(&window)?;
    let _guard = OPERATION.try_lock().map_err(|_| error("updates.busy"))?;
    if availability(&app) != "ready" {
        return Err(error("updates.unconfigured"));
    }
    let pending = PENDING
        .lock()
        .map_err(|_| error("updates.busy"))?
        .take()
        .ok_or_else(|| error("updates.checkFirst"))?;
    if pending.update.version != version {
        return Err(error("updates.checkFirst"));
    }
    let (update, bytes) = download_with_fallback(
        pending,
        || update_builder(&app),
        GITHUB_ENDPOINT,
        |downloaded, total| {
            let _ = app.emit_to(
                "main",
                "app-update-progress",
                serde_json::json!({"downloaded":downloaded,"total":total}),
            );
        },
    )
    .await?;
    // Update::download verifies the signature before install is reached.
    let _ = app.emit_to("main", "app-update-installing", ());
    update.install(bytes).map_err(|e| error(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/app_update.rs"
    ));
}
