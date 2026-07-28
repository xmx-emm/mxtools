use crate::elevated::require_elevated;
use crate::ipc_error::{IpcError, IpcResult};
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

/// 单次导入允许的最大规则数，防止异常大 JSON DoS。
const MAX_PORT_FORWARDING_IMPORT_RULES: usize = 256;

fn validate_port_forwarding_import(list: &[PortForwarding]) -> Result<(), String> {
    if list.len() > MAX_PORT_FORWARDING_IMPORT_RULES {
        return Err(format!(
            "Too many port forwarding rules: {} (max {})",
            list.len(),
            MAX_PORT_FORWARDING_IMPORT_RULES
        ));
    }
    for (i, rule) in list.iter().enumerate() {
        // check_ipv_address 同时校验地址合法与端口非 0；端口类型为 u16，无需再做上界检查
        if !rule.check_ipv_address() {
            return Err(format!(
                "Rule #{} has invalid IPv4 listen/connect address or zero port",
                i + 1
            ));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn check_backups_explorer_registry() -> bool {
    explorer_check(OUTPUT_FOLDER_CATEGORIZE)
}

#[tauri::command]
pub fn backups_explorer_registry() -> IpcResult<bool> {
    require_elevated().map_err(|error| IpcError::operation_failed("backups", error))?;
    Ok(backups_explorer(OUTPUT_FOLDER_CATEGORIZE))
}

#[tauri::command]
pub fn explorer_registry_path() -> IpcResult<String> {
    match backups_explorer_registry_path(OUTPUT_FOLDER_CATEGORIZE, true) {
        Some(path) => Ok(path),
        None => Err(IpcError::new(
            "backups.explorer_path_not_found",
            "Not find explorer path",
        )),
    }
}

#[tauri::command]
pub fn explorer_folder() -> IpcResult<String> {
    match backups_folder(OUTPUT_FOLDER_CATEGORIZE, true) {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err(IpcError::new(
            "backups.explorer_path_not_found",
            "Not find explorer path",
        )),
    }
}

#[tauri::command]
pub fn backups_port_forwarding(output: String) -> IpcResult<bool> {
    require_elevated().map_err(|error| IpcError::operation_failed("backups", error))?;
    backups_to_file(output).map_err(|error| IpcError::operation_failed("backups", error))
}

#[tauri::command]
pub fn backups_port_forwarding_default_path() -> Option<String> {
    backups_port_forwarding_json_path(OUTPUT_FOLDER_CATEGORIZE, true)
}

#[tauri::command]
pub async fn load_port_forwarding(filepath: String) -> IpcResult<Vec<PortForwarding>> {
    require_elevated().map_err(|error| IpcError::operation_failed("backups", error))?;
    log_info!("Loading port forwarding {}", filepath);
    let list =
        load_by_file(&filepath).map_err(|error| IpcError::operation_failed("backups", error))?;
    validate_port_forwarding_import(&list)
        .map_err(|error| IpcError::operation_failed("backups", error))?;
    log_info!("load by file validated, {} rules", list.len());
    if !list.is_empty() {
        PortForwarding::new_multiple(list)
            .map_err(|error| IpcError::operation_failed("backups", error))?;
        await_time().await;
    }
    PortForwarding::get_ipv4_to_ipv4().map_err(|error| IpcError::operation_failed("backups", error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_tool::port_forwarding::PortForwarding;

    #[test]
    fn rejects_too_many_rules() {
        let list: Vec<PortForwarding> = (0..MAX_PORT_FORWARDING_IMPORT_RULES + 1)
            .map(|i| {
                PortForwarding::new(
                    ("127.0.0.1", (i as u16).saturating_add(1)),
                    ("127.0.0.1", 1),
                )
            })
            .collect();
        assert!(validate_port_forwarding_import(&list).is_err());
    }

    #[test]
    fn rejects_bad_address() {
        let list = vec![PortForwarding::new(("not.an.ip", 80), ("127.0.0.1", 8080))];
        assert!(validate_port_forwarding_import(&list).is_err());
    }

    #[test]
    fn accepts_valid_rules() {
        let list = vec![PortForwarding::new(("127.0.0.1", 100), ("10.0.0.1", 200))];
        assert!(validate_port_forwarding_import(&list).is_ok());
    }
}
