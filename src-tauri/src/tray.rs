//! Native tray and main-window lifecycle coordination.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::log_error;

const TRAY_ID: &str = "main";

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
static BETA_FEATURES_ENABLED: AtomicBool = AtomicBool::new(false);
static TRAY_ENGLISH: AtomicBool = AtomicBool::new(false);

fn build_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    english: bool,
    beta_features_enabled: bool,
) -> tauri::Result<Menu<R>> {
    let (show, apex_q, apex_q_ocr, apex_q_settings, apex_q_adjust, quit) = if english {
        (
            "Show main window",
            "Open APEX Q",
            "Open APEX Q OCR",
            "Open APEX Q settings",
            "Adjust APEX Q overlay",
            "Quit",
        )
    } else {
        (
            "显示主窗口",
            "打开 APEX Q",
            "打开 APEX Q 识别",
            "打开 APEX Q 设置",
            "调整 APEX Q 悬浮窗",
            "退出",
        )
    };
    let show_i = MenuItem::with_id(app, "show", show, true, None::<&str>)?;
    let apex_q_i = MenuItem::with_id(app, "apex-q", apex_q, true, None::<&str>)?;
    let apex_q_ocr_i = MenuItem::with_id(app, "apex-q-ocr", apex_q_ocr, true, None::<&str>)?;
    let apex_q_settings_i =
        MenuItem::with_id(app, "apex-q-settings", apex_q_settings, true, None::<&str>)?;
    let apex_q_adjust_i =
        MenuItem::with_id(app, "apex-q-adjust", apex_q_adjust, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    if beta_features_enabled {
        Menu::with_items(
            app,
            &[
                &show_i,
                &apex_q_i,
                &apex_q_ocr_i,
                &apex_q_settings_i,
                &apex_q_adjust_i,
                &quit_i,
            ],
        )
    } else {
        Menu::with_items(app, &[&show_i, &quit_i])
    }
}

pub fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::SeqCst);
}

pub fn close_to_tray_enabled() -> bool {
    CLOSE_TO_TRAY.load(Ordering::SeqCst)
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Err(error) = crate::background_runtime::ensure_main_window(app) {
        log_error!("Failed to create or focus the main window: {error}");
    }
}

/// The native tray remains resident in both interactive and background mode.
pub fn sync_tray_visibility<R: Runtime>(app: &AppHandle<R>) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_visible(true);
    }
}

pub(crate) fn remove_tray_for_exit<R: Runtime>(app: &AppHandle<R>) {
    drop(app.remove_tray_by_id(TRAY_ID));
}

fn request_apex_q<R: Runtime>(app: &AppHandle<R>, target: &'static str) {
    if let Err(error) =
        crate::background_runtime::request_main_window_event(app, "apex-q-open-request", target)
    {
        log_error!("Failed to open Apex Q from the tray: {error}");
    }
}

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app, false, false)?;
    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(
            app.default_window_icon()
                .cloned()
                .ok_or("missing window icon")?,
        )
        .tooltip("MxTools")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "apex-q" => request_apex_q(app, "workspace"),
            "apex-q-ocr" => request_apex_q(app, "ocr"),
            "apex-q-settings" => request_apex_q(app, "settings"),
            "apex-q-adjust" => {
                if let Err(error) = crate::background_runtime::request_main_window_event(
                    app,
                    "apex-q-overlay-adjust-request",
                    (),
                ) {
                    log_error!("Failed to open the Apex Q overlay editor: {error}");
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    drop(tray);
    Ok(())
}

#[tauri::command]
pub fn apex_q_set_close_to_tray(enabled: bool) {
    set_close_to_tray(enabled);
}

#[tauri::command]
pub fn sync_tray_with_main_window<R: Runtime>(app: AppHandle<R>) {
    sync_tray_visibility(&app);
}

#[tauri::command]
pub fn set_tray_locale<R: Runtime>(
    app: AppHandle<R>,
    locale: String,
) -> crate::ipc_error::IpcResult<()> {
    let normalized = locale.trim().to_ascii_lowercase();
    let english = !normalized.starts_with("zh");
    TRAY_ENGLISH.store(english, Ordering::SeqCst);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(if english {
            "MxTools"
        } else {
            "萌新工具箱"
        }));
    }
    refresh_tray_menu(&app)
}

fn refresh_tray_menu<R: Runtime>(app: &AppHandle<R>) -> crate::ipc_error::IpcResult<()> {
    let menu = build_tray_menu(
        app,
        TRAY_ENGLISH.load(Ordering::SeqCst),
        BETA_FEATURES_ENABLED.load(Ordering::SeqCst),
    )
    .map_err(|error| crate::ipc_error::IpcError::operation_failed("tray", error.to_string()))?;
    let tray = app.tray_by_id(TRAY_ID).ok_or_else(|| {
        crate::ipc_error::IpcError::new("tray.not_initialized", "tray icon is not initialized")
    })?;
    tray.set_menu(Some(menu))
        .map_err(|error| crate::ipc_error::IpcError::operation_failed("tray", error.to_string()))
}

#[tauri::command]
pub fn set_tray_beta_features<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> crate::ipc_error::IpcResult<()> {
    BETA_FEATURES_ENABLED.store(enabled, Ordering::SeqCst);
    refresh_tray_menu(&app)
}

pub fn handle_close_requested<R: Runtime>(window: &tauri::Window<R>, api: &tauri::CloseRequestApi) {
    let label = window.label();
    if label == "apex-q-window" || label == "about-window" {
        api.prevent_close();
        let _ = window.hide();
        return;
    }
    if label != "main" {
        return;
    }

    api.prevent_close();
    match main_close_disposition(close_to_tray_enabled()) {
        MainCloseDisposition::RequestBackground => {
            // The WebView owns dirty editor state. It confirms first and then
            // calls destroy_main_window; the coordinator and tray stay resident.
            let _ = window
                .app_handle()
                .emit("main-close-to-background-request", ());
        }
        MainCloseDisposition::ExitApplication => window.app_handle().exit(0),
    }
}

#[derive(Debug, PartialEq, Eq)]
enum MainCloseDisposition {
    RequestBackground,
    ExitApplication,
}

fn main_close_disposition(close_to_tray: bool) -> MainCloseDisposition {
    if close_to_tray {
        MainCloseDisposition::RequestBackground
    } else {
        MainCloseDisposition::ExitApplication
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_to_tray_requests_background_without_exiting() {
        assert_eq!(
            main_close_disposition(true),
            MainCloseDisposition::RequestBackground
        );
        assert_eq!(
            main_close_disposition(false),
            MainCloseDisposition::ExitApplication
        );
    }
}
