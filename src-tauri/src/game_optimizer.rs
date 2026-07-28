use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::ipc_error::{IpcError, IpcResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityStatus {
    pub sticky_keys_enabled: bool,
    pub sticky_keys_hotkey_enabled: bool,
    pub filter_keys_enabled: bool,
    pub filter_keys_hotkey_enabled: bool,
    pub toggle_keys_enabled: bool,
    pub toggle_keys_hotkey_enabled: bool,
    pub mouse_keys_enabled: bool,
    pub mouse_keys_hotkey_enabled: bool,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MouseStatus {
    pub acceleration_enabled: bool,
    pub threshold1: i32,
    pub threshold2: i32,
    pub acceleration: i32,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayStatus {
    pub width: u32,
    pub height: u32,
    pub current_refresh_hz: u32,
    pub max_refresh_hz: u32,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerStatus {
    pub has_battery: bool,
    pub ac_online: Option<bool>,
    pub plan_guid: Option<String>,
    pub plan_name: Option<String>,
    pub power_saver: bool,
    pub usb_selective_suspend_ac: Option<bool>,
    pub usb_selective_suspend_dc: Option<bool>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphicsStatus {
    pub gpus: Vec<String>,
    pub hybrid: bool,
    pub game_preference: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAdapter {
    pub name: String,
    pub description: String,
    pub kind: String,
    pub link_speed: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStatus {
    pub connected: bool,
    pub adapters: Vec<NetworkAdapter>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    pub path: String,
    pub drive: String,
    pub free_bytes: u64,
    pub total_bytes: u64,
    pub drive_type: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningApp {
    pub id: String,
    pub name: String,
    pub process: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameOptimizerActionResult {
    pub id: String,
    pub success: bool,
    pub error: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkBenchmark {
    pub host: String,
    pub sent: u32,
    pub received: u32,
    pub loss_percent: f64,
    pub min_ms: Option<f64>,
    pub max_ms: Option<f64>,
    pub average_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub duration_ms: u64,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameOptimizerReport {
    pub scanned_at_ms: u64,
    pub scan_duration_ms: u64,
    pub accessibility: AccessibilityStatus,
    pub mouse: MouseStatus,
    pub display: Option<DisplayStatus>,
    pub power: PowerStatus,
    pub graphics: GraphicsStatus,
    pub network: NetworkStatus,
    pub storage: Option<StorageStatus>,
    pub overlays: Vec<RunningApp>,
    pub bandwidth_apps: Vec<RunningApp>,
    pub unavailable: Vec<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub async fn scan_game_optimizer(game_path: Option<String>) -> IpcResult<GameOptimizerReport> {
    crate::utils::blocking_cmd(move || scan_inner(game_path))
        .await
        .map_err(|error| IpcError::operation_failed("game_optimizer", error))
}
#[tauri::command]
pub async fn apply_game_optimizer(
    actions: Vec<String>,
) -> IpcResult<Vec<GameOptimizerActionResult>> {
    crate::utils::blocking_cmd(move || apply_inner(actions))
        .await
        .map_err(|error| IpcError::operation_failed("game_optimizer", error))
}
#[tauri::command]
pub async fn benchmark_game_network(
    host: String,
    count: Option<u32>,
) -> IpcResult<NetworkBenchmark> {
    crate::utils::blocking_cmd(move || benchmark_inner(host, count))
        .await
        .map_err(|error| IpcError::operation_failed("game_optimizer", error))
}

#[cfg(windows)]
mod win {
    use super::*;
    use serde_json::Value;
    use std::{
        collections::HashSet, ffi::OsString, mem::zeroed, os::windows::ffi::OsStrExt, path::Path,
        process::Command, time::Instant,
    };
    use sysinfo::{ProcessesToUpdate, System};
    use winapi::shared::minwindef::{DWORD, UINT};
    use winapi::um::{
        wingdi::DEVMODEW,
        winuser::{
            EnumDisplaySettingsW as EDS, SystemParametersInfoW, ENUM_CURRENT_SETTINGS,
            SPI_GETFILTERKEYS, SPI_GETMOUSE, SPI_GETMOUSEKEYS, SPI_GETSTICKYKEYS,
            SPI_GETTOGGLEKEYS, SPI_SETFILTERKEYS, SPI_SETMOUSE, SPI_SETMOUSEKEYS,
            SPI_SETSTICKYKEYS, SPI_SETTOGGLEKEYS,
        },
    };
    use winreg::{
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
        RegKey,
    };

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub(crate) struct StickyKeys {
        cb_size: UINT,
        flags: DWORD,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub(crate) struct FilterKeys {
        cb_size: UINT,
        flags: DWORD,
        wait_ms: DWORD,
        delay_ms: DWORD,
        repeat_ms: DWORD,
        bounce_ms: DWORD,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub(crate) struct ToggleKeys {
        cb_size: UINT,
        flags: DWORD,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub(crate) struct MouseKeys {
        cb_size: UINT,
        flags: DWORD,
        max_speed: DWORD,
        time_to_max_speed: DWORD,
        ctrl_speed: DWORD,
        reserved1: DWORD,
        reserved2: DWORD,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Mouse {
        threshold1: i32,
        threshold2: i32,
        acceleration: i32,
    }
    fn spi<T: Copy>(action: UINT, value: &mut T) -> bool {
        unsafe {
            SystemParametersInfoW(
                action,
                std::mem::size_of::<T>() as UINT,
                value as *mut _ as *mut _,
                0,
            ) != 0
        }
    }
    fn accessibility() -> Result<AccessibilityStatus, String> {
        let mut s: StickyKeys = unsafe { zeroed() };
        let mut f: FilterKeys = unsafe { zeroed() };
        let mut t: ToggleKeys = unsafe { zeroed() };
        let mut m: MouseKeys = unsafe { zeroed() };
        s.cb_size = std::mem::size_of::<StickyKeys>() as u32;
        f.cb_size = std::mem::size_of::<FilterKeys>() as u32;
        t.cb_size = std::mem::size_of::<ToggleKeys>() as u32;
        m.cb_size = std::mem::size_of::<MouseKeys>() as u32;
        if !spi(SPI_GETSTICKYKEYS, &mut s)
            || !spi(SPI_GETFILTERKEYS, &mut f)
            || !spi(SPI_GETTOGGLEKEYS, &mut t)
            || !spi(SPI_GETMOUSEKEYS, &mut m)
        {
            return Err("accessibility".into());
        }
        Ok(AccessibilityStatus {
            sticky_keys_enabled: s.flags & 1 != 0,
            sticky_keys_hotkey_enabled: s.flags & 0x4 != 0,
            filter_keys_enabled: f.flags & 1 != 0,
            filter_keys_hotkey_enabled: f.flags & 0x4 != 0,
            toggle_keys_enabled: t.flags & 1 != 0,
            toggle_keys_hotkey_enabled: t.flags & 0x4 != 0,
            mouse_keys_enabled: m.flags & 1 != 0,
            mouse_keys_hotkey_enabled: m.flags & 0x4 != 0,
        })
    }
    fn mouse() -> Result<MouseStatus, String> {
        let mut m = Mouse {
            threshold1: 0,
            threshold2: 0,
            acceleration: 0,
        };
        if !unsafe { SystemParametersInfoW(SPI_GETMOUSE, 0, &mut m as *mut _ as *mut _, 0) != 0 } {
            return Err("mouse".into());
        }
        Ok(MouseStatus {
            acceleration_enabled: m.acceleration != 0,
            threshold1: m.threshold1,
            threshold2: m.threshold2,
            acceleration: m.acceleration,
        })
    }
    fn display() -> Option<DisplayStatus> {
        let mut c: DEVMODEW = unsafe { zeroed() };
        c.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
        if unsafe { EDS(std::ptr::null(), ENUM_CURRENT_SETTINGS, &mut c) } == 0 {
            return None;
        };
        let mut max = c.dmDisplayFrequency;
        let mut i = 0;
        loop {
            let mut x: DEVMODEW = unsafe { zeroed() };
            x.dmSize = c.dmSize;
            if unsafe { EDS(std::ptr::null(), i, &mut x) } == 0 {
                break;
            };
            if x.dmPelsWidth == c.dmPelsWidth && x.dmPelsHeight == c.dmPelsHeight {
                max = max.max(x.dmDisplayFrequency)
            }
            i += 1;
        }
        Some(DisplayStatus {
            width: c.dmPelsWidth,
            height: c.dmPelsHeight,
            current_refresh_hz: c.dmDisplayFrequency,
            max_refresh_hz: max,
        })
    }
    fn cmd(args: &[&str]) -> String {
        Command::new(args[0])
            .args(&args[1..])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default()
    }
    fn power() -> (PowerStatus, Vec<String>) {
        let mut s: winapi::um::winbase::SYSTEM_POWER_STATUS = unsafe { zeroed() };
        let ok = unsafe { winapi::um::winbase::GetSystemPowerStatus(&mut s) } != 0;
        let active = cmd(&["powercfg", "/getactivescheme"]);
        let (guid, name) = parse_plan(&active);
        let q = cmd(&[
            "powercfg",
            "/query",
            "SCHEME_CURRENT",
            "2a737441-1930-4402-8d77-b2bebba308a3",
            "48e6b7a6-50f8-4782-a5d4-53bb8f07e226",
        ]);
        let (ac, dc) = parse_usb(&q);
        let mut unavailable = Vec::new();
        if !ok {
            unavailable.push("power.status".into());
        }
        if guid.is_none() {
            unavailable.push("power.plan".into());
        }
        if ac.is_none() || dc.is_none() {
            unavailable.push("power.usbSelectiveSuspend".into());
        }
        (
            PowerStatus {
                has_battery: ok && s.BatteryFlag != 128 && s.BatteryFlag != 255,
                ac_online: if ok {
                    match s.ACLineStatus {
                        0 => Some(false),
                        1 => Some(true),
                        _ => None,
                    }
                } else {
                    None
                },
                plan_guid: guid.clone(),
                plan_name: name,
                // winapi 0.3 keeps the pre-Windows-10 field name; this byte is SystemStatusFlag.
                power_saver: (ok && s.Reserved1 == 1)
                    || guid
                        .as_deref()
                        .map(|x| x.eq_ignore_ascii_case("a1841308-3541-4fab-bc81-f71556f20b4a"))
                        .unwrap_or(false),
                usb_selective_suspend_ac: ac,
                usb_selective_suspend_dc: dc,
            },
            unavailable,
        )
    }
    fn parse_plan(s: &str) -> (Option<String>, Option<String>) {
        let l = s
            .lines()
            .find(|x| x.contains("GUID") || x.contains("guid"))
            .unwrap_or("");
        let g = l
            .split_whitespace()
            .find(|x| x.len() == 36 && x.matches('-').count() == 4)
            .map(str::to_owned);
        let n = l
            .rsplit_once('(')
            .and_then(|(_, x)| x.strip_suffix(')'))
            .map(|x| x.trim().to_owned());
        (g, n)
    }
    pub(crate) fn parse_usb(s: &str) -> (Option<bool>, Option<bool>) {
        let mut vals = Vec::new();
        for token in s.split_whitespace().filter(|x| x.starts_with("0x")) {
            if let Ok(v) = u32::from_str_radix(token.trim_start_matches("0x"), 16) {
                vals.push(v == 1);
            }
        }
        if vals.len() > 2 {
            vals = vals[vals.len() - 2..].to_vec();
        }
        (vals.first().copied(), vals.get(1).copied())
    }
    fn graphics(path: Option<&str>) -> GraphicsStatus {
        let key = RegKey::predef(HKEY_LOCAL_MACHINE);
        let mut g = Vec::new();
        if let Ok(k) = key.open_subkey(
            r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}",
        ) {
            let mut names: Vec<String> = k
                .enum_keys()
                .filter_map(Result::ok)
                .filter(|n| n.chars().all(|c| c.is_ascii_digit()))
                .collect();
            names.sort();
            for n in names {
                if let Ok(x) = k.open_subkey(n) {
                    if let Ok(v) = x.get_value::<String, _>("DriverDesc") {
                        if !v.is_empty() && !g.contains(&v) {
                            g.push(v)
                        }
                    }
                }
            }
        }
        let pref = path
            .and_then(|p| {
                RegKey::predef(HKEY_CURRENT_USER)
                    .open_subkey(r"Software\Microsoft\DirectX\UserGpuPreferences")
                    .ok()
                    .and_then(|k| k.get_value::<String, _>(p).ok())
            })
            .unwrap_or_default();
        let gp = if pref.contains("GpuPreference=2") {
            "high_performance"
        } else if pref.contains("GpuPreference=1") {
            "power_saving"
        } else if pref.is_empty() {
            "system_default"
        } else {
            "unknown"
        };
        GraphicsStatus {
            hybrid: g.len() > 1,
            gpus: g,
            game_preference: gp.to_string(),
        }
    }
    fn network() -> (NetworkStatus, Vec<String>) {
        let ps = "$ErrorActionPreference='Stop'; $OutputEncoding=[Text.UTF8Encoding]::new(); $items=@(Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object { [PSCustomObject]@{ Name=[string]$_.Name; Description=[string]$_.InterfaceDescription; Medium=[string]$_.NdisPhysicalMedium; LinkSpeed=[string]$_.LinkSpeed } }); ConvertTo-Json -InputObject $items -Compress";
        let out = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps])
            .output();
        let mut un = Vec::new();
        let mut a = Vec::new();
        if let Ok(o) = out {
            if !o.status.success() || o.stdout.is_empty() {
                un.push("network.adapters".into());
            } else if let Ok(v) = serde_json::from_slice::<Value>(&o.stdout) {
                for x in v.as_array().cloned().unwrap_or_else(|| vec![v]) {
                    let name = x["Name"].as_str().unwrap_or("").to_string();
                    let d = x["Description"].as_str().unwrap_or("").to_string();
                    let medium = x["Medium"].as_str().unwrap_or("").to_ascii_lowercase();
                    let k = format!("{} {} {}", name, d, medium).to_ascii_lowercase();
                    let kind =
                        if k.contains("wi-fi") || k.contains("wireless") || k.contains("802.11") {
                            "wifi"
                        } else if k.contains("ethernet") || medium.contains("802.3") {
                            "ethernet"
                        } else {
                            "other"
                        };
                    a.push(NetworkAdapter {
                        name,
                        description: d,
                        kind: kind.to_string(),
                        link_speed: x["LinkSpeed"].as_str().unwrap_or("").to_string(),
                    })
                }
            } else {
                un.push("network.adapters".into())
            }
        } else {
            un.push("network.adapters".into())
        }
        (
            NetworkStatus {
                connected: !a.is_empty(),
                adapters: a,
            },
            un,
        )
    }
    fn storage(path: &str) -> (Option<StorageStatus>, Vec<String>) {
        let p = Path::new(path);
        if !p.is_file() {
            return (None, vec!["storage.gamePath".into()]);
        }
        let Some(drive) = p
            .components()
            .next()
            .map(|x| x.as_os_str().to_string_lossy().to_string())
        else {
            return (None, vec!["storage.gamePath".into()]);
        };
        let root = format!("{}\\", drive);
        let mut free: winapi::um::winnt::ULARGE_INTEGER = unsafe { zeroed() };
        let mut total: winapi::um::winnt::ULARGE_INTEGER = unsafe { zeroed() };
        let disk_ok = unsafe {
            winapi::um::fileapi::GetDiskFreeSpaceExW(
                wide(&root).as_ptr(),
                &mut free,
                &mut total,
                std::ptr::null_mut(),
            ) != 0
        };
        let mut unavailable = Vec::new();
        if !disk_ok {
            unavailable.push("storage.space".into());
        }
        let valid_drive = drive.len() == 2
            && drive.as_bytes()[0].is_ascii_alphabetic()
            && drive.as_bytes()[1] == b':';
        if !valid_drive {
            return (None, vec!["storage.gamePath".into()]);
        }
        let ps = "$ErrorActionPreference='Stop'; $d=Get-Partition -DriveLetter $env:MXTOOLS_GAME_DRIVE | Get-Disk; [PSCustomObject]@{MediaType=[string]$d.MediaType;BusType=[string]$d.BusType} | ConvertTo-Json -Compress";
        let output = Command::new("powershell")
            .env("MXTOOLS_GAME_DRIVE", drive.trim_end_matches(':'))
            .args(["-NoProfile", "-NonInteractive", "-Command", ps])
            .output();
        let value = output
            .as_ref()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| serde_json::from_slice::<Value>(&o.stdout).ok());
        if value.is_none() {
            unavailable.push("storage.driveType".into());
        }
        let (media, bus) = value
            .as_ref()
            .map(|v| {
                (
                    v["MediaType"].as_str().unwrap_or("").to_ascii_lowercase(),
                    v["BusType"].as_str().unwrap_or("").to_ascii_lowercase(),
                )
            })
            .unwrap_or_default();
        let typ = if ["usb", "sd", "mmc", "1394", "ieee 1394", "firewire"].contains(&bus.as_str()) {
            "external"
        } else if media == "ssd" || bus == "nvme" {
            "ssd"
        } else if media == "hdd" {
            "hdd"
        } else {
            "unknown"
        };
        (
            Some(StorageStatus {
                path: path.into(),
                drive,
                free_bytes: unsafe { *free.QuadPart() },
                total_bytes: unsafe { *total.QuadPart() },
                drive_type: typ.into(),
            }),
            unavailable,
        )
    }
    fn wide(s: &str) -> Vec<u16> {
        OsString::from(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }
    fn apps() -> (Vec<RunningApp>, Vec<RunningApp>) {
        let mut sys = System::new_all();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let mut seen = HashSet::new();
        let mut overlays = Vec::new();
        let mut down = Vec::new();
        for p in sys.processes().values() {
            let n = p.name().to_string_lossy().to_string();
            let l = n.trim_end_matches(".exe").to_ascii_lowercase();
            let kind = if [
                "discord",
                "gamebar",
                "gamebarftserver",
                "nvidia share",
                "gameoverlayui",
                "nvsphelper",
                "nvidia overlay",
                "rtss",
                "msiafterburner",
                "radeon overlay",
                "radeonsoftware",
            ]
            .iter()
            .any(|x| l == *x)
            {
                Some(true)
            } else if [
                "steam",
                "epicgameslauncher",
                "eadesktop",
                "battle.net",
                "onedrive",
                "qbittorrent",
                "utorrent",
                "thunder",
            ]
            .iter()
            .any(|x| l == *x)
            {
                Some(false)
            } else {
                None
            };
            if let Some(o) = kind {
                if seen.insert((o, n.clone())) {
                    let x = RunningApp {
                        id: l.clone(),
                        name: n.clone(),
                        process: n.clone(),
                    };
                    if o {
                        overlays.push(x)
                    } else {
                        down.push(x)
                    }
                }
            }
        }
        (overlays, down)
    }
    pub fn scan(path: Option<String>) -> Result<GameOptimizerReport, String> {
        let started = Instant::now();
        let (net, mut un) = network();
        let (o, b) = apps();
        let accessibility_result = accessibility();
        if accessibility_result.is_err() {
            un.push("input.accessibility".into());
        }
        let mouse_result = mouse();
        if mouse_result.is_err() {
            un.push("input.mouse".into());
        }
        let display_result = display();
        if display_result.is_none() {
            un.push("display.primary".into());
        }
        let (power_result, power_un) = power();
        un.extend(power_un);
        let (storage_value, storage_un) =
            path.as_deref().map(storage).unwrap_or((None, Vec::new()));
        un.extend(storage_un);
        Ok(GameOptimizerReport {
            scanned_at_ms: now_ms(),
            scan_duration_ms: started.elapsed().as_millis() as u64,
            accessibility: accessibility_result.unwrap_or(AccessibilityStatus {
                sticky_keys_enabled: false,
                sticky_keys_hotkey_enabled: false,
                filter_keys_enabled: false,
                filter_keys_hotkey_enabled: false,
                toggle_keys_enabled: false,
                toggle_keys_hotkey_enabled: false,
                mouse_keys_enabled: false,
                mouse_keys_hotkey_enabled: false,
            }),
            mouse: mouse_result.unwrap_or(MouseStatus {
                acceleration_enabled: false,
                threshold1: 0,
                threshold2: 0,
                acceleration: 0,
            }),
            display: display_result,
            power: power_result,
            graphics: graphics(path.as_deref()),
            network: net,
            storage: storage_value,
            overlays: o,
            bandwidth_apps: b,
            unavailable: {
                un.sort();
                un.dedup();
                un
            },
        })
    }
    pub fn apply(actions: Vec<String>) -> Result<Vec<GameOptimizerActionResult>, String> {
        let mut out = Vec::new();
        for id in actions {
            let r = match id.as_str() {
                "accessibility_shortcuts" => {
                    let ok = unsafe { set_access() };
                    let verified = accessibility()
                        .map(|x| {
                            !x.sticky_keys_enabled
                                && !x.sticky_keys_hotkey_enabled
                                && !x.filter_keys_enabled
                                && !x.filter_keys_hotkey_enabled
                                && !x.toggle_keys_enabled
                                && !x.toggle_keys_hotkey_enabled
                                && !x.mouse_keys_enabled
                                && !x.mouse_keys_hotkey_enabled
                        })
                        .unwrap_or(false);
                    GameOptimizerActionResult {
                        id,
                        success: ok && verified,
                        error: (!(ok && verified)).then_some("system.errors.applyFailed".into()),
                    }
                }
                "mouse_acceleration" => {
                    let mut m = Mouse {
                        threshold1: 0,
                        threshold2: 0,
                        acceleration: 0,
                    };
                    let ok = unsafe {
                        SystemParametersInfoW(SPI_SETMOUSE, 0, &mut m as *mut _ as *mut _, 3) != 0
                    };
                    let verified = mouse().map(|x| x.acceleration == 0).unwrap_or(false);
                    GameOptimizerActionResult {
                        id,
                        success: ok && verified,
                        error: (!(ok && verified)).then_some("system.errors.applyFailed".into()),
                    }
                }
                "usb_selective_suspend" => {
                    let a = Command::new("powercfg")
                        .args([
                            "/setacvalueindex",
                            "SCHEME_CURRENT",
                            "2a737441-1930-4402-8d77-b2bebba308a3",
                            "48e6b7a6-50f8-4782-a5d4-53bb8f07e226",
                            "0",
                        ])
                        .status()
                        .map(|x| x.success())
                        .unwrap_or(false);
                    let d = Command::new("powercfg")
                        .args([
                            "/setdcvalueindex",
                            "SCHEME_CURRENT",
                            "2a737441-1930-4402-8d77-b2bebba308a3",
                            "48e6b7a6-50f8-4782-a5d4-53bb8f07e226",
                            "0",
                        ])
                        .status()
                        .map(|x| x.success())
                        .unwrap_or(false);
                    let s = Command::new("powercfg")
                        .args(["/setactive", "SCHEME_CURRENT"])
                        .status()
                        .map(|x| x.success())
                        .unwrap_or(false);
                    let verify = if a && d && s {
                        parse_usb(&cmd(&[
                            "powercfg",
                            "/query",
                            "SCHEME_CURRENT",
                            "2a737441-1930-4402-8d77-b2bebba308a3",
                            "48e6b7a6-50f8-4782-a5d4-53bb8f07e226",
                        ])) == (Some(false), Some(false))
                    } else {
                        false
                    };
                    GameOptimizerActionResult {
                        id,
                        success: verify,
                        error: (!verify).then_some(
                            "system.errors.usbSelectiveSuspendUnavailableOrFailed".into(),
                        ),
                    }
                }
                _ => GameOptimizerActionResult {
                    id,
                    success: false,
                    error: Some("system.errors.unknownAction".into()),
                },
            };
            out.push(r)
        }
        Ok(out)
    }
    unsafe fn set_access() -> bool {
        fn x<T>(a: UINT, v: &mut T) -> bool {
            unsafe {
                SystemParametersInfoW(a, std::mem::size_of::<T>() as u32, v as *mut _ as *mut _, 3)
                    != 0
            }
        }
        let mut a = StickyKeys {
            cb_size: std::mem::size_of::<StickyKeys>() as u32,
            flags: 0,
        };
        let mut f = FilterKeys {
            cb_size: std::mem::size_of::<FilterKeys>() as u32,
            flags: 0,
            wait_ms: 0,
            delay_ms: 0,
            repeat_ms: 0,
            bounce_ms: 0,
        };
        let mut t = ToggleKeys {
            cb_size: std::mem::size_of::<ToggleKeys>() as u32,
            flags: 0,
        };
        let mut m = MouseKeys {
            cb_size: std::mem::size_of::<MouseKeys>() as u32,
            flags: 0,
            max_speed: 0,
            time_to_max_speed: 0,
            ctrl_speed: 0,
            reserved1: 0,
            reserved2: 0,
        };
        let ok = spi(SPI_GETSTICKYKEYS, &mut a)
            && spi(SPI_GETFILTERKEYS, &mut f)
            && spi(SPI_GETTOGGLEKEYS, &mut t)
            && spi(SPI_GETMOUSEKEYS, &mut m);
        if !ok {
            return false;
        }
        a.flags &= !(1 | 4 | 8);
        f.flags &= !(1 | 4 | 8);
        t.flags &= !(1 | 4 | 8);
        m.flags &= !(1 | 4 | 8);
        x(SPI_SETSTICKYKEYS, &mut a)
            && x(SPI_SETFILTERKEYS, &mut f)
            && x(SPI_SETTOGGLEKEYS, &mut t)
            && x(SPI_SETMOUSEKEYS, &mut m)
            && accessibility()
                .map(|x| {
                    !x.sticky_keys_enabled
                        && !x.sticky_keys_hotkey_enabled
                        && !x.filter_keys_enabled
                        && !x.filter_keys_hotkey_enabled
                        && !x.toggle_keys_enabled
                        && !x.toggle_keys_hotkey_enabled
                        && !x.mouse_keys_enabled
                        && !x.mouse_keys_hotkey_enabled
                })
                .unwrap_or(false)
    }
    pub fn benchmark(host: String, count: u32) -> Result<NetworkBenchmark, String> {
        let start = Instant::now();
        let out = Command::new("ping")
            .args(["-n", &count.to_string(), &host])
            .output()
            .map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&out.stdout);
        let vals = parse_ping_times(&text);
        let received = vals.len() as u32;
        let avg = (!vals.is_empty()).then(|| vals.iter().sum::<f64>() / vals.len() as f64);
        let min = vals.iter().copied().reduce(f64::min);
        let max = vals.iter().copied().reduce(f64::max);
        let jitter = calculate_jitter(&vals);
        Ok(NetworkBenchmark {
            host,
            sent: count,
            received,
            loss_percent: ((count - received) as f64 * 100.0 / count as f64),
            min_ms: min,
            max_ms: max,
            average_ms: avg,
            jitter_ms: jitter,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }
    pub(crate) fn calculate_jitter(values: &[f64]) -> Option<f64> {
        if values.len() < 2 {
            None
        } else {
            Some(
                values.windows(2).map(|x| (x[1] - x[0]).abs()).sum::<f64>()
                    / (values.len() - 1) as f64,
            )
        }
    }
    pub fn parse_ping_times(s: &str) -> Vec<f64> {
        let mut v = Vec::new();
        for l in s.lines() {
            let x = l.to_ascii_lowercase();
            if x.contains("time<1") {
                v.push(0.5);
            } else if let Some(i) = x.find("time=") {
                if let Some(n) = x[i + 5..]
                    .split(|c: char| !c.is_ascii_digit() && c != '.')
                    .next()
                    .and_then(|n| n.parse().ok())
                {
                    v.push(n)
                }
            } else if x.contains("时间<1") {
                v.push(0.5);
            } else if let Some(i) = x.find("时间=") {
                if let Some(n) = x[i + 7..]
                    .split(|c: char| !c.is_ascii_digit() && c != '.')
                    .next()
                    .and_then(|n| n.parse().ok())
                {
                    v.push(n)
                }
            }
        }
        v
    }
}

#[cfg(windows)]
fn scan_inner(path: Option<String>) -> Result<GameOptimizerReport, String> {
    win::scan(path)
}
#[cfg(not(windows))]
fn scan_inner(_: Option<String>) -> Result<GameOptimizerReport, String> {
    Err("system.errors.windowsOnly".into())
}
#[cfg(windows)]
fn apply_inner(a: Vec<String>) -> Result<Vec<GameOptimizerActionResult>, String> {
    win::apply(a)
}
#[cfg(not(windows))]
fn apply_inner(_: Vec<String>) -> Result<Vec<GameOptimizerActionResult>, String> {
    Err("system.errors.windowsOnly".into())
}
#[cfg(windows)]
fn benchmark_inner(h: String, c: Option<u32>) -> Result<NetworkBenchmark, String> {
    if h.is_empty()
        || h.len() > 253
        || !h
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b':' || b == b'-' || b == b'_')
    {
        return Err("system.errors.invalidHost".into());
    }
    win::benchmark(h, c.unwrap_or(8).clamp(4, 20))
}
#[cfg(not(windows))]
fn benchmark_inner(_: String, _: Option<u32>) -> Result<NetworkBenchmark, String> {
    Err("system.errors.windowsOnly".into())
}

#[cfg(all(test, windows))]
mod tests {
    use super::win::*;
    use std::mem::size_of;
    #[test]
    fn official_sizes_and_flags() {
        assert_eq!(size_of::<StickyKeys>(), 8);
        assert_eq!(size_of::<FilterKeys>(), 24);
        assert_eq!(size_of::<ToggleKeys>(), 8);
        assert_eq!(size_of::<MouseKeys>(), 28);
        assert_eq!(1 | 4 | 8, 13);
    }
    #[test]
    fn parses_powercfg() {
        assert_eq!(
            parse_usb("当前交流电源设置索引: 0x00000001\n当前直流电源设置索引: 0x00000000"),
            (Some(true), Some(false))
        );
        assert_eq!(parse_usb("Current AC Power Setting Index: 0x00000001\nCurrent DC Power Setting Index: 0x00000000"),(Some(true),Some(false)));
    }
    #[test]
    fn parses_ping() {
        assert_eq!(
            parse_ping_times("Reply from 1.1.1.1: time=12ms\n来自 1.1.1.1 的回复: 时间=24ms"),
            vec![12.0, 24.0]
        );
    }
    #[test]
    fn parses_sub_ms_and_jitter() {
        assert_eq!(
            parse_ping_times("Reply: time<1ms\n回复: 时间<1ms"),
            vec![0.5, 0.5]
        );
        let v: Vec<f64> = vec![10.0, 14.0, 13.0];
        let j = calculate_jitter(&v);
        assert_eq!(j, Some(2.5));
        assert_eq!(calculate_jitter(&[]), None);
    }

    #[test]
    fn scans_current_machine_without_changing_settings() {
        let report = scan(None).expect("game optimizer scan should be non-fatal");
        assert!(report.scanned_at_ms > 0);
        assert!(report.storage.is_none());
    }
}
