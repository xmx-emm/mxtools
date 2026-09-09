//! Apex reset and missing-config defaults.
//!
//! Keyboard/mouse bindings follow the game defaults, including both skill side buttons.
//! Device/account-local values are omitted. Reset generates video settings from
//! the supported hardware settings and subtitles from the installed game language.

mod environment;
pub(crate) mod video;

use crate::game::apex_history::ApexLauncherRef;

pub(crate) struct ApexDefaultConfigs {
    pub video: String,
    pub profile: String,
}

pub(crate) fn generate(launcher: &ApexLauncherRef) -> Result<ApexDefaultConfigs, String> {
    let (root, language) = environment::installation(launcher)?;
    let dxsupport = environment::initialization_resources(&root)?;
    let hardware = environment::hardware()?;
    from_inputs(&dxsupport, &hardware, &language)
}

pub(crate) fn from_inputs(
    dxsupport: &str,
    hardware: &video::Hardware,
    language: &str,
) -> Result<ApexDefaultConfigs, String> {
    Ok(ApexDefaultConfigs {
        video: video::generate(dxsupport, hardware)?,
        profile: profile_for_language(language)?,
    })
}

fn profile_for_language(language: &str) -> Result<String, String> {
    let caption = match language {
        "english" | "en_US" => 0,
        "schinese" | "tchinese" | "japanese" | "koreana" | "french" | "german" | "italian"
        | "spanish" | "latam" | "brazilian" | "russian" | "polish" | "arabic" | "zh_CN"
        | "zh_TW" | "ja_JP" | "ko_KR" | "fr_FR" | "de_DE" | "it_IT" | "es_ES" | "es_MX"
        | "pt_BR" | "ru_RU" | "pl_PL" | "ar_SA" => 1,
        _ => return Err("apex.history.errors.defaultLanguageUnavailable".into()),
    };
    Ok(format!(
        "{}\nclosecaption \"{caption}\"\n",
        APEX_DEFAULT_PROFILE_CFG.trim_end()
    ))
}

/// 完整默认 settings.cfg。
pub const APEX_DEFAULT_SETTINGS_CFG: &str = include_str!("apex_defaults/settings.cfg");
/// 默认 profile.cfg。
pub const APEX_DEFAULT_PROFILE_CFG: &str = include_str!("apex_defaults/profile.cfg");

#[cfg(test)]
mod tests {
    use super::*;
    use windows_tool::game::apex::config::decode_bytes;
    use windows_tool::game::apex::config::ApexCfgDocument;

    #[test]
    fn settings_template_has_complete_default_bindings() {
        let (content, encoding) = decode_bytes(APEX_DEFAULT_SETTINGS_CFG.as_bytes()).unwrap();
        let doc = ApexCfgDocument::from_content(&content, encoding).unwrap();
        let text = doc.to_string();
        // 完整默认键位:武器、移动、互动、标记、技能、观战、手柄全覆盖。
        for needle in [
            "weaponSelectPrimary0",
            "+forward",
            "+moveleft",
            "+jump",
            "+toggle_zoom",
            "+attack",
            "+weaponcycle",
            "in_spec_toggle_freecam",
            "toggleconsole",
            "+ability 0",
            "+ability_held 0",
        ] {
            assert!(text.contains(needle), "settings template missing {needle}");
        }
    }

    #[test]
    fn profile_template_has_core_keys() {
        for needle in [
            "cl_fovScale",
            "gamepad_aim_speed",
            "gamepad_custom_hip_yaw",
            "hud_setting_showObituary",
            "sound_volume_sfx",
            "colorblind_mode",
        ] {
            assert!(
                APEX_DEFAULT_PROFILE_CFG.contains(needle),
                "profile template missing {needle}"
            );
        }
    }

    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/rust/src-tauri/game/apex_reset_mouse_bindings.rs"
    ));
}
