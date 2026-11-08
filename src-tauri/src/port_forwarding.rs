use crate::elevated::require_elevated;
use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::{blocking_cmd, poll_until_blocking};
use windows_tool::port_forwarding::PortForwarding;

fn pf_error(error: String) -> IpcError {
    IpcError::operation_failed("port_forwarding", error)
}

#[tauri::command]
pub async fn get_port_forwarding() -> IpcResult<Vec<PortForwarding>> {
    blocking_cmd(PortForwarding::get_ipv4_to_ipv4)
        .await
        .map_err(pf_error)
}

#[tauri::command]
pub async fn reset_port_forwarding() -> IpcResult<Vec<PortForwarding>> {
    require_elevated().map_err(pf_error)?;
    blocking_cmd(PortForwarding::reset)
        .await
        .map_err(pf_error)?;
    if !poll_until_blocking(|| {
        PortForwarding::get_ipv4_to_ipv4()
            .map(|v| v.is_empty())
            .unwrap_or(false)
    })
    .await
    {
        return Err(IpcError::new(
            "port_forwarding.reset_timeout",
            "Timed out resetting port forwarding rules",
        ));
    }
    blocking_cmd(PortForwarding::get_ipv4_to_ipv4)
        .await
        .map_err(pf_error)
}

#[tauri::command]
pub async fn set_port_forwarding(item: PortForwarding) -> IpcResult<Vec<PortForwarding>> {
    require_elevated().map_err(pf_error)?;
    if !item.check_ipv_address() {
        return Err(IpcError::new(
            "port_forwarding.invalid_address",
            "Invalid IPv4 address or port",
        ));
    }
    let set_item = item.clone();
    blocking_cmd(move || PortForwarding::set(&set_item))
        .await
        .map_err(pf_error)?;
    if !poll_until_blocking(move || item.check().unwrap_or(false)).await {
        return Err(IpcError::new(
            "port_forwarding.set_timeout",
            "Timed out applying port forwarding rule",
        ));
    }
    blocking_cmd(PortForwarding::get_ipv4_to_ipv4)
        .await
        .map_err(pf_error)
}

#[tauri::command]
pub async fn create_multiple_port_forwarding(
    list: Vec<PortForwarding>,
) -> IpcResult<Vec<PortForwarding>> {
    require_elevated().map_err(pf_error)?;
    let expected: Vec<PortForwarding> = list
        .into_iter()
        .filter(PortForwarding::check_ipv_address)
        .collect();
    if expected.is_empty() {
        return Err(IpcError::new(
            "port_forwarding.no_valid_rules",
            "No valid port forwarding rules were supplied",
        ));
    }
    let check_list = expected.clone();
    blocking_cmd(move || PortForwarding::new_multiple(expected))
        .await
        .map_err(pf_error)?;
    if !poll_until_blocking(move || {
        let Ok(current) = PortForwarding::get_ipv4_to_ipv4() else {
            return false;
        };
        check_list
            .iter()
            .all(|want| current.iter().any(|c| c == want))
    })
    .await
    {
        return Err(IpcError::new(
            "port_forwarding.create_timeout",
            "Timed out creating port forwarding rules",
        ));
    }
    blocking_cmd(PortForwarding::get_ipv4_to_ipv4)
        .await
        .map_err(pf_error)
}

#[tauri::command]
pub async fn del_port_forwarding(item: PortForwarding) -> IpcResult<Vec<PortForwarding>> {
    require_elevated().map_err(pf_error)?;
    if !item.check_ipv_address() {
        return Err(IpcError::new(
            "port_forwarding.invalid_address",
            "Invalid IPv4 address or port",
        ));
    }
    let del_item = item.clone();
    blocking_cmd(move || del_item.del())
        .await
        .map_err(pf_error)?;
    if !poll_until_blocking(move || !item.check().unwrap_or(true)).await {
        return Err(IpcError::new(
            "port_forwarding.delete_timeout",
            "Timed out deleting port forwarding rule",
        ));
    }
    blocking_cmd(PortForwarding::get_ipv4_to_ipv4)
        .await
        .map_err(pf_error)
}
