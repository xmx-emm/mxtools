use crate::log_info;
use crate::utils::{await_time, OUTPUT_FOLDER_CATEGORIZE};
use windows_tool::port_forwarding::backups::{backups_to_file, load_by_file};
use windows_tool::port_forwarding::PortForwarding;
use windows_tool::registry::backups::{
  backups_explorer_registry as backups_explorer,
  check_backups_explorer_registry as explorer_check,
};
use windows_tool::utils::filesystem::{
  backups_explorer_registry_path, backups_folder, backups_port_forwarding_json_path,
};

///反回是否有管理员权限
#[tauri::command]
pub fn check_backups_explorer_registry() -> bool {
    explorer_check(OUTPUT_FOLDER_CATEGORIZE)
}

///备份注册表
#[tauri::command]
pub fn backups_explorer_registry() -> bool {
    backups_explorer(OUTPUT_FOLDER_CATEGORIZE)
}

///备份资源管理器注册表路径
#[tauri::command]
pub fn explorer_registry_path() -> Result<String, String> {
    match backups_explorer_registry_path(OUTPUT_FOLDER_CATEGORIZE, true) {
        Some(path) => Ok(path),
        None => Err("Not find explorer path".to_string()),
    }
}

///备份资源管理器注册表路径
#[tauri::command]
pub fn explorer_folder() -> Result<String, String> {
    match backups_folder(OUTPUT_FOLDER_CATEGORIZE, true) {
        Some(path) => Ok(path.to_str().unwrap().to_string()),
        None => Err("Not find explorer path".to_string()),
    }
}

///备份端口转发
#[tauri::command]
pub fn backups_port_forwarding(output: String) -> bool {
    backups_to_file(output)
}

///备份端口转发
#[tauri::command]
pub fn backups_port_forwarding_default_path() -> Option<String> {
    backups_port_forwarding_json_path(OUTPUT_FOLDER_CATEGORIZE, true)
}

///加载端口转发
#[tauri::command]
pub async fn load_port_forwarding(filepath: String) -> bool {
    log_info!("Loading port forwarding {}", filepath);
    match load_by_file(filepath) {
        Some(list) => {
            log_info!("load by file {:?}", list);
            if !list.is_empty() {
                PortForwarding::new_multiple(list);
                await_time().await;
            }
            true
        }
        None => false,
    }
}
