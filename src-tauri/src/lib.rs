mod app_info;
mod backups;
mod elevated;
mod folder_sharing;
mod game;
mod game_optimizer;
mod input_method;
mod ipc_error;
mod logger;
mod port_forwarding;
mod rdp;
mod registry;
mod stdio_tee;
mod system;
#[cfg(test)]
mod test;
mod tray;
mod user;
mod utils;

use tauri::Manager;

use crate::app_info::get_app_info;
use crate::backups::{
    backups_explorer_registry, backups_port_forwarding, backups_port_forwarding_default_path,
    check_backups_explorer_registry, explorer_folder, explorer_registry_path, load_port_forwarding,
};
use crate::elevated::{is_elevated, restart_request_elevation};
use crate::folder_sharing::{
    apply_local_share, close_smb_open_file, close_smb_session, connect_remote_share,
    disconnect_remote_server, disconnect_remote_share, discover_network_devices,
    get_local_share_details, get_smb_activity, list_local_share_access, list_local_shares,
    list_mapped_drives, list_remote_shares, list_share_accounts, open_shared_folder,
    preview_local_share, remove_local_share, repair_folder_sharing, scan_folder_sharing_health,
};
use crate::game::alter_q::{
    alter_q_compute_theta, alter_q_default_rois, alter_q_from_latest_screenshot,
    alter_q_latest_screenshot, alter_q_list_recent_screenshots, alter_q_list_steam_screenshot_dirs,
    alter_q_normalize_path, alter_q_ocr_available, alter_q_ocr_delete, alter_q_ocr_download,
    alter_q_ocr_status, alter_q_open_ocr_settings, alter_q_screenshot_preview,
    alter_q_suggested_screenshot_dir, alter_q_test_ocr,
};
use crate::game::apex::{
    apex_is_running, apply_apex_miles_language, check_apex_miles_language, get_apex_config_file,
    get_apex_languages_depots, get_apex_launch_option, get_apex_video_config,
    get_apex_videoconfig_folder_path, get_apex_videoconfig_readonly, open_apex_audio_folder_path,
    open_apex_depot_download_folder_path, set_apex_launch_option, set_apex_video_config,
    set_apex_videoconfig_readonly, thoroughly_kill_apex,
};
use crate::game::apex_settings::{
    apply_apex_game_settings, get_apex_game_settings, restore_apex_game_settings,
};
use crate::game::pubg::{
    check_pubg_skip_intro_movies_disabled, get_pubg_launch_option, get_pubg_logs_folder_path,
    open_folder_detached, set_pubg_launch_option, set_pubg_skip_intro_movies_disabled,
};
use crate::game::{
    ea_desktop_is_running_by_tasklist, get_apex_launch_option_ea, get_ea_desktop_users,
    get_steam_users, set_apex_launch_option_ea, steam_is_running_by_tasklist,
    thoroughly_kill_ea_desktop, thoroughly_kill_steam,
};
use crate::game_optimizer::{apply_game_optimizer, benchmark_game_network, scan_game_optimizer};
use crate::input_method::{
    add_input_method, add_us_keyboard, disable_chs_simplified_traditional_hotkey,
    export_wubi_user_phrases, get_available_input_methods, get_input_methods,
    get_wubi_lexicon_info, import_wubi_system_lexicon, import_wubi_user_phrases,
    open_input_method_settings, open_ms_settings_page, remove_input_method, reorder_input_methods,
    restore_wubi_system_lexicon,
};
use crate::logger::{get_log_folder_path, get_logs_for_feedback, write_frontend_log};
use crate::port_forwarding::{
    create_multiple_port_forwarding, del_port_forwarding, get_port_forwarding,
    reset_port_forwarding, set_port_forwarding,
};
use crate::rdp::{
    add_rdp_user, check_remote_port, connect_rdp, export_rdp_file, get_rdp_enabled, get_rdp_port,
    get_rdp_users, load_rdp_connections, remove_rdp_user, save_rdp_connections, set_rdp_enabled,
    set_rdp_port,
};
use crate::registry::{
    add_custom_background_folder, get_all_common_folders, hide_common_folders,
    list_context_menu_items, list_custom_background_folders, modify_windows_update_time,
    remove_custom_background_folder, set_context_menu_item_enabled,
    set_custom_background_folder_enabled, show_common_folders,
};
use crate::system::{
    get_primary_display_info, read_utf8_file, system_info, system_total_memory_mb, write_utf8_file,
};
use crate::tray::{
    alter_q_set_close_to_tray, handle_close_requested, set_tray_locale, setup_tray,
    sync_tray_with_main_window,
};
use crate::user::{
    add_windows_user, delete_windows_user, get_windows_users, modify_windows_user_password,
    rename_windows_user,
};

fn open_external_url_in_browser(url: &str) {
    if url.starts_with("http://") || url.starts_with("https://") {
        let _ = tauri_plugin_opener::open_url(url, None::<&str>);
    }
}

/// INTENTIONAL (product requirement): DevTools must remain available in
/// **release** builds for field debugging. Triggered from the frontend
/// (`AppVersion.vue` Konami sequence). Cargo.toml enables the `devtools`
/// feature on purpose — do NOT gate this behind `cfg(debug_assertions)`
/// or strip it in audits without owner approval.
#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    log_info!("Opening devtools...");
    window.open_devtools();
}

/// 是否由开机自启拉起（注册自启时会带 `--autostart`）。
#[tauri::command]
fn is_launched_from_autostart() -> bool {
    std::env::args().any(|a| a == "--autostart")
}

/// RapidOCR uses ort `load-dynamic`; prefer AppData DLL (downloaded with OCR pack).
#[cfg(windows)]
fn init_ort_dylib_path(app: &tauri::AppHandle) {
    if std::env::var_os("ORT_DYLIB_PATH").is_some() {
        return;
    }
    if let Ok(dll) = crate::game::alter_q_rapid_ocr::ort_dll_path() {
        if dll.is_file() {
            crate::game::alter_q_rapid_ocr::set_ort_dylib_env(&dll);
            return;
        }
    }
    // Legacy: older installs that still ship the DLL next to resources.
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("onnxruntime.dll");
        if bundled.is_file() {
            crate::game::alter_q_rapid_ocr::set_ort_dylib_env(&bundled);
        }
    }
}

/// 将控制台输入/输出代码页设为 UTF-8,避免 `println!` 与 stdio tee 写入的字节在 GBK 控制台下显示为乱码.
#[cfg(windows)]
fn init_windows_console_utf8() {
    use winapi::um::wincon::{SetConsoleCP, SetConsoleOutputCP};
    const CP_UTF8: u32 = 65001;
    unsafe {
        SetConsoleOutputCP(CP_UTF8);
        SetConsoleCP(CP_UTF8);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Some(exit_code) = crate::folder_sharing::try_run_elevated_helper() {
        std::process::exit(exit_code);
    }
    #[cfg(windows)]
    init_windows_console_utf8();
    // GUI 下默认关闭 windows_tool 诊断 println，避免刷屏；debug 仍开启便于排查。
    #[cfg(not(debug_assertions))]
    windows_tool::utils::log::set_verbose(false);
    logger::init_log_path();
    tauri::Builder::default()
        .plugin(tauri_plugin_pinia::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--autostart"])
                .build(),
        )
        .setup(|app| {
            #[cfg(windows)]
            init_ort_dylib_path(app.handle());
            let window_config = app.config().app.windows[0].clone();
            let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &window_config)?
                .on_new_window(|url, _features| {
                    open_external_url_in_browser(url.as_str());
                    tauri::webview::NewWindowResponse::Deny
                })
                .build()?;
            setup_tray(app.handle())?;
            let _ = window;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                handle_close_requested(window, api);
            }
        })
        .invoke_handler(tauri::generate_handler![
            // 日志及调试控制台
            open_devtools,
            write_frontend_log,
            get_logs_for_feedback,
            get_log_folder_path,
            //Port Forwarding
            create_multiple_port_forwarding,
            del_port_forwarding,
            set_port_forwarding,
            reset_port_forwarding,
            get_port_forwarding,
            //App
            get_app_info,
            is_launched_from_autostart,
            //System
            system_info,
            system_total_memory_mb,
            get_primary_display_info,
            read_utf8_file,
            write_utf8_file,
            // folder sharing
            list_local_shares,
            list_local_share_access,
            list_share_accounts,
            preview_local_share,
            apply_local_share,
            get_local_share_details,
            remove_local_share,
            discover_network_devices,
            list_remote_shares,
            list_mapped_drives,
            open_shared_folder,
            connect_remote_share,
            disconnect_remote_share,
            disconnect_remote_server,
            get_smb_activity,
            close_smb_session,
            close_smb_open_file,
            scan_folder_sharing_health,
            repair_folder_sharing,
            //Common Folders
            get_all_common_folders,
            hide_common_folders,
            show_common_folders,
            //Explorer context menu
            list_custom_background_folders,
            add_custom_background_folder,
            remove_custom_background_folder,
            set_custom_background_folder_enabled,
            list_context_menu_items,
            set_context_menu_item_enabled,
            //windows update
            modify_windows_update_time,
            //input method
            get_input_methods,
            get_available_input_methods,
            reorder_input_methods,
            add_input_method,
            remove_input_method,
            add_us_keyboard,
            open_input_method_settings,
            disable_chs_simplified_traditional_hotkey,
            get_wubi_lexicon_info,
            import_wubi_system_lexicon,
            import_wubi_user_phrases,
            export_wubi_user_phrases,
            restore_wubi_system_lexicon,
            open_ms_settings_page,
            //elevation
            is_elevated,
            restart_request_elevation,
            //backups explorer registry
            explorer_folder,
            backups_explorer_registry,
            explorer_registry_path,
            check_backups_explorer_registry,
            //backups port forwarding
            load_port_forwarding,
            backups_port_forwarding,
            backups_port_forwarding_default_path,
            //game
            scan_game_optimizer,
            apply_game_optimizer,
            benchmark_game_network,
            //steam
            get_steam_users,
            thoroughly_kill_steam,
            steam_is_running_by_tasklist,
            //apex
            get_apex_languages_depots,
            get_apex_launch_option,
            set_apex_launch_option,
            apply_apex_miles_language,
            check_apex_miles_language,
            open_apex_audio_folder_path,
            open_apex_depot_download_folder_path,
            apex_is_running,
            thoroughly_kill_apex,
            alter_q_ocr_available,
            alter_q_ocr_status,
            alter_q_ocr_download,
            alter_q_ocr_delete,
            alter_q_normalize_path,
            alter_q_list_steam_screenshot_dirs,
            alter_q_suggested_screenshot_dir,
            alter_q_latest_screenshot,
            alter_q_list_recent_screenshots,
            alter_q_screenshot_preview,
            alter_q_test_ocr,
            alter_q_compute_theta,
            alter_q_default_rois,
            alter_q_from_latest_screenshot,
            alter_q_open_ocr_settings,
            alter_q_set_close_to_tray,
            set_tray_locale,
            sync_tray_with_main_window,
            get_apex_video_config,
            get_apex_videoconfig_folder_path,
            set_apex_video_config,
            get_apex_videoconfig_readonly,
            set_apex_videoconfig_readonly,
            get_apex_config_file,
            get_apex_game_settings,
            apply_apex_game_settings,
            restore_apex_game_settings,
            get_ea_desktop_users,
            get_apex_launch_option_ea,
            set_apex_launch_option_ea,
            ea_desktop_is_running_by_tasklist,
            thoroughly_kill_ea_desktop,
            //pubg
            get_pubg_launch_option,
            set_pubg_launch_option,
            check_pubg_skip_intro_movies_disabled,
            set_pubg_skip_intro_movies_disabled,
            get_pubg_logs_folder_path,
            open_folder_detached,
            //windows user
            get_windows_users,
            add_windows_user,
            delete_windows_user,
            modify_windows_user_password,
            rename_windows_user,
            //rdp
            get_rdp_enabled,
            set_rdp_enabled,
            get_rdp_users,
            add_rdp_user,
            remove_rdp_user,
            get_rdp_port,
            set_rdp_port,
            check_remote_port,
            connect_rdp,
            save_rdp_connections,
            load_rdp_connections,
            export_rdp_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
