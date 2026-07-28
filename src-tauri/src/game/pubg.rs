use crate::ipc_error::{IpcError, IpcResult};
use crate::log_info;
use crate::utils::blocking_cmd;
use windows_tool::game::pubg::{
    check_pubg_skip_intro_movies_disabled as check_skip_intro_movies_disabled,
    get_pubg_launch_options_by_steam_user_id, set_pubg_launch_options_by_steam_user_id,
    set_pubg_skip_intro_movies_disabled as set_skip_intro_movies_disabled,
};

#[tauri::command]
pub async fn get_pubg_launch_option(id: usize) -> IpcResult<String> {
    blocking_cmd(move || get_pubg_launch_options_by_steam_user_id(id))
        .await
        .map_err(|error| IpcError::operation_failed("pubg", error))
}

#[tauri::command]
pub async fn set_pubg_launch_option(id: usize, launch_option: String) -> IpcResult<()> {
    blocking_cmd(move || set_pubg_launch_options_by_steam_user_id(id, &launch_option))
        .await
        .map_err(|error| IpcError::operation_failed("pubg", error))
}

/// 检查“禁用开场动画”是否已生效(Movies 是否已重命名为 Movies_disabled)。
#[tauri::command]
pub async fn check_pubg_skip_intro_movies_disabled() -> IpcResult<bool> {
    blocking_cmd(check_skip_intro_movies_disabled)
        .await
        .map_err(|error| IpcError::operation_failed("pubg", error))
}

/// 设置“禁用开场动画”状态(Movies <-> Movies_disabled 可逆重命名)。
#[tauri::command]
pub async fn set_pubg_skip_intro_movies_disabled(disabled: bool) -> IpcResult<()> {
    blocking_cmd(move || set_skip_intro_movies_disabled(disabled))
        .await
        .map_err(|error| IpcError::operation_failed("pubg", error))
}

/// PUBG 客户端日志目录(%LOCALAPPDATA%\\TslGame\\Saved\\Logs),不存在则创建
#[tauri::command]
pub async fn get_pubg_logs_folder_path() -> IpcResult<String> {
    blocking_cmd(|| {
        #[cfg(windows)]
        {
            let local = std::env::var("LOCALAPPDATA")
                .map_err(|_| "pubg.errors.localAppDataMissing".to_string())?;
            let path = std::path::PathBuf::from(local)
                .join("TslGame")
                .join("Saved")
                .join("Logs");
            std::fs::create_dir_all(&path)
                .map_err(|e| format!("pubg.errors.createLogsDirFailed: {e}"))?;
            Ok(path.to_string_lossy().into_owned())
        }
        #[cfg(not(windows))]
        {
            let base = std::env::var("HOME").map_err(|_| "pubg.errors.homeMissing".to_string())?;
            let path = std::path::PathBuf::from(base)
                .join(".local/share")
                .join("TslGame")
                .join("Saved")
                .join("Logs");
            std::fs::create_dir_all(&path)
                .map_err(|e| format!("pubg.errors.createLogsDirFailed: {e}"))?;
            Ok(path.to_string_lossy().into_owned())
        }
    })
    .await
    .map_err(|error| IpcError::operation_failed("pubg", error))
}

#[cfg(windows)]
fn open_folder_windows(path: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use winapi::um::shellapi::ShellExecuteW;
    use winapi::um::winuser::SW_SHOWNORMAL;

    let normalized = path.trim().replace('/', "\\");
    assert_open_folder_path(&normalized)?;

    // 仅对用户目录自动创建；已存在的游戏/库路径只打开不创建。
    let p = std::path::Path::new(&normalized);
    if !p.exists() {
        if path_is_under_user_profile(&normalized) {
            std::fs::create_dir_all(&normalized)
                .map_err(|e| format!("pubg.errors.createDirFailed: {e}"))?;
        } else {
            return Err("pubg.errors.pathNotFound".into());
        }
    }

    let file_w: Vec<u16> = OsStr::new(&normalized)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let ret = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            ptr::null(),
            file_w.as_ptr(),
            ptr::null(),
            ptr::null(),
            SW_SHOWNORMAL,
        ) as isize
    };

    if ret > 32 {
        Ok(())
    } else {
        Err(format!("pubg.errors.shellExecuteFailed: {ret}"))
    }
}

fn assert_open_folder_path(path: &str) -> Result<(), String> {
    if path.is_empty() || path.contains('\0') {
        return Err("pubg.errors.emptyPath".into());
    }
    if path.contains("..") {
        return Err("pubg.errors.invalidPath".into());
    }
    let lower = path.to_ascii_lowercase();
    for b in [r"c:\windows", r"c:\programdata", r"\\.\"] {
        if lower == b || lower.starts_with(&format!("{b}\\")) {
            return Err("pubg.errors.pathNotAllowed".into());
        }
    }
    Ok(())
}

fn path_is_under_user_profile(path: &str) -> bool {
    let lower = path.replace('/', "\\").to_ascii_lowercase();
    for key in ["USERPROFILE", "APPDATA", "LOCALAPPDATA"] {
        if let Ok(base) = std::env::var(key) {
            let base = base.replace('/', "\\").to_ascii_lowercase();
            if lower == base || lower.starts_with(&format!("{base}\\")) {
                return true;
            }
        }
    }
    false
}

/// 在资源管理器中打开目录(先创建目录、宽字符 ShellExecute,失败再回退 explorer)
#[tauri::command]
pub async fn open_folder_detached(path: String) -> IpcResult<()> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err(IpcError::new(
            "pubg.empty_path",
            "The folder path is empty.",
        ));
    }
    log_info!("open_folder_detached: {}", path);
    blocking_cmd(move || {
        #[cfg(windows)]
        {
            open_folder_windows(&path).or_else(|e| {
                log_info!("ShellExecute 失败,尝试 explorer: {}", e);
                let normalized = path.replace('/', "\\");
                std::process::Command::new("explorer.exe")
                    .arg(normalized)
                    .spawn()
                    .map_err(|e2| format!("{e}; explorer: {e2}"))?;
                Ok(())
            })
        }
        #[cfg(not(windows))]
        {
            std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            std::process::Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
    })
    .await
    .map_err(|error| IpcError::operation_failed("pubg", error))
}
