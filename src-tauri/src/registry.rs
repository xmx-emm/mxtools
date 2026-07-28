use crate::elevated::require_elevated;
use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::await_time;
use std::collections::HashMap;
use windows_tool::registry::common_folders::{get_all_state, get_common_folder_state, hide, show};
use windows_tool::registry::context_menu::{
    self, ContextMenuHive, ContextMenuItem, CustomBackgroundFolder,
};
use windows_tool::registry::modify_windows_update_flight_settings_max_pause_days;

fn registry_error(error: String) -> IpcError {
    IpcError::operation_failed("registry", error)
}

#[tauri::command]
pub fn get_all_common_folders() -> HashMap<String, bool> {
    get_all_state()
}

#[tauri::command]
pub fn modify_windows_update_time(days: i32) -> IpcResult<bool> {
    require_elevated().map_err(registry_error)?;
    modify_windows_update_flight_settings_max_pause_days(days).map_err(registry_error)
}

#[tauri::command]
pub async fn hide_common_folders(key: String) -> IpcResult<bool> {
    require_elevated().map_err(registry_error)?;
    hide(&key).map_err(|e| registry_error(e.to_string()))?;
    await_time().await;
    get_common_folder_state(&key).map_err(|e| registry_error(format!("Error {}", e)))
}

#[tauri::command]
pub async fn show_common_folders(key: String) -> IpcResult<bool> {
    require_elevated().map_err(registry_error)?;
    show(&key).map_err(|e| registry_error(e.to_string()))?;
    await_time().await;
    get_common_folder_state(&key).map_err(|e| registry_error(format!("Error {}", e)))
}

#[tauri::command]
pub fn list_custom_background_folders() -> IpcResult<Vec<CustomBackgroundFolder>> {
    context_menu::list_custom_background_folders().map_err(registry_error)
}

#[tauri::command]
pub fn add_custom_background_folder(
    name: String,
    path: String,
) -> IpcResult<CustomBackgroundFolder> {
    context_menu::add_custom_background_folder(&name, &path).map_err(registry_error)
}

#[tauri::command]
pub fn remove_custom_background_folder(id: String) -> IpcResult<()> {
    context_menu::remove_custom_background_folder(&id).map_err(registry_error)
}

#[tauri::command]
pub fn set_custom_background_folder_enabled(id: String, enabled: bool) -> IpcResult<()> {
    context_menu::set_custom_background_folder_enabled(&id, enabled).map_err(registry_error)
}

#[tauri::command]
pub fn list_context_menu_items() -> IpcResult<Vec<ContextMenuItem>> {
    context_menu::list_context_menu_items().map_err(registry_error)
}

#[tauri::command]
pub fn set_context_menu_item_enabled(id: String, enabled: bool) -> IpcResult<ContextMenuItem> {
    let hive = context_menu::context_menu_item_hive(&id).map_err(registry_error)?;
    if hive == ContextMenuHive::HKLM {
        require_elevated().map_err(registry_error)?;
    }
    context_menu::set_context_menu_item_enabled(&id, enabled).map_err(registry_error)
}
