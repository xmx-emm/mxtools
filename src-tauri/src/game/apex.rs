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

use crate::log_info;
use crate::utils::{await_time, blocking_cmd, blocking_value, kill_processes_by_names, ProcessNameMatchMode};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri_plugin_opener::open_path;
use windows_tool::game::apex::{
  apex_is_running_by_tasklist, check_apex_miles_language_by_platform as caml,
  get_apex_audio_folder_path_by_platform, get_apex_download_folder_path_by_platform,
  get_apex_launch_options_by_steam_user_id, get_apex_videoconfig_path, is_videoconfig_readonly,
  load_apex_config, patch_apex_videoconfig, read_apex_videoconfig, save_apex_config,
  set_apex_launch_options_by_steam_user_id, set_videoconfig_readonly, ApexConfigFileKind,
  APEX_LANGUAGES_DEPOTS,
};
use windows_tool::game::apex::config::ApexCfgDocument;
use windows_tool::utils::filesystem::copy_dir_all;

#[tauri::command]
pub async fn get_apex_launch_option(id: usize) -> Result<String, String> {
    blocking_cmd(move || get_apex_launch_options_by_steam_user_id(id)).await
}

///反加Apex对应的语言列表
#[tauri::command]
pub async fn get_apex_languages_depots() -> Result<HashMap<String, i32>, String> {
    blocking_value(|| {
        APEX_LANGUAGES_DEPOTS
            .iter()
            .map(|(l, v)| (l.language.to_string(), *v))
            .collect()
    })
    .await
}

/*
id: xxxxxxxx
launch_option: schinese tchinese
 */
#[tauri::command]
pub async fn set_apex_launch_option(id: usize, launch_option: String) -> Result<(), String> {
    blocking_cmd(move || set_apex_launch_options_by_steam_user_id(id, &launch_option)).await
}

// 应用apex语音包
/*
下载位置 C:\Program Files (x86)\Steam\steamapps\content\app_1172470\depot_1172475\audio\ship
替换位置 D:\SteamLibrary\steamapps\common\Apex Legends\audio
 */
#[tauri::command]
pub async fn apply_apex_miles_language(
    depot: usize,
    platform: Option<String>,
    ea_user_id: Option<String>,
) -> Result<(), String> {
    blocking_cmd(move || {
        let apex_audio_path = get_apex_audio_folder_path_by_platform(
            platform.as_deref(),
            ea_user_id.as_deref(),
        )
        .ok_or("未找到Apex语音包位置")?;
        let download_folder = get_apex_download_folder_path_by_platform(
            depot,
            platform.as_deref(),
            ea_user_id.as_deref(),
        )
        .ok_or(format!("未找到下载的Apex语音包,请下载后重试 {}", depot))?;

        if !apex_audio_path.exists() {
            return Err(format!("未找到Apex目录语音包位置 ! {:?}", apex_audio_path));
        }
        if !download_folder.exists() {
            return Err(format!("未下载语音包,请下载后重试 ! {:?}", download_folder));
        }

        log_info!(
            "{} -> {}",
            download_folder.display(),
            apex_audio_path.display()
        );

        copy_dir_all(&download_folder, &apex_audio_path)
            .map_err(|e| format!("应用Apex 语音包错误 无法复制 {}", e))
    })
    .await
}
//如果语音包文件不在反回 false
#[tauri::command]
pub async fn check_apex_miles_language(
    language: String,
    platform: Option<String>,
    ea_user_id: Option<String>,
) -> Result<bool, String> {
    blocking_cmd(move || {
        log_info!("检查语言 check_apex_miles_language {}", language);
        caml(language, platform.as_deref(), ea_user_id.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn open_apex_audio_folder_path(
    platform: Option<String>,
    ea_user_id: Option<String>,
) -> Result<(), String> {
    blocking_cmd(move || {
        if let Some(apex_audio_path) =
            get_apex_audio_folder_path_by_platform(platform.as_deref(), ea_user_id.as_deref())
        {
            log_info!("open_apex_audio_folder_path {}", apex_audio_path.display());
            apex_audio_path.open_path()
        } else {
            Err("未找到Apex语音包位置".to_string())
        }
    })
    .await
}
#[tauri::command]
pub async fn open_apex_depot_download_folder_path(
    depot: usize,
    platform: Option<String>,
    ea_user_id: Option<String>,
) -> Result<(), String> {
    blocking_cmd(move || {
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
            Err(format!("未找到Apex语音包下载位置 {}", depot))
        }
    })
    .await
}

#[tauri::command]
pub async fn apex_is_running() -> Result<bool, String> {
    blocking_cmd(apex_is_running_by_tasklist).await
}

/// 强制结束 Apex 游戏进程，便于写入 `videoconfig.txt`。
#[tauri::command]
pub async fn thoroughly_kill_apex() -> Result<(), ()> {
    log_info!("正在强制关闭 Apex 游戏进程...");

    let target_processes = if cfg!(target_os = "windows") {
        vec!["r5apex.exe", "r5apex_dx12.exe"]
    } else {
        vec![]
    };

    let killed_count = tokio::task::spawn_blocking(move || {
        kill_processes_by_names(&target_processes, ProcessNameMatchMode::Exact)
    })
    .await
    .unwrap_or(0);

    if killed_count > 0 {
        log_info!("已关闭 {} 个 Apex 游戏进程", killed_count);
    } else {
        log_info!("未找到运行中的 Apex 游戏进程");
    }
    await_time().await;
    Ok(())
}

/// `videoconfig.txt` 所在目录(`.../Saved Games/Respawn/Apex/local`)。
#[tauri::command]
pub async fn get_apex_videoconfig_folder_path() -> Result<String, String> {
    blocking_cmd(|| {
        let path = get_apex_videoconfig_path()?;
        let parent = path
            .parent()
            .ok_or_else(|| "无法解析 Apex 画面配置目录".to_string())?;
        Ok(parent.to_string_lossy().into_owned())
    })
    .await
}

/// 读取 `videoconfig.txt` 中 `setting.*` 键值。
#[tauri::command]
pub async fn get_apex_video_config() -> Result<HashMap<String, String>, String> {
    blocking_cmd(|| {
        let (_, map) = read_apex_videoconfig()?;
        Ok(map)
    })
    .await
}

/// 写入 `videoconfig.txt`；Apex 正在运行时会拒绝写入。
/// 文件只读时会自动 解锁→写入→重新锁定。
#[tauri::command]
pub async fn set_apex_video_config(updates: HashMap<String, String>) -> Result<(), String> {
    blocking_cmd(move || {
        if apex_is_running_by_tasklist()? {
            return Err("Apex 正在运行，请先完全退出游戏后再应用画面配置".to_string());
        }
        patch_apex_videoconfig(&updates).map(|_| ())
    })
    .await
}

/// 查询 `videoconfig.txt` 是否为只读。
#[tauri::command]
pub async fn get_apex_videoconfig_readonly() -> Result<bool, String> {
    blocking_cmd(is_videoconfig_readonly).await
}

/// 设置/取消 `videoconfig.txt` 只读属性。
#[tauri::command]
pub async fn set_apex_videoconfig_readonly(locked: bool) -> Result<(), String> {
    blocking_cmd(move || set_videoconfig_readonly(locked)).await
}

/// 按类型读取 Apex 配置文件键值(供后续备份/分享使用)。
#[tauri::command]
pub async fn get_apex_config_file(kind: String) -> Result<HashMap<String, String>, String> {
    blocking_cmd(move || {
        let kind = parse_config_file_kind(&kind)?;
        let doc = load_apex_config(kind)?;
        Ok(doc.key_values().into_iter().collect())
    })
    .await
}

/// 按类型写入 Apex 配置文件键值(供后续备份/分享使用)。
#[tauri::command]
pub async fn set_apex_config_file(
    kind: String,
    updates: HashMap<String, String>,
) -> Result<(), String> {
    blocking_cmd(move || {
        if kind.eq_ignore_ascii_case("videoconfig") && apex_is_running_by_tasklist()? {
            return Err("Apex 正在运行，请先完全退出游戏后再应用画面配置".to_string());
        }
        let kind = parse_config_file_kind(&kind)?;
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
        _ => Err(format!("未知的 Apex 配置文件类型: {kind}")),
    }
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
