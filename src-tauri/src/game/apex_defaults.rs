//! Apex 默认配置模板(嵌入式)。
//!
//! 来源:当前构建 R5pc_r5-300_J57_CL11457258_2026_08_19_15_40 的实测与
//! 真实游戏生成文件,逐项核实记录见 docs/CHANGELOG.md。
//!
//! - settings.cfg:完整默认键位块来自当前构建真实生成文件;cvar 只收结构性
//!   键,账号/机器本地键与用户可调偏好故意省略(游戏运行时以编译默认补齐)。
//!   绑定不会被游戏补齐,所以模板带完整默认绑定集 —— 这修复了"快速预设在
//!   settings.cfg 缺失时只写入少量绑定"的问题。
//! - profile.cfg:键集为 13 份配置历史快照的并集;结构键取稳定值,偏好键取
//!   出厂默认。
//! - videoconfig.txt:画质档位取通用安全中档;分辨率从机器当前配置保留,
//!   避免写错显示器。

use windows_tool::game::apex::config::decode_bytes;

/// 完整默认 settings.cfg。
pub const APEX_DEFAULT_SETTINGS_CFG: &str = include_str!("apex_defaults/settings.cfg");
/// 默认 profile.cfg。
pub const APEX_DEFAULT_PROFILE_CFG: &str = include_str!("apex_defaults/profile.cfg");

/// videoconfig.txt 默认模板的固定部分(不含分辨率,分辨率按机器当前值保留)。
/// 值为通用安全中档(实测当前构建的键集与结构)。
pub const APEX_DEFAULT_VIDEOCONFIG_BODY: &str = include_str!("apex_defaults/videoconfig_body.txt");

const DEFAULT_VIDEO_WIDTH: u32 = 1920;
const DEFAULT_VIDEO_HEIGHT: u32 = 1080;

/// 生成默认 videoconfig.txt:分辨率/显示尺寸按给定值,其余为默认画质档位。
/// 分辨率键由调用方从机器当前配置读取后传入,避免写错显示器。
pub fn build_default_videoconfig(width: u32, height: u32) -> String {
    APEX_DEFAULT_VIDEOCONFIG_BODY
        .replace("__DEFAULTRES__", &width.to_string())
        .replace("__DEFAULTRESHEIGHT__", &height.to_string())
}

fn parse_quoted_setting_u32(content: &str, key: &str) -> Option<u32> {
    let marker = format!("\"{key}\"");
    let after = content.split(&marker).nth(1)?;
    after.split('"').nth(1)?.parse().ok()
}

/// 从现有 videoconfig 字节中取出分辨率;缺失或越界时回退 1920×1080。
pub fn resolution_from_videoconfig_bytes(bytes: &[u8]) -> (u32, u32) {
    let Ok((content, _)) = decode_bytes(bytes) else {
        return (DEFAULT_VIDEO_WIDTH, DEFAULT_VIDEO_HEIGHT);
    };
    let width = parse_quoted_setting_u32(&content, "setting.defaultres")
        .or_else(|| parse_quoted_setting_u32(&content, "setting.last_display_width"))
        .filter(|value| (512..=7680).contains(value));
    let height = parse_quoted_setting_u32(&content, "setting.defaultresheight")
        .or_else(|| parse_quoted_setting_u32(&content, "setting.last_display_height"))
        .filter(|value| (128..=4320).contains(value));
    match (width, height) {
        (Some(width), Some(height)) => (width, height),
        _ => (DEFAULT_VIDEO_WIDTH, DEFAULT_VIDEO_HEIGHT),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
            "roamingcam_togglerollmode",
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

    #[test]
    fn videoconfig_template_substitutes_resolution() {
        let text = build_default_videoconfig(2560, 1440);
        assert!(text.contains("\"setting.defaultres\"\t\t\"2560\""));
        assert!(text.contains("\"setting.defaultresheight\"\t\t\"1440\""));
        assert!(text.contains("\"setting.last_display_width\"\t\t\"2560\""));
        assert!(text.contains("\"setting.last_display_height\"\t\t\"1440\""));
        assert!(!text.contains("__DEFAULTRES__"));
        assert!(text.contains("\"setting.mat_picmip\""));
        assert!(text.contains("\"setting.ssao_quality\""));
    }

    #[test]
    fn videoconfig_resolution_prefers_current_defaultres() {
        let bytes = br#""VideoConfig"
{
	"setting.last_display_width"		"1920"
	"setting.last_display_height"		"1080"
	"setting.defaultres"		"2560"
	"setting.defaultresheight"		"1440"
}
"#;
        assert_eq!(resolution_from_videoconfig_bytes(bytes), (2560, 1440));
    }

    #[test]
    fn videoconfig_resolution_falls_back_when_missing() {
        assert_eq!(
            resolution_from_videoconfig_bytes(b"\"VideoConfig\"\n{\n}\n"),
            (1920, 1080)
        );
    }
}
