mod backups;
mod elevated;
mod game;
mod input_method;
mod logger;
mod port_forwarding;
mod rdp;
mod registry;
mod stdio_tee;
mod system;
mod test;
mod user;
mod utils;

use crate::backups::{
  backups_explorer_registry, backups_port_forwarding, backups_port_forwarding_default_path,
  check_backups_explorer_registry, explorer_folder, explorer_registry_path, load_port_forwarding,
};
use crate::elevated::{is_elevated, restart_request_elevation};
use crate::game::apex::{
  apply_apex_miles_language, check_apex_miles_language, get_apex_languages_depots,
  get_apex_launch_option, open_apex_audio_folder_path, open_apex_depot_download_folder_path,
  set_apex_launch_option,
};
use crate::game::pubg::{
  check_pubg_skip_intro_movies_disabled, get_pubg_launch_option, get_pubg_logs_folder_path,
  open_folder_detached, set_pubg_launch_option, set_pubg_skip_intro_movies_disabled,
};
use crate::game::{
  ea_desktop_is_running_by_tasklist, get_apex_launch_option_ea, get_ea_desktop_users,
  get_steam_users, set_apex_launch_option_ea, steam_is_running, steam_is_running_by_tasklist,
  thoroughly_kill_ea_desktop, thoroughly_kill_steam,
};
use crate::input_method::{get_input_methods, set_input_method_enabled, set_input_method_order};
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
  get_all_common_folders, hide_common_folders, modify_windows_update_time, show_common_folders,
};
use crate::system::{system_info, system_total_memory_mb};
use crate::user::{
  add_windows_user, delete_windows_user, get_windows_users, modify_windows_user_password,
  rename_windows_user,
};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    log_info!("Hello {}!", name);
    format!("Hello, {}! You've been greeted from Rust!", name)
}
#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    #[cfg(debug_assertions)]
    {
        log_info!("Opening devtools...");
        window.open_devtools();
    }
    #[cfg(not(debug_assertions))]
    let _ = window;
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
    #[cfg(windows)]
    init_windows_console_utf8();
    logger::init_log_path();
    tauri::Builder::default()
        .plugin(tauri_plugin_pinia::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // 日志及调试控制台
            greet,
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
            //System
            system_info,
            system_total_memory_mb,
            //Common Folders
            get_all_common_folders,
            hide_common_folders,
            show_common_folders,
            //windows update
            modify_windows_update_time,
            //input method
            get_input_methods,
            set_input_method_order,
            set_input_method_enabled,
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
            //steam
            steam_is_running,
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
