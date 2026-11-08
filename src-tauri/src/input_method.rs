//! Tauri commands for Windows input method management (delegates to windows_tool).

use crate::elevated::require_elevated;
use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::blocking_cmd;

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
pub async fn get_input_methods() -> IpcResult<Vec<InputMethodItem>> {
    #[cfg(windows)]
    {
        blocking_cmd(wt_get).await.map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn get_available_input_methods() -> IpcResult<Vec<InputMethodItem>> {
    #[cfg(windows)]
    {
        blocking_cmd(wt_available).await.map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn reorder_input_methods(ids: Vec<String>) -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(move || wt_reorder(ids))
            .await
            .map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        let _ = ids;
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn add_input_method(id: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(move || wt_add(&id))
            .await
            .map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        let _ = id;
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn remove_input_method(id: String, tip: Option<String>) -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(move || wt_remove(&id, tip.as_deref()))
            .await
            .map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        let _ = (id, tip);
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn add_us_keyboard() -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(wt_add_us).await.map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn open_input_method_settings(id: String, name: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(move || {
            let uri = wt_settings_uri(&id, &name)?;
            open_ms_settings(&uri)
        })
        .await
        .map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        let _ = (id, name);
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn disable_chs_simplified_traditional_hotkey() -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(wt_disable_hotkey)
            .await
            .map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn get_wubi_lexicon_info() -> IpcResult<WubiLexiconInfo> {
    #[cfg(windows)]
    {
        blocking_cmd(wt_wubi_info).await.map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn import_wubi_system_lexicon(file_path: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(move || {
            require_elevated()?;
            let validated = crate::system::assert_user_data_path(&file_path)?;
            wt_import_sys(&validated.to_string_lossy())
        })
        .await
        .map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        let _ = file_path;
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn import_wubi_user_phrases(file_path: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(move || {
            let validated = crate::system::assert_user_data_path(&file_path)?;
            wt_import_udp(&validated.to_string_lossy())
        })
        .await
        .map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        let _ = file_path;
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn export_wubi_user_phrases(file_path: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(move || {
            let validated = crate::system::assert_user_data_path(&file_path)?;
            wt_export_udp(&validated.to_string_lossy())
        })
        .await
        .map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        let _ = file_path;
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn restore_wubi_system_lexicon(backup_id: Option<String>) -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(move || {
            require_elevated()?;
            wt_restore_sys(backup_id)
        })
        .await
        .map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        let _ = backup_id;
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}

#[tauri::command]
pub async fn open_ms_settings_page(uri: String) -> IpcResult<()> {
    #[cfg(windows)]
    {
        blocking_cmd(move || open_ms_settings(&uri))
            .await
            .map_err(input_method_error)
    }
    #[cfg(not(windows))]
    {
        let _ = uri;
        Err(IpcError::new("input_method.windows_only", NOT_WINDOWS))
    }
}
