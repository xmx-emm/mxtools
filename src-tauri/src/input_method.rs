//! Tauri commands for Windows input method management (delegates to windows_tool).

use crate::elevated::require_elevated;
use crate::ipc_error::{IpcError, IpcResult};

fn input_method_error(error: String) -> IpcError {
    IpcError::operation_failed("input_method", error)
}

#[cfg(windows)]
use windows_tool::input_method::{
    add_input_method as wt_add, add_us_keyboard as wt_add_us,
    disable_chs_simplified_traditional_hotkey as wt_disable_hotkey,
    export_wubi_user_phrases as wt_export_udp, get_available_input_methods as wt_available,
    get_input_methods as wt_get, get_wubi_lexicon_info as wt_wubi_info,
    import_wubi_system_lexicon as wt_import_sys, import_wubi_user_phrases as wt_import_udp,
    input_method_settings_uri as wt_settings_uri, remove_input_method as wt_remove,
    reorder_input_methods as wt_reorder, restore_wubi_system_lexicon as wt_restore_sys,
    InputMethodItem, WubiLexiconInfo,
};

#[cfg(not(windows))]
#[derive(serde::Serialize, Clone, Debug)]
pub struct InputMethodItem {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub lang_id: String,
    pub enabled: bool,
    pub order: u32,
    pub settings_uri: Option<String>,
    pub capabilities: serde_json::Value,
    pub input_method_tip: Option<String>,
}

#[cfg(not(windows))]
#[derive(serde::Serialize, Clone, Debug)]
pub struct WubiLexiconInfo {
    pub system_lex_path: String,
    pub system_lex_size: u64,
    pub user_udp_path: String,
    pub user_udp_size: u64,
    pub backups: Vec<String>,
    pub has_wubi_installed: bool,
}

#[cfg(windows)]
fn open_ms_settings(uri: &str) -> Result<(), String> {
    let uri = uri.trim();
    if !uri.to_ascii_lowercase().starts_with("ms-settings:")
        || uri
            .chars()
            .any(|c| matches!(c, '"' | '\'' | '&' | '|' | '>' | '<' | '\r' | '\n' | '\0'))
    {
        return Err("inputMethod.errors.openSettings: invalid uri".to_string());
    }
    // 直接启动协议，避免 `cmd /C start` 元字符风险
    std::process::Command::new("explorer.exe")
        .arg(uri)
        .spawn()
        .map_err(|e| format!("inputMethod.errors.openSettings: {}", e))?;
    Ok(())
}

#[cfg(not(windows))]
const NOT_WINDOWS: &str = "Input method management is only supported on Windows";

#[tauri::command]
pub fn get_input_methods() -> IpcResult<Vec<InputMethodItem>> {
    #[cfg(windows)]
    {
        wt_get().map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn get_available_input_methods() -> IpcResult<Vec<InputMethodItem>> {
    #[cfg(windows)]
    {
        wt_available().map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn reorder_input_methods(ids: Vec<String>) -> IpcResult<()> {
    #[cfg(windows)]
    {
        wt_reorder(ids).map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn add_input_method(id: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        wt_add(&id).map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn remove_input_method(id: String, tip: Option<String>) -> IpcResult<()> {
    #[cfg(windows)]
    {
        wt_remove(&id, tip.as_deref()).map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn add_us_keyboard() -> IpcResult<()> {
    #[cfg(windows)]
    {
        wt_add_us().map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn open_input_method_settings(id: String, name: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        let uri = wt_settings_uri(&id, &name).map_err(input_method_error)?;
        open_ms_settings(&uri).map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn disable_chs_simplified_traditional_hotkey() -> IpcResult<()> {
    #[cfg(windows)]
    {
        wt_disable_hotkey().map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn get_wubi_lexicon_info() -> IpcResult<WubiLexiconInfo> {
    #[cfg(windows)]
    {
        wt_wubi_info().map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn import_wubi_system_lexicon(file_path: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        require_elevated().map_err(input_method_error)?;
        wt_import_sys(&file_path).map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn import_wubi_user_phrases(file_path: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        wt_import_udp(&file_path).map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn export_wubi_user_phrases(file_path: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        wt_export_udp(&file_path).map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn restore_wubi_system_lexicon(backup_id: Option<String>) -> IpcResult<()> {
    #[cfg(windows)]
    {
        require_elevated().map_err(input_method_error)?;
        wt_restore_sys(backup_id).map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub fn open_ms_settings_page(uri: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        open_ms_settings(&uri).map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}
