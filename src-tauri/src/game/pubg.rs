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
fn shell_execute_open_dir(dir: &std::path::Path) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use winapi::um::shellapi::ShellExecuteW;
    use winapi::um::winuser::SW_SHOWNORMAL;

    let verb_w: Vec<u16> = OsStr::new("explore")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let file_w: Vec<u16> = dir
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let ret = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            verb_w.as_ptr(),
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

pub(crate) fn assert_open_folder_path(path: &str) -> Result<std::path::PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err("pubg.errors.emptyPath".into());
    }
    if trimmed.starts_with('-') || trimmed.starts_with('/') || trimmed.starts_with(',') {
        return Err("pubg.errors.invalidPath".into());
    }
    crate::system::validate_local_path_with_rules(
        trimmed,
        false,
        false,
        crate::system::PathValidationErrors {
            empty: "pubg.errors.emptyPath",
            invalid: "pubg.errors.invalidPath",
            not_absolute: "pubg.errors.invalidPath",
            not_allowed: "pubg.errors.pathNotAllowed",
        },
    )
}

fn path_is_under_user_profile(path: &std::path::Path) -> bool {
    let lower = path
        .to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase();
    for key in ["USERPROFILE", "APPDATA", "LOCALAPPDATA"] {
        if let Ok(base) = std::env::var(key) {
            let base = base
                .trim()
                .replace('/', "\\")
                .trim_end_matches('\\')
                .to_ascii_lowercase();
            if !base.is_empty() && (lower == base || lower.starts_with(&format!("{base}\\"))) {
                return true;
            }
        }
    }
    false
}

pub(crate) fn prepare_open_folder_target(raw: &str) -> Result<std::path::PathBuf, String> {
    let validated = assert_open_folder_path(raw)?;

    // 仅对用户目录自动创建；已存在的游戏/库路径只打开不创建。
    if !validated.exists() {
        if path_is_under_user_profile(&validated) {
            std::fs::create_dir_all(&validated)
                .map_err(|e| format!("pubg.errors.createDirFailed: {e}"))?;
        } else {
            return Err("pubg.errors.pathNotFound".into());
        }
    }

    #[cfg(windows)]
    let resolved = {
        let canon = std::fs::canonicalize(&validated)
            .map_err(|_| "pubg.errors.pathNotFound".to_string())?;
        let norm = crate::system::normalize_canonical_windows_path(&canon)
            .ok_or_else(|| "pubg.errors.pathNotAllowed".to_string())?;
        if crate::system::is_under_protected_windows_root(&norm, false) {
            return Err("pubg.errors.pathNotAllowed".into());
        }
        norm
    };

    #[cfg(not(windows))]
    let resolved =
        std::fs::canonicalize(&validated).map_err(|_| "pubg.errors.pathNotFound".to_string())?;

    let meta = std::fs::metadata(&resolved).map_err(|_| "pubg.errors.pathNotFound".to_string())?;
    if !meta.is_dir() {
        return Err("pubg.errors.notADirectory".into());
    }

    Ok(resolved)
}

/// 在资源管理器中打开目录(先校验并确认目录存在，宽字符 ShellExecute 失败再安全回退 explorer)
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
        let target_dir = prepare_open_folder_target(&path)?;
        #[cfg(windows)]
        {
            shell_execute_open_dir(&target_dir).or_else(|e| {
                use std::os::windows::process::CommandExt;
                log_info!("ShellExecute 失败,尝试 explorer: {}", e);
                let dir_str = target_dir.to_string_lossy();
                if dir_str.contains('"') {
                    return Err("pubg.errors.invalidPath".to_string());
                }
                std::process::Command::new("explorer.exe")
                    .raw_arg(format!("\"{dir_str}\""))
                    .spawn()
                    .map_err(|e2| format!("{e}; explorer: {e2}"))?;
                Ok(())
            })
        }
        #[cfg(not(windows))]
        {
            std::process::Command::new("xdg-open")
                .arg(&target_dir)
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        }
    })
    .await
    .map_err(|error| IpcError::operation_failed("pubg", error))
}
