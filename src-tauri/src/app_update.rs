use crate::app_info::{get_app_info, AppDistribution};
use crate::background_coordinator::BackgroundCoordinator;
use crate::ipc_error::{IpcError, IpcResult};
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;
use tauri_plugin_updater::{Update, UpdaterExt};

const ENDPOINT: &str = "https://github.com/xmx-emm/mxtools/releases/latest/download/latest.json";
const PUBLIC_KEY: &str = match option_env!("MXTOOLS_UPDATER_PUBLIC_KEY") {
    Some(key) => key,
    None => "",
};
static OPERATION: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static PENDING: Mutex<Option<Update>> = Mutex::new(None);

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

fn availability() -> &'static str {
    if packaged_windows_app() {
        return "store";
    }
    if get_app_info().distribution != AppDistribution::Installer {
        return "manual";
    }
    if PUBLIC_KEY.trim().is_empty() {
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
    let state = availability();
    let mut info = UpdateInfo {
        current_version: get_app_info().version,
        version: None,
        notes: None,
        availability: state.into(),
    };
    if state != "ready" {
        return Ok(info);
    }
    let exit_app = app.clone();
    let update = app
        .updater_builder()
        .on_before_exit(move || {
            BackgroundCoordinator::shutdown_and_restore(&exit_app);
            // This replaces the plugin's default hook, so retain Tauri cleanup.
            exit_app.cleanup_before_exit();
        })
        .pubkey(PUBLIC_KEY)
        .endpoints(vec![ENDPOINT.parse().map_err(|e| error(format!("{e}")))?])
        .map_err(|e| error(e.to_string()))?
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| error(e.to_string()))?
        .check()
        .await
        .map_err(|e| error(e.to_string()))?;
    if let Some(update) = update {
        if !valid_update_url(&update.download_url) {
            return Err(error("updates.invalidSource"));
        }
        info.version = Some(update.version.clone());
        info.notes = update.body.clone();
        *PENDING.lock().map_err(|_| error("updates.busy"))? = Some(update);
    }
    Ok(info)
}

fn valid_update_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url
            .path()
            .starts_with("/xmx-emm/mxtools/releases/download/")
}

#[tauri::command]
pub async fn install_app_update(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    version: String,
) -> IpcResult<()> {
    require_main(&window)?;
    let _guard = OPERATION.try_lock().map_err(|_| error("updates.busy"))?;
    if availability() != "ready" {
        return Err(error("updates.unconfigured"));
    }
    let update = PENDING
        .lock()
        .map_err(|_| error("updates.busy"))?
        .take()
        .ok_or_else(|| error("updates.checkFirst"))?;
    if update.version != version {
        return Err(error("updates.checkFirst"));
    }
    let mut downloaded = 0u64;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = app.emit_to(
                    "main",
                    "app-update-progress",
                    serde_json::json!({"downloaded":downloaded,"total":total}),
                );
            },
            || {},
        )
        .await
        .map_err(|e| error(e.to_string()))?;
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
