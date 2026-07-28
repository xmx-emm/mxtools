use crate::elevated::require_elevated;
use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::poll_until;
use windows_tool::port_forwarding::PortForwarding;

#[tauri::command]
pub fn get_port_forwarding() -> IpcResult<Vec<PortForwarding>> {
    PortForwarding::get_ipv4_to_ipv4()
        .map_err(|error| IpcError::operation_failed("port_forwarding", error))
}

#[tauri::command]
pub async fn reset_port_forwarding() -> IpcResult<Vec<PortForwarding>> {
    require_elevated().map_err(|error| IpcError::operation_failed("port_forwarding", error))?;
    PortForwarding::reset()
        .map_err(|error| IpcError::operation_failed("port_forwarding", error))?;
    if !poll_until(|| {
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
    PortForwarding::get_ipv4_to_ipv4()
        .map_err(|error| IpcError::operation_failed("port_forwarding", error))
}

#[tauri::command]
pub async fn set_port_forwarding(item: PortForwarding) -> IpcResult<Vec<PortForwarding>> {
    require_elevated().map_err(|error| IpcError::operation_failed("port_forwarding", error))?;
    if !item.check_ipv_address() {
        return Err(IpcError::new(
            "port_forwarding.invalid_address",
            "Invalid IPv4 address or port",
        ));
    }
    PortForwarding::set(&item)
        .map_err(|error| IpcError::operation_failed("port_forwarding", error))?;
    if !poll_until(|| item.check().unwrap_or(false)).await {
        return Err(IpcError::new(
            "port_forwarding.set_timeout",
            "Timed out applying port forwarding rule",
        ));
    }
    PortForwarding::get_ipv4_to_ipv4()
        .map_err(|error| IpcError::operation_failed("port_forwarding", error))
}

#[tauri::command]
pub async fn create_multiple_port_forwarding(
    list: Vec<PortForwarding>,
) -> IpcResult<Vec<PortForwarding>> {
    require_elevated().map_err(|error| IpcError::operation_failed("port_forwarding", error))?;
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
    PortForwarding::new_multiple(expected)
        .map_err(|error| IpcError::operation_failed("port_forwarding", error))?;
    if !poll_until(|| {
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
    PortForwarding::get_ipv4_to_ipv4()
        .map_err(|error| IpcError::operation_failed("port_forwarding", error))
}

#[tauri::command]
pub async fn del_port_forwarding(item: PortForwarding) -> IpcResult<Vec<PortForwarding>> {
    require_elevated().map_err(|error| IpcError::operation_failed("port_forwarding", error))?;
    if !item.check_ipv_address() {
        return Err(IpcError::new(
            "port_forwarding.invalid_address",
            "Invalid IPv4 address or port",
        ));
    }
    item.del()
        .map_err(|error| IpcError::operation_failed("port_forwarding", error))?;
    if !poll_until(|| !item.check().unwrap_or(true)).await {
        return Err(IpcError::new(
            "port_forwarding.delete_timeout",
            "Timed out deleting port forwarding rule",
        ));
    }
    PortForwarding::get_ipv4_to_ipv4()
        .map_err(|error| IpcError::operation_failed("port_forwarding", error))
}
