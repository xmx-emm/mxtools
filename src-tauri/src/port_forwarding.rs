use crate::utils::await_time;
use windows_tool::port_forwarding::PortForwarding;

#[tauri::command]
pub fn get_port_forwarding() -> Vec<PortForwarding> {
    let items = PortForwarding::get_ipv4_to_ipv4();
    items
}

#[tauri::command]
pub async fn reset_port_forwarding() -> Vec<PortForwarding> {
    PortForwarding::reset();
    await_time().await;
    PortForwarding::get_ipv4_to_ipv4()
}

#[tauri::command]
pub async fn set_port_forwarding(item: PortForwarding) -> Vec<PortForwarding> {
    PortForwarding::set(&item);
    await_time().await;
    PortForwarding::get_ipv4_to_ipv4()
}

#[tauri::command]
pub async fn create_multiple_port_forwarding(list: Vec<PortForwarding>) -> Vec<PortForwarding> {
    PortForwarding::new_multiple(list);
    await_time().await;
    PortForwarding::get_ipv4_to_ipv4()
}

#[tauri::command]
pub async fn del_port_forwarding(item: PortForwarding) -> bool {
    item.del();
    await_time().await;
    !item.check()
}
