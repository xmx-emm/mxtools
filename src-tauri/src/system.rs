use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::{blocking_cmd, blocking_value};
use serde::Serialize;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
use windows_tool::utils::unit_conversion::{ByteConversionStandard, ByteToGB};

fn system_error(error: String) -> IpcError {
    IpcError::operation_failed("system", error)
}

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
    let ok = unsafe { EnumDisplaySettingsW(std::ptr::null(), ENUM_CURRENT_SETTINGS, &mut current) };
    if ok == 0 {
        return Err("system.errors.displayReadFailed".to_string());
    }

    let width = current.dmPelsWidth;
    let height = current.dmPelsHeight;
    if width == 0 || height == 0 {
        return Err("system.errors.displayInvalid".to_string());
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
    Err("system.errors.windowsOnly".to_string())
}

/// 获取主显示器分辨率、比例与最高刷新率
#[tauri::command]
pub async fn get_primary_display_info() -> IpcResult<PrimaryDisplayInfo> {
    blocking_cmd(get_primary_display_info_inner)
        .await
        .map_err(system_error)
}

#[cfg(windows)]
fn get_cpu_model_from_registry() -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        .ok()
        .and_then(|k| k.get_value::<String, _>("ProcessorNameString").ok())
        .unwrap_or_default()
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
pub async fn system_info() -> IpcResult<Vec<(String, String)>> {
    blocking_value(system_info_inner)
        .await
        .map_err(system_error)
}

fn system_info_inner() -> Vec<(String, String)> {
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
pub async fn system_total_memory_mb() -> IpcResult<u64> {
    blocking_value(|| {
        let mut sys = System::new_with_specifics(
            RefreshKind::nothing().with_memory(MemoryRefreshKind::everything()),
        );
        sys.refresh_memory();
        sys.total_memory() / 1024 / 1024
    })
    .await
    .map_err(system_error)
}

const MAX_UTF8_FILE_BYTES: u64 = 8 * 1024 * 1024;

/// 拒绝系统敏感目录与路径穿越；允许用户目录及对话框所选的普通盘符路径。
fn assert_user_data_path(path: &str) -> Result<std::path::PathBuf, String> {
    let raw = path.trim();
    if raw.is_empty() {
        return Err("system.errors.invalidPath".to_string());
    }
    if raw.contains('\0') || raw.chars().any(|c| c.is_control()) {
        return Err("system.errors.invalidPath".to_string());
    }
    let p = std::path::PathBuf::from(raw);
    if !p.is_absolute() {
        return Err("system.errors.pathMustBeAbsolute".to_string());
    }
    if p.components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("system.errors.invalidPath".to_string());
    }

    let lower = raw.replace('/', "\\").to_ascii_lowercase();
    let blocked_prefixes = [
        r"c:\windows\",
        r"c:\windows",
        r"c:\program files\",
        r"c:\program files (x86)\",
        r"c:\programdata\",
        r"\\.\",
    ];
    // 精确匹配根目录或带子路径
    for b in blocked_prefixes {
        if lower == b.trim_end_matches('\\') || lower.starts_with(b) {
            // Steam 等安装在 Program Files 下时，仅禁止写入系统目录；
            // 读写 utf8 配置快照不应落在这些路径。
            return Err("system.errors.pathNotAllowed".to_string());
        }
    }
    Ok(p)
}

/// 读取 UTF-8 文本文件（配置快照导入等）
#[tauri::command]
pub async fn read_utf8_file(path: String) -> IpcResult<String> {
    blocking_cmd(move || {
        let path = assert_user_data_path(&path)?;
        let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        if !meta.is_file() {
            return Err("system.errors.notAFile".to_string());
        }
        if meta.len() > MAX_UTF8_FILE_BYTES {
            return Err("system.errors.fileTooLarge".to_string());
        }
        std::fs::read_to_string(&path).map_err(|e| e.to_string())
    })
    .await
    .map_err(system_error)
}

/// 写入 UTF-8 文本文件（配置快照导出等）
#[tauri::command]
pub async fn write_utf8_file(path: String, content: String) -> IpcResult<()> {
    if content.len() as u64 > MAX_UTF8_FILE_BYTES {
        return Err(IpcError::new(
            "system.file_too_large",
            "File exceeds the maximum allowed size",
        ));
    }
    blocking_cmd(move || {
        let path = assert_user_data_path(&path)?;
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())
    })
    .await
    .map_err(system_error)
}
