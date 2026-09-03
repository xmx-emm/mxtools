// 计算机\HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Valve\SteamUser
// C:\Program Files (x86)\SteamUser\userdata\xxxxxxx\config\localconfig.vdf
/*
"1172470"
{
"LastPlayed"		"1757725032"
"Playtime2wks"		"114"
"Playtime"		"121802"
"cloud"
{
"last_sync_state"		"synchronized"
}
"1172470_eula_1"		"1"
"BadgeData"		"02000000080c"
"PlaytimeDisconnected"		"70"
"LaunchOptions"		"qqqqqqqq"
}
*/

use crate::game::apex_history::{
    discard_scope_locked_for_app, lock_history, prune_history_locked, record_launch_before_locked,
    record_video_before_locked, ApexConfigScope, ApexHistorySource, ApexLauncherRef,
};
use crate::game::steam::steam_is_running_sync;
use crate::ipc_error::{IpcError, IpcResult};
use crate::log_info;
use crate::utils::{blocking_cmd, blocking_value, thoroughly_kill_named, ProcessNameMatchMode};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri_plugin_opener::open_path;
use windows_tool::game::apex::config::ApexCfgDocument;
use windows_tool::game::apex::{
    apex_is_running_by_tasklist, apex_languages_depots,
    check_apex_miles_language_by_platform as caml, get_apex_audio_folder_path_by_platform,
    get_apex_download_folder_path_by_platform, get_apex_launch_options_by_steam_user_id,
    get_apex_videoconfig_path, is_videoconfig_readonly, load_apex_config, patch_apex_videoconfig,
    read_apex_videoconfig, save_apex_config, set_apex_launch_options_by_steam_user_id,
    set_videoconfig_readonly, ApexConfigFileKind,
};
use windows_tool::utils::filesystem::copy_dir_all;

pub(crate) fn read_steam_launch_options(id: usize) -> Result<String, String> {
    get_apex_launch_options_by_steam_user_id(id)
}

pub(crate) fn validate_launch_options(value: &str) -> Result<(), String> {
    if value.chars().any(char::is_control) {
        return Err("apex.errors.invalidLaunchOptions".to_string());
    }
    Ok(())
}

pub(crate) fn write_steam_launch_options(id: usize, value: &str) -> Result<(), String> {
    validate_launch_options(value)?;
    set_apex_launch_options_by_steam_user_id(id, value)
}

pub(crate) fn apex_video_config_path() -> Result<PathBuf, String> {
    get_apex_videoconfig_path()
}

pub(crate) fn read_video_config_sync() -> Result<HashMap<String, String>, String> {
    let path = get_apex_videoconfig_path()?;
    if !path.is_file() {
        return Ok(HashMap::new());
    }
    let (_, values) = read_apex_videoconfig()?;
    Ok(values
        .into_iter()
        .map(|(key, value)| (key.trim_matches('"').to_string(), value))
        .collect())
}

pub(crate) fn patch_video_config_sync(updates: &HashMap<String, String>) -> Result<(), String> {
    validate_video_updates(updates)?;
    patch_apex_videoconfig(updates).map(|_| ())
}

#[derive(Debug, Clone, Copy)]
enum VideoValueRule {
    Enum(&'static [&'static str]),
    Integer(i64, i64),
    Number(f64, f64),
}

const VIDEO_BOOL: &[&str] = &["0", "1"];
const VIDEO_ANTIALIAS: &[&str] = &["0", "12"];

fn video_value_rule(key: &str) -> Option<VideoValueRule> {
    use VideoValueRule::*;
    match key {
        "setting.fullscreen"
        | "setting.nowindowborder"
        | "setting.dvs_enable"
        | "setting.dvs_supersample_enable"
        | "setting.dynamic_streaming_budget"
        | "setting.mat_mip_linear"
        | "setting.r_createmodeldecals"
        | "setting.csm_enabled"
        | "setting.shadow_enable"
        | "setting.volumetric_lighting"
        | "setting.volumetric_fog"
        | "setting.new_shadow_settings"
        | "setting.mat_depthfeather_enable"
        | "setting.cl_gib_allow"
        | "setting.cl_ragdoll_self_collision" => Some(Enum(VIDEO_BOOL)),
        "setting.mat_antialias_mode" => Some(Enum(VIDEO_ANTIALIAS)),
        "setting.defaultres" | "setting.last_display_width" => Some(Integer(512, 7680)),
        "setting.defaultresheight" | "setting.last_display_height" => Some(Integer(128, 4320)),
        "setting.mat_vsync_mode" => Some(Integer(0, 4)),
        "setting.mat_backbuffer_count" => Some(Integer(1, 2)),
        "setting.dvs_gpuframetime_min" | "setting.dvs_gpuframetime_max" => {
            Some(Integer(0, 500_000))
        }
        "setting.stream_memory" => Some(Integer(0, 9_999_999)),
        "setting.mat_picmip"
        | "setting.csm_coverage"
        | "setting.shadow_depth_upres_factor_max"
        | "setting.ssao_quality"
        | "setting.particle_cpu_level" => Some(Integer(0, 4)),
        "setting.map_detail_level" => Some(Integer(1, 2)),
        "setting.mat_forceaniso" => Some(Integer(0, 16)),
        "setting.r_decals" => Some(Integer(0, 512)),
        "setting.csm_cascade_res" | "setting.shadow_depth_dimen_min" => Some(Integer(0, 4096)),
        "setting.shadow_maxdynamic" | "setting.cl_ragdoll_maxcount" => Some(Integer(0, 32)),
        "setting.cl_particle_fallback_base" => Some(Integer(0, 8)),
        "setting.gamma" => Some(Number(0.5, 3.0)),
        "setting.sound_volume" => Some(Number(0.0, 1.0)),
        "setting.r_lod_switch_scale" => Some(Number(0.0, 4.0)),
        "setting.fadeDistScale" => Some(Number(0.0, 2.0)),
        "setting.cl_particle_fallback_multiplier" => Some(Number(0.0, 8.0)),
        _ => None,
    }
}

pub(crate) fn validate_video_updates(updates: &HashMap<String, String>) -> Result<(), String> {
    for (key, value) in updates {
        let suffix = key
            .strip_prefix("setting.")
            .ok_or_else(|| format!("apex.errors.invalidVideoConfigKey: {key}"))?;
        if suffix.is_empty()
            || !suffix
                .chars()
                .next()
                .is_some_and(|character| character.is_ascii_alphanumeric())
            || !suffix.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '-')
            })
            || key
                .chars()
                .any(|character| character == '"' || character.is_control())
        {
            return Err(format!("apex.errors.invalidVideoConfigKey: {key}"));
        }
        let rule = video_value_rule(key)
            .ok_or_else(|| format!("apex.errors.invalidVideoConfigKey: {key}"))?;
        if value
            .chars()
            .any(|character| character == '"' || character.is_control())
        {
            return Err(format!("apex.errors.invalidVideoConfigValue: {key}"));
        }
        let valid = value.trim() == value
            && match rule {
                VideoValueRule::Enum(values) => values.contains(&value.as_str()),
                VideoValueRule::Integer(min, max) => value
                    .parse::<i64>()
                    .is_ok_and(|number| number >= min && number <= max),
                VideoValueRule::Number(min, max) => value
                    .parse::<f64>()
                    .is_ok_and(|number| number.is_finite() && number >= min && number <= max),
            };
        if !valid {
            return Err(format!("apex.errors.invalidVideoConfigValue: {key}"));
        }
    }
    Ok(())
}

pub(crate) fn apex_is_running_sync() -> Result<bool, String> {
    apex_is_running_by_tasklist()
}

#[tauri::command]
pub async fn get_apex_launch_option(id: usize) -> IpcResult<String> {
    blocking_cmd(move || read_steam_launch_options(id))
        .await
        .map_err(apex_error)
}

///反加Apex对应的语言列表
#[tauri::command]
pub async fn get_apex_languages_depots() -> IpcResult<HashMap<String, i32>> {
    blocking_value(|| {
        apex_languages_depots()
            .iter()
            .map(|(l, v)| (l.language.to_string(), *v))
            .collect()
    })
    .await
    .map_err(apex_error)
}

/*
id: xxxxxxxx
launch_option: schinese tchinese
 */
#[tauri::command]
pub async fn set_apex_launch_option(
    app: tauri::AppHandle,
    id: usize,
    launch_option: String,
    history_source: Option<ApexHistorySource>,
    transaction_id: Option<String>,
) -> IpcResult<()> {
    blocking_cmd(move || {
        validate_launch_options(&launch_option)?;
        let _guard = lock_history()?;
        let current = read_steam_launch_options(id)?;
        if current == launch_option {
            return Ok(());
        }
        if steam_is_running_sync()? {
            return Err("apex.history.errors.launcherRunning".to_string());
        }
        let entry = record_launch_before_locked(
            &app,
            history_source.unwrap_or_default(),
            transaction_id.as_deref(),
            ApexLauncherRef {
                kind: "steam".to_string(),
                id: id.to_string(),
                name: String::new(),
            },
            current.clone(),
        )?;
        if let Err(error) = write_steam_launch_options(id, &launch_option) {
            let unchanged = read_steam_launch_options(id)
                .map(|after| after == current)
                .unwrap_or(false);
            if unchanged && entry.scope_added {
                let _ =
                    discard_scope_locked_for_app(&app, &entry.entry.id, ApexConfigScope::Launch);
            }
            return Err(error);
        }
        let _ = prune_history_locked(&app);
        Ok(())
    })
    .await
    .map_err(apex_error)
}

// 应用apex语音包
/*
下载位置 C:\Program Files (x86)\Steam\steamapps\content\app_1172470\depot_1172475\audio\ship
替换位置 D:\SteamLibrary\steamapps\common\Apex Legends\audio
 */

/// 语音包复制主体逻辑；`apply_apex_miles_language` 与一键下载完成后共用。
pub(crate) fn copy_miles_language_to_game(
    depot: usize,
    platform: Option<&str>,
    ea_user_id: Option<&str>,
) -> Result<(), String> {
    if platform
        .map(|p| p.eq_ignore_ascii_case("ea"))
        .unwrap_or(false)
    {
        return Err("apex.errors.eaMilesDepotUnsupported".to_string());
    }
    let apex_audio_path = get_apex_audio_folder_path_by_platform(platform, ea_user_id)
        .ok_or("toast.milesLanguageNotFound")?;
    let download_folder = get_apex_download_folder_path_by_platform(depot, platform, ea_user_id)
        .ok_or(format!("toast.milesLanguageNotFound: {}", depot))?;

    if !apex_audio_path.exists() {
        return Err(format!(
            "toast.milesLanguageNotFound: {:?}",
            apex_audio_path
        ));
    }
    if !download_folder.exists() {
        return Err(format!(
            "toast.milesLanguageNotFound: {:?}",
            download_folder
        ));
    }

    log_info!(
        "{} -> {}",
        download_folder.display(),
        apex_audio_path.display()
    );

    copy_dir_all(&download_folder, &apex_audio_path)
        .map_err(|e| format!("apex.errors.applyMilesCopyFailed: {}", e))
}

#[tauri::command]
pub async fn apply_apex_miles_language(
    depot: usize,
    platform: Option<String>,
    ea_user_id: Option<String>,
) -> IpcResult<()> {
    blocking_cmd(move || {
        copy_miles_language_to_game(depot, platform.as_deref(), ea_user_id.as_deref())
    })
    .await
    .map_err(apex_error)
}
//如果语音包文件不在反回 false
#[tauri::command]
pub async fn check_apex_miles_language(
    language: String,
    platform: Option<String>,
    ea_user_id: Option<String>,
) -> IpcResult<bool> {
    blocking_cmd(move || {
        log_info!("检查语言 check_apex_miles_language {}", language);
        caml(language, platform.as_deref(), ea_user_id.as_deref())
    })
    .await
    .map_err(apex_error)
}
#[tauri::command]
pub async fn open_apex_audio_folder_path(
    platform: Option<String>,
    ea_user_id: Option<String>,
) -> IpcResult<()> {
    blocking_cmd(move || {
        if let Some(apex_audio_path) =
            get_apex_audio_folder_path_by_platform(platform.as_deref(), ea_user_id.as_deref())
        {
            log_info!("open_apex_audio_folder_path {}", apex_audio_path.display());
            apex_audio_path.open_path()
        } else {
            Err("toast.milesLanguageNotFound".to_string())
        }
    })
    .await
    .map_err(apex_error)
}
#[tauri::command]
pub async fn open_apex_depot_download_folder_path(
    depot: usize,
    platform: Option<String>,
    ea_user_id: Option<String>,
) -> IpcResult<()> {
    blocking_cmd(move || {
        if platform
            .as_deref()
            .map(|p| p.eq_ignore_ascii_case("ea"))
            .unwrap_or(false)
        {
            return Err("apex.errors.eaNoSteamDepotFolder".to_string());
        }
        if let Some(download_folder) = get_apex_download_folder_path_by_platform(
            depot,
            platform.as_deref(),
            ea_user_id.as_deref(),
        ) {
            log_info!(
                "open_apex_depot_download_folder_path {}",
                download_folder.display()
            );
            download_folder.open_path()
        } else {
            Err(format!("toast.milesLanguageNotFound: {}", depot))
        }
    })
    .await
    .map_err(apex_error)
}

#[tauri::command]
pub async fn apex_is_running() -> IpcResult<bool> {
    blocking_cmd(apex_is_running_by_tasklist)
        .await
        .map_err(apex_error)
}

/// 强制结束 Apex 游戏进程，便于写入 `videoconfig.txt`。
#[tauri::command]
pub async fn thoroughly_kill_apex() -> IpcResult<u32> {
    let target_processes = if cfg!(target_os = "windows") {
        vec!["r5apex.exe", "r5apex_dx12.exe"]
    } else {
        vec![]
    };
    thoroughly_kill_named("Apex", target_processes, ProcessNameMatchMode::Exact)
        .await
        .map_err(apex_error)
}

/// `videoconfig.txt` 所在目录(`.../Saved Games/Respawn/Apex/local`)。
#[tauri::command]
pub async fn get_apex_videoconfig_folder_path() -> IpcResult<String> {
    blocking_cmd(|| {
        let path = get_apex_videoconfig_path()?;
        let parent = path
            .parent()
            .ok_or_else(|| "apex.errors.videoConfigDirUnresolved".to_string())?;
        Ok(parent.to_string_lossy().into_owned())
    })
    .await
    .map_err(apex_error)
}

/// 读取 `videoconfig.txt` 中 `setting.*` 键值。
#[tauri::command]
pub async fn get_apex_video_config() -> IpcResult<HashMap<String, String>> {
    blocking_cmd(read_video_config_sync)
        .await
        .map_err(apex_error)
}

/// 写入 `videoconfig.txt`；Apex 正在运行时会拒绝写入。
/// 文件只读时会自动 解锁→写入→重新锁定。
#[tauri::command]
pub async fn set_apex_video_config(
    app: tauri::AppHandle,
    updates: HashMap<String, String>,
    history_source: Option<ApexHistorySource>,
    transaction_id: Option<String>,
) -> IpcResult<()> {
    blocking_cmd(move || {
        validate_video_updates(&updates)?;
        let _guard = lock_history()?;
        let current = read_video_config_sync()?;
        let changed = updates
            .iter()
            .any(|(key, value)| current.get(key) != Some(value));
        if !changed {
            return Ok(());
        }
        if apex_is_running_by_tasklist()? {
            return Err("apex.apexRunningVideoConfig".to_string());
        }
        let entry = record_video_before_locked(
            &app,
            history_source.unwrap_or_default(),
            transaction_id.as_deref(),
        )?;
        if let Err(error) = patch_video_config_sync(&updates) {
            let unchanged = read_video_config_sync()
                .map(|after| {
                    updates
                        .iter()
                        .all(|(key, _)| after.get(key) == current.get(key))
                })
                .unwrap_or(false);
            if unchanged && entry.scope_added {
                let _ = discard_scope_locked_for_app(&app, &entry.entry.id, ApexConfigScope::Video);
            }
            return Err(error);
        }
        let _ = prune_history_locked(&app);
        Ok(())
    })
    .await
    .map_err(apex_error)
}

/// 查询 `videoconfig.txt` 是否为只读。
#[tauri::command]
pub async fn get_apex_videoconfig_readonly() -> IpcResult<bool> {
    blocking_cmd(is_videoconfig_readonly)
        .await
        .map_err(apex_error)
}

/// 设置/取消 `videoconfig.txt` 只读属性。
#[tauri::command]
pub async fn set_apex_videoconfig_readonly(locked: bool) -> IpcResult<()> {
    blocking_cmd(move || set_videoconfig_readonly(locked))
        .await
        .map_err(apex_error)
}

/// 按类型读取 Apex 配置文件键值(供后续备份/分享使用)。
#[tauri::command]
pub async fn get_apex_config_file(kind: String) -> IpcResult<HashMap<String, String>> {
    blocking_cmd(move || {
        let kind = parse_config_file_kind(&kind)?;
        let doc = load_apex_config(kind)?;
        Ok(doc.key_values().into_iter().collect())
    })
    .await
    .map_err(apex_error)
}

/// 按类型写入 Apex 配置文件键值（当前未挂 IPC，保留实现供后续备份/分享接入）。
#[allow(dead_code)]
pub async fn set_apex_config_file(
    kind: String,
    updates: HashMap<String, String>,
) -> Result<(), String> {
    blocking_cmd(move || {
        if kind.eq_ignore_ascii_case("videoconfig") && apex_is_running_by_tasklist()? {
            return Err("apex.apexRunningVideoConfig".to_string());
        }
        let kind = parse_config_file_kind(&kind)?;
        if matches!(kind, ApexConfigFileKind::VideoConfig) {
            validate_video_updates(&updates)?;
        }
        let path = windows_tool::game::apex::get_apex_config_path(kind)?;
        let mut doc = if path.exists() {
            ApexCfgDocument::load_from_file(&path)?
        } else {
            ApexCfgDocument::new()
        };
        for (key, value) in updates {
            doc.set(&key, value)?;
        }
        save_apex_config(&doc, kind)
    })
    .await
}

fn parse_config_file_kind(kind: &str) -> Result<ApexConfigFileKind, String> {
    match kind.to_ascii_lowercase().as_str() {
        "videoconfig" | "video_config" | "videoconfig.txt" => Ok(ApexConfigFileKind::VideoConfig),
        "settings" | "settings.cfg" => Ok(ApexConfigFileKind::Settings),
        "profile" | "profile.cfg" => Ok(ApexConfigFileKind::Profile),
        _ => Err(format!("apex.errors.unknownConfigKind: {kind}")),
    }
}

fn apex_error(message: String) -> IpcError {
    IpcError::from_message("apex", message)
}

pub trait PathBufExt {
    fn open_path(self) -> Result<(), String>; //打开路径
}

impl PathBufExt for PathBuf {
    fn open_path(self) -> Result<(), String> {
        match open_path(
            &self
                .canonicalize()
                .map_err(|e| format!("{} {:?}", e, self))?,
            None::<&str>,
        ) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("{} {:?}", e, self)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_updates_accept_only_canonical_setting_keys() {
        assert!(validate_video_updates(&HashMap::from([(
            "setting.defaultres".to_string(),
            "1920".to_string(),
        )]))
        .is_ok());
        for key in [
            "other.defaultres",
            "\"setting.defaultres\"",
            "setting.defaultres\nsetting.fullscreen",
            "setting.",
        ] {
            assert!(
                validate_video_updates(&HashMap::from([(key.to_string(), "1".to_string(),)]))
                    .is_err()
            );
        }
        for value in ["bad\0value", "bad\nvalue", "bad\u{85}value", "\"quoted\""] {
            assert!(validate_video_updates(&HashMap::from([(
                "setting.defaultres".to_string(),
                value.to_string(),
            )]))
            .is_err());
        }
    }
}
