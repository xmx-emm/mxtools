//! Read-only installation and hardware inputs for default generation.
use super::video::{DisplayMode, Hardware};
use crate::game::{apex_history::ApexLauncherRef, version};
use std::fs;
use std::path::{Path, PathBuf};

const VERIFIED_BUILD: &str = "R5pc_r5-300_J57_CL11457258_2026_08_19_15_40";

fn bounded_text(path: &Path) -> Result<String, String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > 2 * 1024 * 1024 {
        return Err(format!("file too large: {}", path.display()));
    }
    fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))
}

pub(super) fn installation(launcher: &ApexLauncherRef) -> Result<(PathBuf, String), String> {
    let (root, _) =
        version::installed_root(version::Game::Apex, &launcher.kind, Some(&launcher.id))?
            .filter(|(root, _)| root.is_dir())
            .ok_or("apex.history.errors.defaultInstallUnavailable")?;
    let build = bounded_text(&root.join("build.txt"))
        .map_err(|_| "apex.history.errors.defaultBuildUnsupported")?;
    if build.trim().trim_start_matches('\u{feff}') != VERIFIED_BUILD {
        return Err("apex.history.errors.defaultBuildUnsupported".into());
    }
    let language = if launcher.kind == "steam" {
        let id = launcher
            .id
            .parse()
            .map_err(|_| "apex.history.errors.invalidAccount")?;
        match windows_tool::game::steam::get_steam_game_language(id, 1172470) {
            Ok(language) => language,
            Err(_) => {
                let steamapps = root
                    .parent()
                    .and_then(Path::parent)
                    .ok_or("apex.history.errors.defaultLanguageUnavailable")?;
                let manifest = bounded_text(&steamapps.join("appmanifest_1172470.acf"))
                    .map_err(|_| "apex.history.errors.defaultLanguageUnavailable")?;
                steam_manifest_language(&manifest)?
            }
        }
    } else {
        ea_language(&root)?
    };
    Ok((root, language))
}

fn steam_manifest_language(text: &str) -> Result<String, String> {
    let tree = windows_tool::vdf::parse_vdf_string(text)
        .map_err(|_| "apex.history.errors.defaultLanguageUnavailable")?;
    let value = tree
        .get_value_by_path(&["AppState", "UserConfig", "language"])
        .or_else(|| tree.get_value_by_path(&["AppState", "MountedConfig", "language"]));
    value
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "apex.history.errors.defaultLanguageUnavailable".into())
}

#[cfg(windows)]
fn ea_language(root: &Path) -> Result<String, String> {
    use winreg::{
        enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY},
        RegKey,
    };
    let installed = fs::canonicalize(root).map_err(|e| e.to_string())?;
    for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
        let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey_with_flags(r"SOFTWARE\Respawn\Apex", KEY_READ | view)
        else {
            continue;
        };
        let Ok(path) = key.get_value::<String, _>("Install Dir") else {
            continue;
        };
        if fs::canonicalize(path).is_ok_and(|path| path == installed) {
            if let Ok(locale) = key.get_value::<String, _>("Locale") {
                if !locale.is_empty() {
                    return Ok(locale);
                }
            }
        }
    }
    Err("apex.history.errors.defaultLanguageUnavailable".into())
}

#[cfg(not(windows))]
fn ea_language(_: &Path) -> Result<String, String> {
    Err("apex.history.errors.defaultLanguageUnavailable".into())
}

pub(super) fn initialization_resources(root: &Path) -> Result<String, String> {
    // Optional PC tier overrides are not supported by this generator.
    // CPU/gpu-memory tiers only select those optional files; they otherwise do
    // not change serialized fields. Refuse a changed resource set before writes.
    match fs::read_dir(root.join("cfg")) {
        Ok(entries) => {
            for entry in entries {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if ["cpu_level_", "gpu_level_", "mem_level_", "gpu_mem_level_"]
                    .iter()
                    .any(|prefix| name.starts_with(prefix))
                    && name.ends_with("_pc.ekv")
                {
                    return Err("apex.history.errors.defaultResourcesChanged".into());
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    bounded_text(&root.join("bin/dxsupport.cfg"))
        .map_err(|e| format!("apex.history.errors.defaultResourcesChanged: {e}"))
}

#[cfg(windows)]
pub(super) fn hardware() -> Result<Hardware, String> {
    use winapi::um::{
        sysinfoapi::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
        wingdi::{GetDeviceCaps, HORZRES, VERTRES},
        winuser::{GetDC, ReleaseDC},
    };
    use windows::Win32::Graphics::{
        Direct3D::D3D_FEATURE_LEVEL_11_0,
        Direct3D12::{
            D3D12CreateDevice, ID3D12Device, D3D12_FEATURE_ARCHITECTURE,
            D3D12_FEATURE_DATA_ARCHITECTURE,
        },
        Dxgi::{
            Common::{DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_MODE_DESC},
            CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE, DXGI_ENUM_MODES,
            DXGI_ERROR_MORE_DATA,
        },
    };
    let hardware_error = |e| format!("apex.history.errors.defaultHardwareUnavailable: {e}");
    let display_error = |e| format!("apex.history.errors.defaultDisplayUnavailable: {e}");
    // Use EnumAdapters1(0)/EnumOutputs(0), rather than an arbitrary
    // registry GPU name. No game process, PowerShell, or configuration writes.
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1().map_err(hardware_error)?;
        let adapter = factory.EnumAdapters1(0).map_err(hardware_error)?;
        let desc = adapter.GetDesc1().map_err(hardware_error)?;
        if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
            return Err("apex.history.errors.defaultHardwareUnavailable".into());
        }
        let mut vram = desc.DedicatedVideoMemory as u64;
        let mut intel_non_uma = false;
        if desc.VendorId == 0x8086 {
            let mut device: Option<ID3D12Device> = None;
            D3D12CreateDevice(&adapter, D3D_FEATURE_LEVEL_11_0, &mut device)
                .map_err(hardware_error)?;
            let device = device.ok_or("apex.history.errors.defaultHardwareUnavailable")?;
            let mut architecture = D3D12_FEATURE_DATA_ARCHITECTURE::default();
            device
                .CheckFeatureSupport(
                    D3D12_FEATURE_ARCHITECTURE,
                    (&mut architecture as *mut D3D12_FEATURE_DATA_ARCHITECTURE).cast(),
                    std::mem::size_of_val(&architecture) as u32,
                )
                .map_err(hardware_error)?;
            if architecture.UMA.as_bool() {
                vram += desc.SharedSystemMemory as u64;
            } else {
                intel_non_uma = true;
            }
        }
        let output = adapter.EnumOutputs(0).map_err(display_error)?;
        let mut modes = None;
        for _ in 0..3 {
            let mut count = 0;
            output
                .GetDisplayModeList(
                    DXGI_FORMAT_R8G8B8A8_UNORM,
                    DXGI_ENUM_MODES(0),
                    &mut count,
                    None,
                )
                .map_err(display_error)?;
            if count == 0 || count > 65536 {
                return Err("apex.history.errors.defaultDisplayUnavailable".into());
            }
            let mut buffer = vec![DXGI_MODE_DESC::default(); count as usize];
            match output.GetDisplayModeList(
                DXGI_FORMAT_R8G8B8A8_UNORM,
                DXGI_ENUM_MODES(0),
                &mut count,
                Some(buffer.as_mut_ptr()),
            ) {
                Ok(()) => {
                    buffer.truncate(count as usize);
                    modes = Some(
                        buffer
                            .into_iter()
                            .map(|m| DisplayMode {
                                width: m.Width,
                                height: m.Height,
                                numerator: m.RefreshRate.Numerator,
                                denominator: m.RefreshRate.Denominator,
                            })
                            .collect(),
                    );
                    break;
                }
                Err(error) if error.code() == DXGI_ERROR_MORE_DATA => continue,
                Err(error) => return Err(display_error(error)),
            }
        }
        let modes = modes.ok_or("apex.history.errors.defaultDisplayUnavailable")?;
        // The game's startup fallback uses primary desktop GetDeviceCaps.
        let dc = GetDC(std::ptr::null_mut());
        if dc.is_null() {
            return Err("apex.history.errors.defaultDisplayUnavailable".into());
        }
        let width = GetDeviceCaps(dc, HORZRES);
        let height = GetDeviceCaps(dc, VERTRES);
        ReleaseDC(std::ptr::null_mut(), dc);
        if width <= 0 || height <= 0 {
            return Err("apex.history.errors.defaultDisplayUnavailable".into());
        }
        let mut memory: MEMORYSTATUSEX = std::mem::zeroed();
        memory.dwLength = std::mem::size_of_val(&memory) as u32;
        if GlobalMemoryStatusEx(&mut memory) == 0 {
            return Err("apex.history.errors.defaultHardwareUnavailable".into());
        }
        Ok(Hardware {
            system_memory_mb: memory.ullTotalPhys >> 20,
            video_memory_mb: vram >> 20,
            vendor_id: desc.VendorId,
            device_id: desc.DeviceId,
            intel_non_uma,
            desktop_width: width as u32,
            desktop_height: height as u32,
            modes,
        })
    }
}

#[cfg(not(windows))]
pub(super) fn hardware() -> Result<Hardware, String> {
    Err("apex.history.errors.defaultHardwareUnavailable".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/game/apex_default_environment.rs"
    ));
}
