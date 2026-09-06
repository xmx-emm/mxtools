//! Apex reset and missing-config defaults.
//!
//! Keyboard/mouse bindings follow the game defaults, including both skill side buttons.
//! Device/account-local values are omitted. Language-dependent subtitles and
//! hardware-dependent video settings are initialized by the game.

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
