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
        if mode.dmPelsWidth == width
            && mode.dmPelsHeight == height
            && mode.dmDisplayFrequency > max_refresh
        {
            max_refresh = mode.dmDisplayFrequency;
        }
        i = i.saturating_add(1);
    }

    if max_refresh <= 1 {
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
    let sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );

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

#[derive(Debug, Clone, Copy)]
pub(crate) struct PathValidationErrors<'a> {
    pub empty: &'a str,
    pub invalid: &'a str,
    pub not_absolute: &'a str,
    pub not_allowed: &'a str,
}

fn protected_windows_roots(include_program_files: bool) -> Vec<String> {
    let mut roots = vec![r"c:\windows".to_string(), r"c:\programdata".to_string()];
    if include_program_files {
        roots.push(r"c:\program files".to_string());
        roots.push(r"c:\program files (x86)".to_string());
    }
    let env_keys: &[&str] = if include_program_files {
        &[
            "SystemRoot",
            "WINDIR",
            "ProgramData",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "ProgramW6432",
        ]
    } else {
        &["SystemRoot", "WINDIR", "ProgramData"]
    };
    for key in env_keys {
        if let Ok(val) = std::env::var(key) {
            let norm = val
                .trim()
                .replace('/', "\\")
                .trim_end_matches('\\')
                .to_ascii_lowercase();
            if !norm.is_empty() && !roots.contains(&norm) {
                roots.push(norm);
            }
        }
    }
    roots
}

pub(crate) fn is_under_protected_windows_root(
    candidate: &std::path::Path,
    include_program_files: bool,
) -> bool {
    let raw = candidate.to_string_lossy();
    let mut lower = raw.replace('/', "\\").to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix(r"\\?\") {
        lower = rest.to_string();
    }
    let trimmed = lower.trim_end_matches('\\');
    if trimmed.starts_with(r"\\.\") || trimmed.starts_with(r"\??\") {
        return true;
    }
    for root in protected_windows_roots(include_program_files) {
        if trimmed == root || trimmed.starts_with(&format!(r"{root}\")) {
            return true;
        }
    }
    false
}

fn is_local_unc_host(host: &str) -> bool {
    let host_lower = host.trim().to_ascii_lowercase();
    if host_lower.is_empty()
        || host_lower == "."
        || host_lower == "localhost"
        || host_lower == "::1"
        || host_lower == "[::1]"
        || host_lower.starts_with("127.")
    {
        return true;
    }
    if let Ok(comp) = std::env::var("COMPUTERNAME") {
        if !comp.trim().is_empty() && host_lower == comp.trim().to_ascii_lowercase() {
            return true;
        }
    }
    false
}

/// 将 `canonicalize` 返回的 `\\?\C:\...` 还原为普通盘符路径；
/// 对指向本机回环的 UNC（如 `\\?\UNC\127.0.0.1\c$\Windows`）或设备命名空间返回 `None`。
pub(crate) fn normalize_canonical_windows_path(
    canon: &std::path::Path,
) -> Option<std::path::PathBuf> {
    let raw = canon.to_string_lossy().replace('/', "\\");
    if raw.starts_with(r"\\.\") || raw.starts_with(r"\??\") {
        return None;
    }
    if let Some(rest) = raw.strip_prefix(r"\\?\") {
        let bytes = rest.as_bytes();
        if bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && bytes[2] == b'\\'
        {
            return Some(std::path::PathBuf::from(rest));
        }
        if let Some(unc_rest) = rest
            .strip_prefix(r"UNC\")
            .or_else(|| rest.strip_prefix(r"unc\"))
        {
            let server = unc_rest.split('\\').next().unwrap_or("");
            if is_local_unc_host(server) {
                return None;
            }
            return Some(std::path::PathBuf::from(format!(r"\\{unc_rest}")));
        }
        return None;
    }
    if let Some(unc_rest) = raw.strip_prefix(r"\\") {
        let server = unc_rest.split('\\').next().unwrap_or("");
        if is_local_unc_host(server) {
            return None;
        }
    }
    Some(std::path::PathBuf::from(raw))
}

pub(crate) fn validate_local_path_with_rules(
    path: &str,
    include_program_files: bool,
    require_leaf_name: bool,
    errors: PathValidationErrors<'_>,
) -> Result<std::path::PathBuf, String> {
    let raw = path.trim();
    if raw.is_empty() {
        return Err(errors.empty.to_string());
    }
    if raw.contains('\0') || raw.chars().any(|c| c.is_control()) {
        return Err(errors.invalid.to_string());
    }

    #[cfg(windows)]
    {
        let mut normalized = raw.replace('/', "\\");
        if normalized.starts_with(r"\\.\") || normalized.starts_with(r"\??\") {
            return Err(errors.not_allowed.to_string());
        }
        if let Some(rest) = normalized.strip_prefix(r"\\?\") {
            let bytes = rest.as_bytes();
            if bytes.len() >= 3
                && bytes[0].is_ascii_alphabetic()
                && bytes[1] == b':'
                && bytes[2] == b'\\'
            {
                normalized = rest.to_string();
            } else {
                return Err(errors.not_allowed.to_string());
            }
        } else if normalized.starts_with(r"\\") {
            return Err(errors.not_allowed.to_string());
        }

        let bytes = normalized.as_bytes();
        if bytes.len() < 3
            || !bytes[0].is_ascii_alphabetic()
            || bytes[1] != b':'
            || bytes[2] != b'\\'
        {
            return Err(errors.not_absolute.to_string());
        }

        let after_root = &normalized[3..];
        for seg in after_root.split('\\').filter(|s| !s.is_empty()) {
            if seg == "." || seg == ".." || seg.contains(':') {
                return Err(errors.invalid.to_string());
            }
        }

        let p = std::path::PathBuf::from(&normalized);
        if !p.is_absolute() {
            return Err(errors.not_absolute.to_string());
        }
        if p.components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err(errors.invalid.to_string());
        }
        if require_leaf_name && p.file_name().is_none() {
            return Err(errors.invalid.to_string());
        }
        if is_under_protected_windows_root(&p, include_program_files) {
            return Err(errors.not_allowed.to_string());
        }

        let mut cursor: &std::path::Path = p.as_path();
        let mut missing_tail: Vec<std::ffi::OsString> = Vec::new();
        while !cursor.exists() {
            if let Some(name) = cursor.file_name() {
                missing_tail.push(name.to_os_string());
            }
            match cursor.parent() {
                Some(parent) if parent != cursor => cursor = parent,
                _ => break,
            }
        }
        if cursor.exists() {
            if let Ok(canon) = std::fs::canonicalize(cursor) {
                let mut resolved = normalize_canonical_windows_path(&canon)
                    .ok_or_else(|| errors.not_allowed.to_string())?;
                for part in missing_tail.into_iter().rev() {
                    resolved.push(part);
                }
                if is_under_protected_windows_root(&resolved, include_program_files) {
                    return Err(errors.not_allowed.to_string());
                }
            }
        }

        Ok(p)
    }

    #[cfg(not(windows))]
    {
        let p = std::path::PathBuf::from(raw);
        if !p.is_absolute() {
            return Err(errors.not_absolute.to_string());
        }
        if p.components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err(errors.invalid.to_string());
        }
        if require_leaf_name && p.file_name().is_none() {
            return Err(errors.invalid.to_string());
        }
        let _ = include_program_files;
        Ok(p)
    }
}

/// 拒绝系统敏感目录与路径穿越；允许用户目录及对话框所选的普通盘符路径。
pub(crate) fn assert_user_data_path(path: &str) -> Result<std::path::PathBuf, String> {
    validate_local_path_with_rules(
        path,
        true,
        true,
        PathValidationErrors {
            empty: "system.errors.invalidPath",
            invalid: "system.errors.invalidPath",
            not_absolute: "system.errors.pathMustBeAbsolute",
            not_allowed: "system.errors.pathNotAllowed",
        },
    )
}

pub(crate) fn assert_user_data_file_with_extension(
    path: &str,
    expected_ext: &str,
) -> Result<std::path::PathBuf, String> {
    let p = assert_user_data_path(path)?;
    let has_ext = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(expected_ext));
    if !has_ext {
        return Err("system.errors.invalidFileExtension".to_string());
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
