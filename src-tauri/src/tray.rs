//! 系统托盘与「关闭到托盘」行为。
//! 主窗口可见时不显示托盘；仅在主窗口隐藏时显示。

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Rect, Runtime, WebviewUrl, WebviewWindowBuilder,
};

const TRAY_ID: &str = "main";
const TRAY_TOOLTIP_WINDOW_LABEL: &str = "tray-tooltip";

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
// `tray-icon` 在 Windows 上对已经隐藏的图标再次 set_visible(false) 会再次执行
// NIM_DELETE，并向 stderr 输出 "Error removing system tray icon"。记录状态，只在变化时调用。
static TRAY_VISIBLE: AtomicBool = AtomicBool::new(true);

fn build_tray_menu<R: Runtime>(app: &AppHandle<R>, english: bool) -> tauri::Result<Menu<R>> {
    let (show, alter_q, alter_q_adjust, quit) = if english {
        (
            "Show main window",
            "Open Alter Q",
            "Adjust Alter Q overlay",
            "Quit",
        )
    } else {
        ("显示主窗口", "打开琉雀 Q", "调整琉雀 Q 悬浮窗", "退出")
    };
    let (alter_q_ocr, alter_q_settings) = if english {
        ("Open Alter Q OCR", "Open Alter Q settings")
    } else {
        ("打开琉雀 Q 识别", "打开琉雀 Q 设置")
    };
    let show_i = MenuItem::with_id(app, "show", show, true, None::<&str>)?;
    let alter_q_i = MenuItem::with_id(app, "alter-q", alter_q, true, None::<&str>)?;
    let alter_q_ocr_i = MenuItem::with_id(app, "alter-q-ocr", alter_q_ocr, true, None::<&str>)?;
    let alter_q_settings_i = MenuItem::with_id(
        app,
        "alter-q-settings",
        alter_q_settings,
        true,
        None::<&str>,
    )?;
    let alter_q_adjust_i =
        MenuItem::with_id(app, "alter-q-adjust", alter_q_adjust, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &show_i,
            &alter_q_i,
            &alter_q_ocr_i,
            &alter_q_settings_i,
            &alter_q_adjust_i,
            &quit_i,
        ],
    )
}

pub fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::SeqCst);
}

pub fn close_to_tray_enabled() -> bool {
    CLOSE_TO_TRAY.load(Ordering::SeqCst)
}

fn set_tray_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    if !visible {
        hide_tray_tooltip(app);
    }
    if TRAY_VISIBLE.load(Ordering::SeqCst) == visible {
        return;
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if tray.set_visible(visible).is_ok() {
            TRAY_VISIBLE.store(visible, Ordering::SeqCst);
        }
    }
}

/// 主窗口显示 → 隐藏托盘；主窗口隐藏 → 显示托盘。
pub fn sync_tray_visibility<R: Runtime>(app: &AppHandle<R>) {
    let main_visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    set_tray_visible(app, !main_visible);
}

/// Windows 的 tray-icon 在隐藏状态下直接 Drop 也会重复执行 NIM_DELETE。
/// 先恢复注册，再立即从 Tauri 资源表移除，可让底层只执行一次有效删除。
fn remove_tray_for_exit<R: Runtime>(app: &AppHandle<R>) {
    hide_tray_tooltip(app);
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if !TRAY_VISIBLE.load(Ordering::SeqCst) {
        let _ = tray.set_visible(true);
    }
    TRAY_VISIBLE.store(true, Ordering::SeqCst);
    drop(tray);
    drop(app.remove_tray_by_id(TRAY_ID));
    TRAY_VISIBLE.store(false, Ordering::SeqCst);
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    hide_tray_tooltip(app);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
    sync_tray_visibility(app);
}

fn setup_tray_tooltip_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    if app.get_webview_window(TRAY_TOOLTIP_WINDOW_LABEL).is_some() {
        return Ok(());
    }

    let tooltip = WebviewWindowBuilder::new(
        app,
        TRAY_TOOLTIP_WINDOW_LABEL,
        WebviewUrl::App("tray-tooltip.html".into()),
    )
    .title("")
    .inner_size(132.0, 40.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focusable(false)
    .focused(false)
    .visible(false)
    .build()?;
    tooltip.set_ignore_cursor_events(true)?;
    Ok(())
}

fn hide_tray_tooltip<R: Runtime>(app: &AppHandle<R>) {
    if let Some(tooltip) = app.get_webview_window(TRAY_TOOLTIP_WINDOW_LABEL) {
        let _ = tooltip.hide();
    }
}

fn show_tray_tooltip<R: Runtime>(app: &AppHandle<R>, cursor: PhysicalPosition<f64>, rect: Rect) {
    let Some(tooltip) = app.get_webview_window(TRAY_TOOLTIP_WINDOW_LABEL) else {
        return;
    };

    let monitor = app.monitor_from_point(cursor.x, cursor.y).ok().flatten();
    let scale = monitor
        .as_ref()
        .map(|monitor| monitor.scale_factor())
        .or_else(|| tooltip.scale_factor().ok())
        .unwrap_or(1.0);
    let icon_position = rect.position.to_physical::<f64>(scale);
    let icon_size = rect.size.to_physical::<f64>(scale);
    let tooltip_size = tooltip.outer_size().unwrap_or_else(|_| {
        tauri::PhysicalSize::new((132.0 * scale) as u32, (40.0 * scale) as u32)
    });
    let tooltip_width = f64::from(tooltip_size.width);
    let tooltip_height = f64::from(tooltip_size.height);
    let gap = (6.0 * scale).max(6.0);

    let mut x = icon_position.x + (icon_size.width - tooltip_width) / 2.0;
    let mut y = icon_position.y - tooltip_height - gap;

    if let Some(monitor) = monitor {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let left = f64::from(monitor_position.x);
        let top = f64::from(monitor_position.y);
        let right = left + f64::from(monitor_size.width);
        let bottom = top + f64::from(monitor_size.height);

        let mut nearest_edge = 0;
        let mut nearest_distance = icon_position.y - top;
        let right_distance = right - icon_position.x - icon_size.width;
        if right_distance < nearest_distance {
            nearest_edge = 1;
            nearest_distance = right_distance;
        }
        let bottom_distance = bottom - icon_position.y - icon_size.height;
        if bottom_distance < nearest_distance {
            nearest_edge = 2;
            nearest_distance = bottom_distance;
        }
        let left_distance = icon_position.x - left;
        if left_distance < nearest_distance {
            nearest_edge = 3;
        }

        match nearest_edge {
            0 => y = icon_position.y + icon_size.height + gap,
            1 => {
                x = icon_position.x - tooltip_width - gap;
                y = icon_position.y + (icon_size.height - tooltip_height) / 2.0;
            }
            2 => y = icon_position.y - tooltip_height - gap,
            _ => {
                x = icon_position.x + icon_size.width + gap;
                y = icon_position.y + (icon_size.height - tooltip_height) / 2.0;
            }
        }

        let margin = (5.0 * scale).max(5.0);
        x = x.clamp(
            left + margin,
            (right - tooltip_width - margin).max(left + margin),
        );
        y = y.clamp(
            top + margin,
            (bottom - tooltip_height - margin).max(top + margin),
        );
    }

    let _ = tooltip.eval("window.applyTrayTooltipTheme?.()");
    let _ = tooltip.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    let _ = tooltip.show();
}

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    setup_tray_tooltip_window(app)?;
    let menu = build_tray_menu(app, false)?;

    // 默认隐藏：避免正常启动时主窗口尚未 show 前托盘闪一下
    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(
            app.default_window_icon()
                .cloned()
                .ok_or("missing window icon")?,
        )
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                show_main_window(app);
            }
            "alter-q" => {
                // The frontend owns the auxiliary-window lifecycle. Keep tray and
                // toolbar entry points on the same creation path.
                let _ = app.emit("alter-q-open-request", "workspace");
            }
            "alter-q-ocr" => {
                let _ = app.emit("alter-q-open-request", "ocr");
            }
            "alter-q-settings" => {
                let _ = app.emit("alter-q-open-request", "settings");
            }
            "alter-q-adjust" => {
                let _ = app.emit("alter-q-overlay-adjust-request", ());
            }
            "quit" => {
                remove_tray_for_exit(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Enter { position, rect, .. } => {
                show_tray_tooltip(tray.app_handle(), position, rect);
            }
            TrayIconEvent::Leave { .. } => hide_tray_tooltip(tray.app_handle()),
            TrayIconEvent::Click {
                button,
                button_state,
                ..
            } => {
                hide_tray_tooltip(tray.app_handle());
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    show_main_window(tray.app_handle());
                }
            }
            _ => {}
        })
        .build(app)?;
    TRAY_VISIBLE.store(true, Ordering::SeqCst);
    drop(tray);
    set_tray_visible(app, false);

    Ok(())
}

#[tauri::command]
pub fn alter_q_set_close_to_tray(enabled: bool) {
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
    let menu = build_tray_menu(&app, english)
        .map_err(|error| crate::ipc_error::IpcError::operation_failed("tray", error.to_string()))?;
    let tray = app.tray_by_id(TRAY_ID).ok_or_else(|| {
        crate::ipc_error::IpcError::new("tray.not_initialized", "tray icon is not initialized")
    })?;
    tray.set_menu(Some(menu))
        .map_err(|error| crate::ipc_error::IpcError::operation_failed("tray", error.to_string()))
}

pub fn handle_close_requested<R: Runtime>(window: &tauri::Window<R>, api: &tauri::CloseRequestApi) {
    let label = window.label();
    // 琉雀 Q / 关于等子窗口：关闭只隐藏，避免引导中途按 X 把窗口销毁没了
    if label == "alter-q-window" || label == "about-window" {
        api.prevent_close();
        let _ = window.hide();
        return;
    }
    if label == "main" {
        api.prevent_close();
        if close_to_tray_enabled() {
            let _ = window.hide();
            sync_tray_visibility(window.app_handle());
        } else {
            remove_tray_for_exit(window.app_handle());
            window.app_handle().exit(0);
        }
    }
}
