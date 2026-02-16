use crate::utils::await_time;
use std::collections::HashMap;
use windows_tool::registry::common_folders::{get_all_state, get_common_folder_state, hide, show};
use windows_tool::registry::modify_windows_update_flight_settings_max_pause_days;

#[tauri::command]
pub fn get_all_common_folders() -> HashMap<String, bool> {
    get_all_state()
}

#[tauri::command]
pub fn modify_windows_update_time(days: i32) -> bool {
    modify_windows_update_flight_settings_max_pause_days(days)
}

#[tauri::command]
pub async fn hide_common_folders(key: String) -> Result<bool, String> {
    hide(&key);
    await_time().await;
    match get_common_folder_state(&key) {
        Ok(state) => Ok(state),
        Err(e) => Err(format!("Error {}", e.to_string())),
    }
}
#[tauri::command]
pub async fn show_common_folders(key: String) -> Result<bool, String> {
    show(&key);
    await_time().await;
    match get_common_folder_state(&key) {
        Ok(state) => Ok(state),
        Err(e) => Err(format!("Error {}", e.to_string())),
    }
}
