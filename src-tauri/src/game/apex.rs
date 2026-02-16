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

use std::collections::HashMap;
use std::path::PathBuf;
use tauri_plugin_opener::open_path;
use windows_tool::game::apex::{
    check_apex_miles_language as caml, get_apex_audio_folder_path,
    get_apex_depot_download_folder_path, get_apex_launch_options_by_steam_user_id,
    set_apex_launch_options_by_steam_user_id, APEX_LANGUAGES_DEPOTS,
};
use windows_tool::utils::file::copy_dir_all;

#[tauri::command]
pub fn get_apex_launch_option(id: usize) -> Result<String, String> {
    get_apex_launch_options_by_steam_user_id(id)
}

///反加Apex对应的语言列表
#[tauri::command]
pub fn get_apex_languages_depots() -> HashMap<String, i32> {
    APEX_LANGUAGES_DEPOTS
        .iter()
        .map(|(l, v)| (l.language.to_string(), *v))
        .collect()
}

/*
id: xxxxxxxx
launch_option: schinese tchinese
 */
#[tauri::command]
pub fn set_apex_launch_option(id: usize, launch_option: String) -> Result<(), String> {
    set_apex_launch_options_by_steam_user_id(id, &launch_option)
}

// 应用apex语音包
/*
下载位置 C:\Program Files (x86)\Steam\steamapps\content\app_1172470\depot_1172475\audio\ship
替换位置 D:\SteamLibrary\steamapps\common\Apex Legends\audio
 */
#[tauri::command]
pub fn apply_apex_miles_language(depot: usize) -> Result<(), String> {
    let apex_audio_path = get_apex_audio_folder_path().ok_or("未找到Apex语音包位置")?;
    let download_folder = get_apex_depot_download_folder_path(depot)
        .ok_or(format!("未找到下载的Apex语音包,请下载后重试 {}", depot))?;

    if !apex_audio_path.exists() {
        return Err(format!("未找到Apex目录语音包位置 ! {:?}", apex_audio_path));
    }
    if !download_folder.exists() {
        return Err(format!("未下载语音包,请下载后重试 ! {:?}", download_folder));
    }

    println!(
        "{} -> {}",
        download_folder.display(),
        apex_audio_path.display()
    );

    match copy_dir_all(&download_folder, &apex_audio_path) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("应用Apex 语音包错误 无法复制 {}", e)),
    }
}
//如果语音包文件不在反回 false
#[tauri::command]
pub fn check_apex_miles_language(language: String) -> Result<bool, String> {
    println!("检查语言 check_apex_miles_language {}", language);
    caml(language)
}
#[tauri::command]
pub fn open_apex_audio_folder_path() -> Result<(), String> {
    if let Some(apex_audio_path) = get_apex_audio_folder_path() {
        println!("open_apex_audio_folder_path {}", apex_audio_path.display());
        apex_audio_path.open_path()
    } else {
        Err("未找到Apex语音包位置".to_string())
    }
}
#[tauri::command]
pub fn open_apex_depot_download_folder_path(depot: usize) -> Result<(), String> {
    if let Some(download_folder) = get_apex_depot_download_folder_path(depot) {
        println!(
            "open_apex_depot_download_folder_path {}",
            download_folder.display()
        );
        download_folder.open_path()
    } else {
        Err(format!("未找到Apex语音包下载位置 {}", depot))
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
