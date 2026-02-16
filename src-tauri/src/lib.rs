mod backups;
mod elevated;
mod game;
mod input_method;
mod port_forwarding;
mod registry;
mod system;
mod test;
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
use crate::game::{
    get_steam_users, steam_is_running, steam_is_running_by_tasklist, thoroughly_kill_steam,
};
use crate::port_forwarding::{
    create_multiple_port_forwarding, del_port_forwarding, get_port_forwarding,
    reset_port_forwarding, set_port_forwarding,
};
use crate::input_method::{get_input_methods, set_input_method_enabled, set_input_method_order};
use crate::registry::{
    get_all_common_folders, hide_common_folders, modify_windows_update_time, show_common_folders,
};
use crate::system::system_info;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    println!("Hello {}!", name);
    format!("Hello, {}! You've been greeted from Rust!", name)
}
#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    // 这行代码会打开开发者工具窗口
    println!("Opening devtools...");
    window.open_devtools();
    // 如果希望关闭，可以使用 window.close_devtools();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_devtools,
            //Port Forwarding
            create_multiple_port_forwarding,
            del_port_forwarding,
            set_port_forwarding,
            reset_port_forwarding,
            get_port_forwarding,
            //System
            system_info,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
