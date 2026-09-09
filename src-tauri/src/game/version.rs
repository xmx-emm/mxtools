use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::blocking_cmd;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use windows_tool::game::steam::get_steam_game_library_folder_by_game_id;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Game {
    Apex,
    Pubg,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameVersion {
    version: Option<String>,
    build: Option<String>,
    installed: bool,
}

fn small_text(path: &Path) -> Option<String> {
    if std::fs::metadata(path).ok()?.len() > 256 * 1024 {
        return None;
    }
    let text = std::fs::read_to_string(path).ok()?;
    let text = text.trim().trim_start_matches('\u{feff}').trim();
    (!text.is_empty()).then(|| text.to_string())
}

fn steam_install(game: Game) -> Option<(PathBuf, Option<String>)> {
    let id = match game {
        Game::Apex => 1172470,
        Game::Pubg => 578080,
    };
    let library = PathBuf::from(get_steam_game_library_folder_by_game_id(id).ok()?);
    let library = if library.is_absolute() {
        library
    } else {
        PathBuf::from(windows_tool::registry::steam::get_steam_path_by_registry()?).join(library)
    };
    let steamapps = library.join("steamapps");
    let text = small_text(&steamapps.join(format!("appmanifest_{id}.acf")))?;
    parse_steam_install(&steamapps, &text, id)
}

fn parse_steam_install(
    steamapps: &Path,
    text: &str,
    app_id: usize,
) -> Option<(PathBuf, Option<String>)> {
    let vdf = windows_tool::vdf::parse_vdf_string(text).ok()?;
    let state = vdf.get("AppState")?;
    if state.get_value("appid")? != app_id.to_string() {
        return None;
    }
    let name = state.get_value("installdir")?;
    if name.is_empty()
        || Path::new(name)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return None;
    }
    let build = state
        .get_value("buildid")
        .filter(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()))
        .map(str::to_string);
    Some((steamapps.join("common").join(name), build))
}

fn read_version(
    game: Game,
    platform: &str,
    ea_user_id: Option<&str>,
) -> Result<GameVersion, String> {
    let found = installed_root(game, platform, ea_user_id)?;
    let Some((root, steam_build)) = found.filter(|(root, _)| root.is_dir()) else {
        return Ok(GameVersion {
            version: None,
            build: None,
            installed: false,
        });
    };
    let (version, build) = match game {
        Game::Apex => (
            small_text(&root.join("gameversion.txt")),
            small_text(&root.join("build.txt")),
        ),
        Game::Pubg => (None, steam_build),
    };
    Ok(GameVersion {
        version: version.filter(|value| valid_version_text(value)),
        build: build.filter(|value| valid_version_text(value)),
        installed: true,
    })
}

pub(crate) fn installed_root(
    game: Game,
    platform: &str,
    ea_user_id: Option<&str>,
) -> Result<Option<(PathBuf, Option<String>)>, String> {
    let found = match (game, platform) {
        (Game::Apex, "ea") => {
            if !ea_user_id
                .is_some_and(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()))
            {
                return Err("invalid EA account".into());
            }
            windows_tool::game::apex::get_apex_audio_folder_path_by_platform(Some("ea"), ea_user_id)
                .and_then(|p| p.parent()?.parent().map(|root| (root.to_path_buf(), None)))
        }
        (_, "steam") => steam_install(game),
        _ => return Err("invalid game platform".into()),
    };
    Ok(found)
}

#[tauri::command]
pub async fn get_installed_game_version(
    game: Game,
    platform: String,
    ea_user_id: Option<String>,
) -> IpcResult<GameVersion> {
    blocking_cmd(move || read_version(game, &platform, ea_user_id.as_deref()))
        .await
        .map_err(|e| IpcError::operation_failed("game_version", e))
}

fn valid_version_text(value: &str) -> bool {
    !value.is_empty() && value.len() <= 160 && !value.chars().any(char::is_control)
}

#[cfg(test)]
mod tests {
    use super::*;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/game/version.rs"
    ));
}
