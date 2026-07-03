use crate::utils::{blocking_cmd, blocking_value};
use serde::Serialize;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
use windows_tool::utils::unit_conversion::{ByteConversionStandard, ByteToGB};

/// 主显示器信息(Apex 快速预设用)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrimaryDisplayInfo {
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: f64,
    pub max_refresh_rate: u32,
}

#[cfg(windows)]
fn get_primary_display_info_inner() -> Result<PrimaryDisplayInfo, String> {
    use std::mem::zeroed;
    use winapi::shared::minwindef::DWORD;
    use winapi::um::wingdi::DEVMODEW;
    use winapi::um::winuser::{EnumDisplaySettingsW, ENUM_CURRENT_SETTINGS};

    let mut current: DEVMODEW = unsafe { zeroed() };
    current.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
    let ok = unsafe {
        EnumDisplaySettingsW(
            std::ptr::null(),
            ENUM_CURRENT_SETTINGS,
            &mut current,
        )
    };
    if ok == 0 {
        return Err("无法读取主显示器当前分辨率".to_string());
    }

    let width = current.dmPelsWidth;
    let height = current.dmPelsHeight;
    if width == 0 || height == 0 {
        return Err("主显示器分辨率无效".to_string());
    }

    let mut max_refresh: DWORD = current.dmDisplayFrequency;
    let mut i: DWORD = 0;
    loop {
        let mut mode: DEVMODEW = unsafe { zeroed() };
        mode.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
        let ok = unsafe { EnumDisplaySettingsW(std::ptr::null(), i, &mut mode) };
        if ok == 0 {
            break;
        }
        if mode.dmDisplayFrequency > max_refresh {
            max_refresh = mode.dmDisplayFrequency;
        }
        i = i.saturating_add(1);
    }

    if max_refresh == 0 {
        max_refresh = 60;
    }

    let aspect_ratio = ((width as f64 / height as f64) * 10000.0).round() / 10000.0;

    Ok(PrimaryDisplayInfo {
        width,
        height,
        aspect_ratio,
        max_refresh_rate: max_refresh,
    })
}

#[cfg(not(windows))]
fn get_primary_display_info_inner() -> Result<PrimaryDisplayInfo, String> {
    Err("仅支持 Windows".to_string())
}

/// 获取主显示器分辨率、比例与最高刷新率
#[tauri::command]
pub async fn get_primary_display_info() -> Result<PrimaryDisplayInfo, String> {
    blocking_cmd(get_primary_display_info_inner).await
}

#[cfg(windows)]
fn get_cpu_model_from_registry() -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        .ok()
        .and_then(|k| k.get_value::<String, _>("ProcessorNameString").ok())
        .unwrap_or_else(|| String::new())
}

#[cfg(not(windows))]
fn get_cpu_model_from_registry() -> String {
    String::new()
}

#[cfg(windows)]
fn get_gpu_list() -> Vec<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    const DISPLAY_CLASS_GUID: &str =
        r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

    let mut gpus = Vec::new();
    let Ok(class_key) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(DISPLAY_CLASS_GUID) else {
        return gpus;
    };

    for subkey_name in class_key.enum_keys().filter_map(|k| k.ok()) {
        // 跳过 Properties 等非数字子键
        if subkey_name.chars().all(|c| c.is_ascii_digit()) {
            if let Ok(subkey) = class_key.open_subkey(&subkey_name) {
                if let Ok(desc) = subkey.get_value::<String, _>("DriverDesc") {
                    if !desc.is_empty() {
                        gpus.push(desc);
                    }
                }
            }
        }
    }

    gpus.sort();
    gpus.dedup();
    gpus
}

#[cfg(not(windows))]
fn get_gpu_list() -> Vec<String> {
    Vec::new()
}

#[tauri::command]
pub fn system_info() -> Vec<(String, String)> {
    let mut res: Vec<(String, String)> = Vec::new();
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );
    sys.refresh_all();

    // System
    let sys_name = System::name().unwrap_or_default();
    let kernel = System::kernel_version().unwrap_or_default();
    let os_ver = System::os_version().unwrap_or_default();
    let system_info = [sys_name, kernel, os_ver]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" | ");
    if !system_info.is_empty() {
        res.push(("System".to_string(), system_info));
    }

    // System host name
    res.push((
        "System host name".to_string(),
        System::host_name().unwrap_or_default(),
    ));

    // CPU：Windows 下 sysinfo 的 name() 常为空,优先用注册表
    let cpu_count = sys.cpus().len();
    let cpu_model = {
        let from_reg = get_cpu_model_from_registry();
        let from_reg = from_reg.trim();
        if !from_reg.is_empty() {
            from_reg.to_string()
        } else {
            sys.cpus()
                .first()
                .map(|c| c.name().trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_default()
        }
    };
    let freq_mhz = sys.cpus().first().map(|c| c.frequency()).unwrap_or(0);
    let cpu_display = if !cpu_model.is_empty() {
        if freq_mhz > 0 {
            format!("{} ({} cores, {} MHz)", cpu_model, cpu_count, freq_mhz)
        } else {
            format!("{} ({} cores)", cpu_model, cpu_count)
        }
    } else if cpu_count > 0 {
        format!("{} cores", cpu_count)
    } else {
        String::new()
    };
    if !cpu_display.is_empty() {
        res.push(("CPU".to_string(), cpu_display));
    }

    // Memory
    let total_memory = sys.total_memory().to_gb(ByteConversionStandard::Binary);
    res.push(("Memory".to_string(), format!("{:.1} GB", total_memory)));

    // GPU 列表：Windows 下从注册表读取
    for (i, name) in get_gpu_list().into_iter().enumerate() {
        res.push((format!("GPU {}", i + 1), name));
    }

    res
}

/// 系统物理内存总量(MB,`-maxMem` 常用单位)
#[tauri::command]
pub async fn system_total_memory_mb() -> Result<u64, String> {
    blocking_value(|| {
        let mut sys = System::new_with_specifics(
            RefreshKind::nothing().with_memory(MemoryRefreshKind::everything()),
        );
        sys.refresh_memory();
        sys.total_memory() / 1024 / 1024
    })
    .await
}
