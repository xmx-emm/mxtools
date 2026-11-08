use crate::elevated::require_elevated;
use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::{await_time, blocking_cmd, blocking_value};
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
pub async fn get_all_common_folders() -> HashMap<String, bool> {
    blocking_value(get_all_state).await.unwrap_or_default()
}

#[tauri::command]
pub async fn modify_windows_update_time(days: i32) -> IpcResult<bool> {
    blocking_cmd(move || {
        require_elevated()?;
        modify_windows_update_flight_settings_max_pause_days(days)
    })
    .await
    .map_err(registry_error)
}

#[tauri::command]
pub async fn hide_common_folders(key: String) -> IpcResult<bool> {
    require_elevated().map_err(registry_error)?;
    let hide_key = key.clone();
    blocking_cmd(move || hide(&hide_key).map_err(|e| e.to_string()))
        .await
        .map_err(registry_error)?;
    await_time().await;
    blocking_cmd(move || get_common_folder_state(&key).map_err(|e| format!("Error {}", e)))
        .await
        .map_err(registry_error)
}

#[tauri::command]
pub async fn show_common_folders(key: String) -> IpcResult<bool> {
    require_elevated().map_err(registry_error)?;
    let show_key = key.clone();
    blocking_cmd(move || show(&show_key).map_err(|e| e.to_string()))
        .await
        .map_err(registry_error)?;
    await_time().await;
    blocking_cmd(move || get_common_folder_state(&key).map_err(|e| format!("Error {}", e)))
        .await
        .map_err(registry_error)
}

#[tauri::command]
pub async fn list_custom_background_folders() -> IpcResult<Vec<CustomBackgroundFolder>> {
    blocking_cmd(context_menu::list_custom_background_folders)
        .await
        .map_err(registry_error)
}

#[tauri::command]
pub async fn add_custom_background_folder(
    name: String,
    path: String,
) -> IpcResult<CustomBackgroundFolder> {
    blocking_cmd(move || context_menu::add_custom_background_folder(&name, &path))
        .await
        .map_err(registry_error)
}

#[tauri::command]
pub async fn remove_custom_background_folder(id: String) -> IpcResult<()> {
    blocking_cmd(move || context_menu::remove_custom_background_folder(&id))
        .await
        .map_err(registry_error)
}

#[tauri::command]
pub async fn set_custom_background_folder_enabled(id: String, enabled: bool) -> IpcResult<()> {
    blocking_cmd(move || context_menu::set_custom_background_folder_enabled(&id, enabled))
        .await
        .map_err(registry_error)
}

#[tauri::command]
pub async fn list_context_menu_items() -> IpcResult<Vec<ContextMenuItem>> {
    blocking_cmd(context_menu::list_context_menu_items)
        .await
        .map_err(registry_error)
}

#[tauri::command]
pub async fn set_context_menu_item_enabled(
    id: String,
    enabled: bool,
) -> IpcResult<ContextMenuItem> {
    blocking_cmd(move || {
        let hive = context_menu::context_menu_item_hive(&id)?;
        if hive == ContextMenuHive::HKLM {
            require_elevated()?;
        }
        context_menu::set_context_menu_item_enabled(&id, enabled)
    })
    .await
    .map_err(registry_error)
}
