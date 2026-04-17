use crate::log_info;
use windows_tool::game::pubg::{
  get_pubg_launch_options_by_steam_user_id, set_pubg_launch_options_by_steam_user_id,
  check_pubg_skip_intro_movies_disabled as check_skip_intro_movies_disabled,
  set_pubg_skip_intro_movies_disabled as set_skip_intro_movies_disabled,
};

#[tauri::command]
pub fn get_pubg_launch_option(id: usize) -> Result<String, String> {
  get_pubg_launch_options_by_steam_user_id(id)
}

#[tauri::command]
pub fn set_pubg_launch_option(id: usize, launch_option: String) -> Result<(), String> {
  set_pubg_launch_options_by_steam_user_id(id, &launch_option)
}

/// 检查“禁用开场动画”是否已生效（Movies 是否已重命名为 Movies_disabled）。
#[tauri::command]
pub fn check_pubg_skip_intro_movies_disabled() -> Result<bool, String> {
  check_skip_intro_movies_disabled()
}

/// 设置“禁用开场动画”状态（Movies <-> Movies_disabled 可逆重命名）。
#[tauri::command]
pub fn set_pubg_skip_intro_movies_disabled(disabled: bool) -> Result<(), String> {
  set_skip_intro_movies_disabled(disabled)
}

/// PUBG 客户端日志目录(%LOCALAPPDATA%\\TslGame\\Saved\\Logs),不存在则创建
#[tauri::command]
pub fn get_pubg_logs_folder_path() -> Result<String, String> {
  #[cfg(windows)]
  {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "未设置 LOCALAPPDATA".to_string())?;
    let path = std::path::PathBuf::from(local)
      .join("TslGame")
      .join("Saved")
      .join("Logs");
    std::fs::create_dir_all(&path).map_err(|e| format!("创建日志目录失败: {e}"))?;
    return Ok(path.to_string_lossy().into_owned());
  }
  #[cfg(not(windows))]
  {
    let base = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let path = std::path::PathBuf::from(base)
      .join(".local/share")
      .join("TslGame")
      .join("Saved")
      .join("Logs");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
  }
}

#[cfg(windows)]
fn open_folder_windows(path: &str) -> Result<(), String> {
  use std::ffi::OsStr;
  use std::os::windows::ffi::OsStrExt;
  use std::ptr;
  use winapi::um::shellapi::ShellExecuteW;
  use winapi::um::winuser::SW_SHOWNORMAL;

  let normalized = path.trim().replace('/', "\\");
  std::fs::create_dir_all(&normalized).map_err(|e| format!("创建目录失败: {e}"))?;

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
    Err(format!("ShellExecuteW 返回 {ret}"))
  }
}

/// 在资源管理器中打开目录(先创建目录、宽字符 ShellExecute,失败再回退 explorer)
#[tauri::command]
pub fn open_folder_detached(path: String) -> Result<(), String> {
  let path = path.trim().to_string();
  if path.is_empty() {
    return Err("empty path".into());
  }
  log_info!("open_folder_detached: {}", path);
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
}
