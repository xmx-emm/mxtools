use std::collections::HashMap;
use sysinfo::System;
use windows_tool::utils::unit_conversion::{ByteConversionStandard, ByteToGB};

#[tauri::command]
pub fn system_info() -> HashMap<String, String> {
    let mut res: HashMap<String, String> = HashMap::new();
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_memory = sys.total_memory().to_gb(ByteConversionStandard::Binary);
    let used_memory = sys.used_memory().to_gb(ByteConversionStandard::Binary);
    let total_swap = sys.total_swap().to_gb(ByteConversionStandard::Binary);
    let used_swap = sys.used_swap().to_gb(ByteConversionStandard::Binary);

    res.insert("Total memory".to_string(), format!("{} GB", total_memory));
    res.insert("Used memory".to_string(), format!("{} GB", used_memory));
    res.insert("Total swap".into(), format!("{} GB", total_swap));
    res.insert("Used swap".to_string(), format!("{} GB", used_swap));

    res.insert(
        "System name".to_string(),
        System::name().unwrap_or_default(),
    );
    res.insert(
        "System kernel version".to_string(),
        System::kernel_version().unwrap_or_default(),
    );
    res.insert(
        "System OS version".to_string(),
        System::os_version().unwrap_or_default(),
    );
    res.insert(
        "System host name".to_string(),
        System::host_name().unwrap_or_default(),
    );

    res.insert("CPUs".to_string(), sys.cpus().len().to_string());
    res
}
