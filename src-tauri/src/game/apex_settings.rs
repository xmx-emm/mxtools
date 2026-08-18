use crate::game::apex_history::{
    discard_scope_locked_for_app, lock_history, prepare_legacy_game_settings_import_locked,
    prune_history_locked, record_game_settings_before_locked, ApexConfigScope, ApexHistorySource,
};
use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::blocking_cmd;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use windows_tool::game::apex::config::{decode_bytes, ApexCfgDocument, ApexCfgLine};
use windows_tool::game::apex::{
    apex_is_running_by_tasklist, get_apex_config_path, ApexConfigFileKind,
};

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use winapi::um::errhandlingapi::GetLastError;
#[cfg(windows)]
use winapi::um::winbase::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConfigFile {
    Settings,
    Profile,
}

pub(crate) fn apex_game_settings_paths() -> Result<(PathBuf, PathBuf), String> {
    Ok((
        get_apex_config_path(ApexConfigFileKind::Settings)?,
        get_apex_config_path(ApexConfigFileKind::Profile)?,
    ))
}

impl ConfigFile {
    fn kind(self) -> ApexConfigFileKind {
        match self {
            Self::Settings => ApexConfigFileKind::Settings,
            Self::Profile => ApexConfigFileKind::Profile,
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum ValueRule {
    Bool,
    Integer(i64, i64),
    Number(f64, f64),
    NumberEnum(&'static [f64]),
    Enum(&'static [&'static str]),
    RgbOrDefault,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexSettingsFileReport {
    pub path: String,
    pub revision: String,
    pub values: HashMap<String, String>,
    pub unknown_keys: Vec<String>,
    pub backup_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexBinding {
    pub id: String,
    pub input: String,
    pub command: String,
    pub context: i32,
    pub held_command: Option<String>,
    pub editable: bool,
    pub occurrence: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexGameSettingsReport {
    pub settings: ApexSettingsFileReport,
    pub profile: ApexSettingsFileReport,
    pub bindings: Vec<ApexBinding>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "operation", rename_all = "camelCase")]
pub enum ApexBindingMutation {
    Update {
        id: String,
        input: String,
    },
    Delete {
        id: String,
    },
    Create {
        #[serde(rename = "templateId")]
        template_id: String,
        input: String,
        context: i32,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexGameSettingsApplyRequest {
    pub settings_revision: String,
    pub profile_revision: String,
    #[serde(default)]
    pub settings_updates: HashMap<String, String>,
    #[serde(default)]
    pub profile_updates: HashMap<String, String>,
    #[serde(default)]
    pub binding_mutations: Vec<ApexBindingMutation>,
    #[serde(default)]
    pub history_source: ApexHistorySource,
    #[serde(default)]
    pub transaction_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApexGameSettingsRestoreRequest {
    pub settings_revision: String,
    pub profile_revision: String,
    pub restore_settings: bool,
    pub restore_profile: bool,
}

#[derive(Debug, Clone)]
struct LoadedFile {
    path: PathBuf,
    bytes: Vec<u8>,
    revision: String,
    doc: ApexCfgDocument,
}

#[derive(Debug, Clone)]
struct ParsedBinding {
    kind: String,
    input: String,
    command: String,
    context: i32,
}

#[derive(Debug, Clone)]
struct BindingGroup {
    public: ApexBinding,
    line_indices: Vec<usize>,
}

const BOOL: &[&str] = &["0", "1"];
const ONE_TO_TWO: &[&str] = &["1", "2"];
const ZERO_TO_TWO: &[&str] = &["0", "1", "2"];
const ZERO_TO_THREE: &[&str] = &["0", "1", "2", "3"];
const ZERO_TO_SIX: &[&str] = &["0", "1", "2", "3", "4", "5", "6"];
const COMMS_FILTER: &[&str] = &["-1", "0", "1"];
const TRIGGER_THRESHOLDS: &[&str] = &["0", "30", "64", "128", "255"];
const PING_ALPHA: &[f64] = &[0.5, 1.0];

fn indexed_suffix(key: &str, prefix: &str, max: u8) -> bool {
    key.strip_prefix(prefix)
        .and_then(|suffix| suffix.parse::<u8>().ok())
        .is_some_and(|index| index <= max)
}

fn rule_for(file: ConfigFile, key: &str) -> Option<ValueRule> {
    use ValueRule::*;
    match file {
        ConfigFile::Settings => match key {
            "chroma_enable"
            | "gfx_amdUseLowLatency"
            | "gfx_nvnUseLowLatency"
            | "gfx_nvnUseLowLatencyBoost"
            | "lookspring"
            | "lookstrafe"
            | "m_acceleration"
            | "m_clamp_to_window"
            | "mouse_use_per_scope_sensitivity_scalars"
            | "sv_voiceenable"
            | "voice_mixer_mute"
            | "voice_modenable"
            | "voice_vox" => Some(Bool),
            "cc_linger_time" => Some(Number(0.0, 10.0)),
            "cc_predisplay_time" => Some(Number(0.0, 5.0)),
            "mouse_sensitivity" => Some(Number(0.01, 20.0)),
            "sound_volume_voice" => Some(Number(0.0, 2.0)),
            "voice_mixer_volume" | "voice_scale" => Some(Number(0.0, 1.0)),
            "ui_layout_mode" => Some(Enum(ZERO_TO_TWO)),
            "VoiceChatMode" | "miles_channels" => Some(Enum(ZERO_TO_TWO)),
            _ if indexed_suffix(key, "mouse_zoomed_sensitivity_scalar_", 7) => {
                Some(Number(0.1, 10.0))
            }
            _ => None,
        },
        ConfigFile::Profile => match key {
            "cl_deathhints_enabled"
            | "cl_anim_always_play_nonlobby_sfx"
            | "closecaption"
            | "CrossPlay_user_optin"
            | "fov_disableAbilityScaling"
            | "gamepad_aim_assist_melee"
            | "gamepad_buttons_are_southpaw"
            | "gamepad_custom_assist_on"
            | "gamepad_custom_enabled"
            | "gamepad_toggle_ads"
            | "gamepad_toggle_survivalSlot_to_weaponInspect"
            | "gamepad_togglecrouch_hold"
            | "gamepad_use_per_scope_ads_settings"
            | "gamepad_use_per_scope_sensitivity_scalars"
            | "hud_setting_accessibleChat"
            | "hud_setting_adsDof"
            | "hud_setting_anonymousMode"
            | "hud_setting_compactOverHeadNames"
            | "hud_setting_energyAmmoDisplay"
            | "hud_setting_minimapRotate"
            | "hud_setting_pingDoubleTapEnemy"
            | "hud_setting_showButtonHints"
            | "hud_setting_showCallsigns"
            | "hud_setting_showEnemyHealthBar"
            | "hud_setting_showEnemyHighlight"
            | "hud_setting_showHopUpPopUp"
            | "hud_setting_showLevelUp"
            | "hud_setting_showMedals"
            | "hud_setting_showObituary"
            | "hud_setting_showOffscreenPortrait"
            | "hud_setting_showTeamNamesOnMap"
            | "hud_setting_showTips"
            | "hud_setting_showWeaponFlyouts"
            | "hudchat_play_text_to_speech"
            | "joy_inverty"
            | "laserSightColorCustomized"
            | "m_invert_pitch"
            | "party_color_enabled"
            | "pin_opt_in"
            | "ps5_trig_enable"
            | "player_setting_autosprint"
            | "player_setting_damage_closes_deathbox_menu"
            | "player_setting_holdtosprint"
            | "player_setting_stickysprintforward"
            | "player_use_prompt_enabled"
            | "sound_musicReduced"
            | "sound_without_focus"
            | "speechtotext_enabled"
            | "toggle_on_jump_to_deactivate"
            | "voice_enabled"
            | "weapon_setting_autocycle_on_empty" => Some(Bool),
            "dialogue_cat_host_flavor"
            | "dialogue_cat_host_important"
            | "dialogue_cat_legend_flavor"
            | "dialogue_cat_legend_important"
            | "dialogue_cat_ping_flavor"
            | "dialogue_cat_ping_important" => Some(Enum(BOOL)),
            "cc_text_size"
            | "gamepad_deadzone_index_look"
            | "gamepad_use_type"
            | "damage_indicator_style_pilot"
            | "hud_setting_damageIndicatorStyle"
            | "joy_rumble"
            | "hud_setting_chainHeal"
            | "hud_setting_streamerMode"
            | "hudchat_visibility"
            | "player_setting_arsenals_maphudidentifiers"
            | "player_setting_gamestateawareness_callouts"
            | "player_setting_lowammo_setting"
            | "player_setting_tutorialization" => Some(Enum(ZERO_TO_TWO)),
            "hud_setting_damageTextStyle"
            | "mantle_boost_input_setting"
            | "mantle_boost_ui_setting" => Some(Enum(ZERO_TO_THREE)),
            "gamepad_deadzone_index_move" => Some(Enum(ONE_TO_TWO)),
            "cl_comms_filter" => Some(Enum(COMMS_FILTER)),
            "colorblind_mode" | "gamepad_stick_layout" => Some(Enum(ZERO_TO_THREE)),
            "gamepad_button_layout" => Some(Enum(ZERO_TO_SIX)),
            "laserSightColor" => Some(Integer(0, 16_777_215)),
            "reticle_color" => Some(RgbOrDefault),
            "gamepad_look_curve" => Some(Integer(0, 4)),
            "gamepad_trigger_threshold" => Some(Enum(TRIGGER_THRESHOLDS)),
            "cl_fovScale" => Some(Number(1.0, 1.7)),
            "cl_safearea" => Some(Number(0.0, 1.0)),
            "gameCursor_Velocity" => Some(Number(1300.0, 4300.0)),
            "miles_mix" => Some(Enum(BOOL)),
            "sound_volume_dialogue"
            | "sound_volume_music_game"
            | "sound_volume_music_lobby"
            | "sound_volume_sfx"
            | "sound_volume_sfx_observer"
            | "sprint_view_shake_style"
            | "ziprail_roll_strength" => Some(Number(0.0, 1.0)),
            "hud_setting_pingAlpha" => Some(NumberEnum(PING_ALPHA)),
            "voice_quiet_threshold" => Some(Number(0.0, 32767.0)),
            "net_netGraph2" => Some(Enum(BOOL)),
            "gamepad_aim_speed" => Some(Integer(0, 7)),
            "gamepad_aim_speed_ads_0"
            | "gamepad_aim_speed_ads_1"
            | "gamepad_aim_speed_ads_2"
            | "gamepad_aim_speed_ads_3"
            | "gamepad_aim_speed_ads_4"
            | "gamepad_aim_speed_ads_5"
            | "gamepad_aim_speed_ads_6"
            | "gamepad_aim_speed_ads_7" => Some(Integer(-1, 7)),
            "gamepad_custom_deadzone_in" => Some(Number(0.0, 0.5)),
            "gamepad_custom_deadzone_out" => Some(Number(0.01, 0.3)),
            "gamepad_custom_curve" => Some(Number(0.0, 30.0)),
            "gamepad_custom_hip_yaw"
            | "gamepad_custom_hip_pitch"
            | "gamepad_custom_ads_yaw"
            | "gamepad_custom_ads_pitch" => Some(Number(0.0, 500.0)),
            "gamepad_custom_hip_turn_yaw"
            | "gamepad_custom_hip_turn_pitch"
            | "gamepad_custom_ads_turn_yaw"
            | "gamepad_custom_ads_turn_pitch" => Some(Number(0.0, 250.0)),
            "gamepad_custom_hip_turn_time"
            | "gamepad_custom_hip_turn_delay"
            | "gamepad_custom_ads_turn_time"
            | "gamepad_custom_ads_turn_delay" => Some(Number(0.0, 1.0)),
            _ if indexed_suffix(key, "gamepad_ads_advanced_sensitivity_scalar_", 7) => {
                Some(Number(0.2, 10.0))
            }
            _ => None,
        },
    }
}

fn validate_value(file: ConfigFile, key: &str, value: &str) -> Result<(), String> {
    let rule = rule_for(file, key)
        .ok_or_else(|| format!("apex.gameSettings.errors.keyNotEditable: {key}"))?;
    if value.contains(['\r', '\n', '"', '\0']) {
        return Err(format!("apex.gameSettings.errors.invalidValue: {key}"));
    }
    let valid = match rule {
        ValueRule::Bool => BOOL.contains(&value),
        ValueRule::Integer(min, max) => value
            .parse::<i64>()
            .is_ok_and(|number| number >= min && number <= max),
        ValueRule::Number(min, max) => value
            .parse::<f64>()
            .is_ok_and(|number| number.is_finite() && number >= min && number <= max),
        ValueRule::NumberEnum(values) => value
            .parse::<f64>()
            .is_ok_and(|number| number.is_finite() && values.contains(&number)),
        ValueRule::Enum(values) => values.contains(&value),
        ValueRule::RgbOrDefault => {
            value.is_empty()
                || (value.split_ascii_whitespace().count() == 3
                    && value
                        .split_ascii_whitespace()
                        .all(|channel| channel.parse::<u8>().is_ok()))
        }
    };
    if valid {
        Ok(())
    } else {
        Err(format!(
            "apex.gameSettings.errors.invalidValue: {key}={value}"
        ))
    }
}

fn revision(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn backup_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_default();
    path.with_file_name(format!("{name}.mxtools.bak"))
}

fn load_file(file: ConfigFile) -> Result<LoadedFile, String> {
    let path = get_apex_config_path(file.kind())?;
    let bytes = fs::read(&path).map_err(|error| {
        format!(
            "apex.gameSettings.errors.readFailed: {}: {error}",
            path.display()
        )
    })?;
    let hash = revision(&bytes);
    let (content, encoding) = decode_bytes(&bytes)?;
    let doc = ApexCfgDocument::from_content(&content, encoding)?;
    Ok(LoadedFile {
        path,
        bytes,
        revision: hash,
        doc,
    })
}

fn report_for(file: ConfigFile, loaded: &LoadedFile) -> ApexSettingsFileReport {
    let values: HashMap<String, String> = loaded.doc.key_values().into_iter().collect();
    let mut unknown_keys: Vec<String> = values
        .keys()
        .filter(|key| rule_for(file, key).is_none())
        .cloned()
        .collect();
    unknown_keys.sort();
    ApexSettingsFileReport {
        path: loaded.path.to_string_lossy().into_owned(),
        revision: loaded.revision.clone(),
        values,
        unknown_keys,
        backup_available: backup_path(&loaded.path).is_file(),
    }
}

fn parse_binding(line: &str) -> Option<ParsedBinding> {
    let trimmed = line.trim();
    let split = trimmed.find(char::is_whitespace)?;
    let kind = &trimmed[..split];
    if kind != "bind_US_standard" && kind != "bind_held_US_standard" {
        return None;
    }
    let rest = trimmed[split..].trim_start();
    let mut quoted = Vec::new();
    let mut cursor = 0;
    while let Some(start) = rest[cursor..].find('"') {
        let start = cursor + start + 1;
        let end = start + rest[start..].find('"')?;
        quoted.push(rest[start..end].to_string());
        cursor = end + 1;
        if quoted.len() == 2 {
            let context = rest[cursor..].trim().parse::<i32>().ok()?;
            return Some(ParsedBinding {
                kind: kind.to_string(),
                input: quoted[0].clone(),
                command: quoted[1].clone(),
                context,
            });
        }
    }
    None
}

fn editable_binding(command: &str, input: &str) -> bool {
    if input.contains("BUTTON") || input.contains("STICK") || input.contains("TRIGGER") {
        return false;
    }
    matches!(
        command,
        "weaponSelectPrimary0"
            | "weaponSelectPrimary1"
            | "weaponSelectPrimary2"
            | "+scriptCommand4"
            | "use_consumable HEALTH_SMALL"
            | "use_consumable HEALTH_LARGE"
            | "use_consumable SHIELD_SMALL"
            | "use_consumable SHIELD_LARGE"
            | "use_consumable PHOENIX_KIT"
            | "+moveleft"
            | "+scriptCommand3"
            | "+scriptcommand3"
            | "+toggle_duck"
            | "+moveright"
            | "+use; +use_long"
            | "ping_specific_type ENEMY"
            | "weaponSelectOrdnance"
            | "+scriptCommand5"
            | "toggle_inventory"
            | "toggle_map"
            | "weapon_inspect"
            | "+offhand1"
            | "+reload"
            | "+backward"
            | "+pushtotalk"
            | "+melee"
            | "+forward"
            | "+use_alt"
            | "+offhand4"
            | "say_team"
            | "+jump"
            | "+speed"
            | "+scriptCommand6"
            | "+duck"
            | "chat_wheel"
            | "+scriptCommand7"
            | "+attack"
            | "+zoom"
            | "+toggle_zoom"
            | "+weaponCycle"
            | "+weaponcycle"
            | "+dodge"
            | "+ping"
            | "jpeg"
            | "ping_specific_type ATTACK"
            | "ping_specific_type REGROUP"
            | "ping_specific_type ENEMY_AUDIO"
            | "ping_specific_type AVOID"
            | "ping_specific_type AREA_VISITED"
            | "ping_specific_type WATCHING"
            | "ping_specific_type GOING"
            | "ping_specific_type LOOTING"
            | "ping_specific_type DEFENDING"
            | "screenshotDevNet"
            | "screenshotDevNet_noRPROF"
            | "in_spec_mode"
            | "in_spec_altitude_lock"
            | "in_spec_teamplayer1"
            | "in_spec_teamplayer2"
            | "in_spec_teamplayer3"
            | "in_spec_next"
            | "in_spec_prev"
            | "in_spec_next_team"
            | "in_spec_prev_team"
            | "in_spec_closest_player"
            | "in_spec_closest_enemy"
            | "in_spec_kill_leader"
            | "in_spec_last_attacker"
            | "in_spec_insert_annotation"
            | "in_spec_toggle_smoothcam"
            | "in_spec_toggle_map_teamnames"
            | "in_spec_toggle_obituary"
            | "in_spec_chasecam_zoom_out"
            | "in_spec_chasecam_zoom_in"
            | "in_spec_toggle_ui"
            | "in_spec_toggle_freecam"
            | "in_spec_toggle_chasecam_lock"
            | "toggle_obs_player_tags"
            | "toggle_obs_highlight"
            | "toggleconsole"
            | "ingamemenu_activate"
            | "miles_insert_bug_marker"
            | "toggle_obs_ring_survey"
            | "roamingcam_togglerollmode"
            | "+spectatorRollClockwise"
            | "+spectatorRollCounterClockwise"
    )
}

fn binding_groups(doc: &ApexCfgDocument) -> Vec<BindingGroup> {
    let mut groups: Vec<BindingGroup> = Vec::new();
    let mut occurrence_by_signature: HashMap<String, u32> = HashMap::new();
    for (index, line) in doc.lines.iter().enumerate() {
        let ApexCfgLine::Raw(raw) = line else {
            continue;
        };
        let Some(parsed) = parse_binding(raw) else {
            continue;
        };
        if parsed.kind == "bind_held_US_standard" {
            if let Some(previous) = groups.last_mut() {
                if previous.public.input == parsed.input
                    && previous
                        .line_indices
                        .last()
                        .is_some_and(|line| *line + 1 == index)
                {
                    previous.public.held_command = Some(parsed.command);
                    previous.line_indices.push(index);
                }
            }
            continue;
        }
        let signature = format!("{}\u{1f}{}", parsed.command, parsed.context);
        let occurrence = occurrence_by_signature.entry(signature).or_default();
        let current_occurrence = *occurrence;
        *occurrence += 1;
        groups.push(BindingGroup {
            public: ApexBinding {
                id: format!("binding:{index}"),
                input: parsed.input.clone(),
                command: parsed.command.clone(),
                context: parsed.context,
                held_command: None,
                editable: editable_binding(&parsed.command, &parsed.input),
                occurrence: current_occurrence,
            },
            line_indices: vec![index],
        });
    }
    groups
}

fn valid_binding_input(input: &str) -> bool {
    if input.len() == 1 {
        return input.chars().all(|character| {
            character.is_ascii_alphanumeric() || "`-=[]\\;',./".contains(character)
        });
    }
    matches!(
        input,
        "SPACE"
            | "TAB"
            | "ENTER"
            | "ESCAPE"
            | "BACKSPACE"
            | "CAPSLOCK"
            | "LSHIFT"
            | "RSHIFT"
            | "LCTRL"
            | "RCTRL"
            | "LALT"
            | "RALT"
            | "UPARROW"
            | "DOWNARROW"
            | "LEFTARROW"
            | "RIGHTARROW"
            | "INS"
            | "DEL"
            | "HOME"
            | "END"
            | "PGUP"
            | "PGDN"
            | "MWHEELUP"
            | "MWHEELDOWN"
            | "MOUSE1"
            | "MOUSE2"
            | "MOUSE3"
            | "MOUSE4"
            | "MOUSE5"
            | "KP_END"
            | "KP_DOWNARROW"
            | "KP_PGDN"
            | "KP_LEFTARROW"
            | "KP_5"
            | "KP_RIGHTARROW"
            | "KP_HOME"
            | "KP_UPARROW"
            | "KP_PGUP"
            | "KP_SLASH"
            | "KP_MULTIPLY"
            | "KP_MINUS"
            | "KP_PLUS"
            | "KP_DEL"
            | "KP_INS"
            | "KP_ENTER"
            | "NUMLOCK"
            | "SCROLLLOCK"
            | "F1"
            | "F2"
            | "F3"
            | "F4"
            | "F5"
            | "F6"
            | "F7"
            | "F8"
            | "F9"
            | "F10"
            | "F11"
            | "F12"
    )
}

fn normalize_binding_input(input: &str) -> String {
    if input.len() == 1 {
        input.to_ascii_lowercase()
    } else {
        input.to_ascii_uppercase()
    }
}

fn replace_binding_input(line: &str, input: &str) -> Result<String, String> {
    let first = line
        .find('"')
        .ok_or_else(|| "apex.gameSettings.errors.bindingMalformed".to_string())?;
    let second = first
        + 1
        + line[first + 1..]
            .find('"')
            .ok_or_else(|| "apex.gameSettings.errors.bindingMalformed".to_string())?;
    Ok(format!(
        "{}{}{}",
        &line[..first + 1],
        input,
        &line[second..]
    ))
}

fn replace_binding_context(line: &str, context: i32) -> Result<String, String> {
    let last_quote = line
        .rfind('"')
        .ok_or_else(|| "apex.gameSettings.errors.bindingMalformed".to_string())?;
    let suffix = &line[last_quote + 1..];
    let leading_len = suffix.len() - suffix.trim_start().len();
    let trailing_len = suffix.len() - suffix.trim_end().len();
    if suffix.trim().parse::<i32>().is_err() {
        return Err("apex.gameSettings.errors.bindingMalformed".to_string());
    }
    let leading = &suffix[..leading_len];
    let trailing = if trailing_len == 0 {
        ""
    } else {
        &suffix[suffix.len() - trailing_len..]
    };
    Ok(format!(
        "{}{}{}{}",
        &line[..last_quote + 1],
        leading,
        context,
        trailing
    ))
}

fn binding_action_key(binding: &ApexBinding) -> String {
    format!(
        "{}\u{1f}{}",
        binding.command.to_ascii_lowercase(),
        binding
            .held_command
            .as_deref()
            .unwrap_or_default()
            .to_ascii_lowercase()
    )
}

fn apply_value_updates(
    file: ConfigFile,
    doc: &mut ApexCfgDocument,
    updates: &HashMap<String, String>,
) -> Result<(), String> {
    for (key, value) in updates {
        validate_value(file, key, value)?;
        if !doc.path_exists(key) {
            return Err(format!("apex.gameSettings.errors.keyMissing: {key}"));
        }
        doc.set(key, value.clone())?;
    }
    if file == ConfigFile::Profile && updates.contains_key("toggle_on_jump_to_deactivate") {
        const CHANGED_KEY: &str = "toggle_on_jump_to_deactivate_changed";
        if !doc.path_exists(CHANGED_KEY) {
            return Err(format!(
                "apex.gameSettings.errors.keyMissing: {CHANGED_KEY}"
            ));
        }
        doc.set(CHANGED_KEY, "1".to_string())?;
    }
    Ok(())
}

fn apply_binding_mutations(
    doc: &mut ApexCfgDocument,
    mutations: &[ApexBindingMutation],
) -> Result<(), String> {
    if mutations.is_empty() {
        return Ok(());
    }
    let groups = binding_groups(doc);
    let by_id: HashMap<&str, &BindingGroup> = groups
        .iter()
        .map(|group| (group.public.id.as_str(), group))
        .collect();
    let mut updates: HashMap<String, String> = HashMap::new();
    let mut deletions: HashSet<String> = HashSet::new();
    let mut creations: Vec<(&BindingGroup, String, i32)> = Vec::new();
    let mut mutated_ids: HashSet<String> = HashSet::new();

    for mutation in mutations {
        match mutation {
            ApexBindingMutation::Update { id, input } => {
                let group = by_id
                    .get(id.as_str())
                    .ok_or_else(|| format!("apex.gameSettings.errors.bindingMissing: {id}"))?;
                if !group.public.editable {
                    return Err(format!("apex.gameSettings.errors.bindingNotEditable: {id}"));
                }
                if !mutated_ids.insert(id.clone()) {
                    return Err(format!(
                        "apex.gameSettings.errors.duplicateBindingMutation: {id}"
                    ));
                }
                let normalized = normalize_binding_input(input);
                if !valid_binding_input(&normalized) {
                    return Err(format!(
                        "apex.gameSettings.errors.invalidBinding: {normalized}"
                    ));
                }
                updates.insert(id.clone(), normalized);
            }
            ApexBindingMutation::Delete { id } => {
                let group = by_id
                    .get(id.as_str())
                    .ok_or_else(|| format!("apex.gameSettings.errors.bindingMissing: {id}"))?;
                if !group.public.editable {
                    return Err(format!("apex.gameSettings.errors.bindingNotEditable: {id}"));
                }
                if !mutated_ids.insert(id.clone()) {
                    return Err(format!(
                        "apex.gameSettings.errors.duplicateBindingMutation: {id}"
                    ));
                }
                deletions.insert(id.clone());
            }
            ApexBindingMutation::Create {
                template_id,
                input,
                context,
            } => {
                let template = by_id.get(template_id.as_str()).ok_or_else(|| {
                    format!("apex.gameSettings.errors.bindingMissing: {template_id}")
                })?;
                if !template.public.editable {
                    return Err(format!(
                        "apex.gameSettings.errors.bindingNotEditable: {template_id}"
                    ));
                }
                if !matches!(*context, 0 | 1) {
                    return Err(format!(
                        "apex.gameSettings.errors.invalidBindingContext: {context}"
                    ));
                }
                let normalized = normalize_binding_input(input);
                if !valid_binding_input(&normalized) {
                    return Err(format!(
                        "apex.gameSettings.errors.invalidBinding: {normalized}"
                    ));
                }
                creations.push((template, normalized, *context));
            }
        }
    }
    let mut final_bindings: Vec<ApexBinding> = groups
        .iter()
        .filter(|group| !deletions.contains(&group.public.id))
        .map(|group| {
            let mut binding = group.public.clone();
            if let Some(input) = updates.get(&binding.id) {
                binding.input = input.clone();
            }
            binding
        })
        .collect();
    for (index, (template, input, context)) in creations.iter().enumerate() {
        let mut binding = template.public.clone();
        binding.id = format!("binding:new:{index}");
        binding.input = input.clone();
        binding.context = *context;
        final_bindings.push(binding);
    }

    let mut final_inputs: HashMap<String, String> = HashMap::new();
    let mut action_counts: HashMap<String, usize> = HashMap::new();
    let mut action_contexts: HashMap<String, HashSet<i32>> = HashMap::new();
    let mut has_duplicate_context = false;
    for binding in &final_bindings {
        if let Some(existing) =
            final_inputs.insert(binding.input.to_ascii_uppercase(), binding.id.clone())
        {
            if existing != binding.id {
                return Err(format!(
                    "apex.gameSettings.errors.bindingConflict: {}",
                    binding.input
                ));
            }
        }
        if binding.editable {
            if !matches!(binding.context, 0 | 1) {
                return Err(format!(
                    "apex.gameSettings.errors.invalidBindingContext: {}",
                    binding.context
                ));
            }
            let action_key = binding_action_key(binding);
            *action_counts.entry(action_key.clone()).or_default() += 1;
            if !action_contexts
                .entry(action_key)
                .or_default()
                .insert(binding.context)
            {
                has_duplicate_context = true;
            }
        }
    }
    if action_counts.values().any(|count| *count > 2) {
        return Err("apex.gameSettings.errors.bindingSlotLimit".to_string());
    }
    if has_duplicate_context {
        return Err("apex.gameSettings.errors.duplicateBindingContext".to_string());
    }

    let mut group_id_by_line: HashMap<usize, &str> = HashMap::new();
    for group in &groups {
        for index in &group.line_indices {
            group_id_by_line.insert(*index, group.public.id.as_str());
        }
    }
    let mut create_after: HashMap<usize, Vec<Vec<ApexCfgLine>>> = HashMap::new();
    for (template, input, context) in creations {
        let mut lines = Vec::with_capacity(template.line_indices.len());
        for index in &template.line_indices {
            let ApexCfgLine::Raw(raw) = &doc.lines[*index] else {
                return Err("apex.gameSettings.errors.bindingMalformed".to_string());
            };
            let replaced = replace_binding_input(raw, &input)?;
            lines.push(ApexCfgLine::Raw(replace_binding_context(
                &replaced, context,
            )?));
        }
        let after = *template
            .line_indices
            .last()
            .ok_or_else(|| "apex.gameSettings.errors.bindingMalformed".to_string())?;
        create_after.entry(after).or_default().push(lines);
    }

    let mut next_lines = Vec::with_capacity(doc.lines.len() + mutations.len() * 2);
    for (index, line) in doc.lines.iter().enumerate() {
        let group_id = group_id_by_line.get(&index).copied();
        if !group_id.is_some_and(|id| deletions.contains(id)) {
            if let Some(input) = group_id.and_then(|id| updates.get(id)) {
                let ApexCfgLine::Raw(raw) = line else {
                    return Err("apex.gameSettings.errors.bindingMalformed".to_string());
                };
                next_lines.push(ApexCfgLine::Raw(replace_binding_input(raw, input)?));
            } else {
                next_lines.push(line.clone());
            }
        }
        if let Some(groups) = create_after.remove(&index) {
            for created in groups {
                next_lines.extend(created);
            }
        }
    }
    doc.lines = next_lines;
    Ok(())
}

fn encode_doc(doc: &ApexCfgDocument) -> Vec<u8> {
    doc.encoding.encode(&doc.to_string())
}

fn unique_temp_path(path: &Path) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy())
        .unwrap_or_default();
    path.with_file_name(format!(
        ".{name}.mxtools.{}.{}.tmp",
        std::process::id(),
        stamp
    ))
}

fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|error| {
            format!(
                "apex.gameSettings.errors.writeFailed: {}: {error}",
                path.display()
            )
        })?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| {
            format!(
                "apex.gameSettings.errors.writeFailed: {}: {error}",
                path.display()
            )
        })
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(format!(
            "apex.gameSettings.errors.writeFailed: win32={}",
            unsafe { GetLastError() }
        ))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(source, destination)
        .map_err(|error| format!("apex.gameSettings.errors.writeFailed: {error}"))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if path.is_file()
        && fs::metadata(path)
            .map(|metadata| metadata.permissions().readonly())
            .unwrap_or(false)
    {
        return Err(format!(
            "apex.gameSettings.errors.readOnly: {}",
            path.display()
        ));
    }
    let temp = unique_temp_path(path);
    if let Err(error) = write_synced(&temp, bytes) {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    let result = replace_file(&temp, path);
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn save_backup(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let backup = backup_path(path);
    let temp = unique_temp_path(&backup);
    if let Err(error) = write_synced(&temp, bytes) {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    let result = replace_file(&temp, &backup);
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn ensure_revision(path: &Path, expected: &str) -> Result<(), String> {
    let bytes =
        fs::read(path).map_err(|error| format!("apex.gameSettings.errors.readFailed: {error}"))?;
    if revision(&bytes) == expected {
        Ok(())
    } else {
        Err(format!(
            "apex.gameSettings.errors.fileChanged: {}",
            path.display()
        ))
    }
}

fn verify_updates(
    file: ConfigFile,
    path: &Path,
    values: &HashMap<String, String>,
) -> Result<(), String> {
    let bytes = fs::read(path)
        .map_err(|error| format!("apex.gameSettings.errors.verifyFailed: {error}"))?;
    let (content, encoding) = decode_bytes(&bytes)?;
    let doc = ApexCfgDocument::from_content(&content, encoding)?;
    for (key, expected) in values {
        if doc.get(key) != Some(expected.as_str()) {
            return Err(format!("apex.gameSettings.errors.verifyFailed: {key}"));
        }
        validate_value(file, key, expected)?;
    }
    Ok(())
}

fn verify_file_bytes(path: &Path, expected: &[u8]) -> Result<(), String> {
    let actual = fs::read(path)
        .map_err(|error| format!("apex.gameSettings.errors.verifyFailed: {error}"))?;
    if actual == expected {
        Ok(())
    } else {
        Err(format!(
            "apex.gameSettings.errors.verifyFailed: {}",
            path.display()
        ))
    }
}

fn restore_bytes_verified(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let restore_error = atomic_write(path, bytes).err();
    match verify_file_bytes(path, bytes) {
        Ok(()) => Ok(()),
        Err(verify_error) => Err(match restore_error {
            Some(error) => format!("{error}; {verify_error}"),
            None => verify_error,
        }),
    }
}

fn collect_rollback_error(errors: &mut Vec<String>, label: &str, result: Result<(), String>) {
    if let Err(error) = result {
        errors.push(format!("{label}: {error}"));
    }
}

fn rollback_loaded_files(
    settings: Option<(&Path, &[u8])>,
    profile: Option<(&Path, &[u8])>,
) -> Result<(), String> {
    let mut errors = Vec::new();
    if let Some((path, bytes)) = settings {
        collect_rollback_error(&mut errors, "settings", restore_bytes_verified(path, bytes));
    }
    if let Some((path, bytes)) = profile {
        collect_rollback_error(&mut errors, "profile", restore_bytes_verified(path, bytes));
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

fn with_rollback_failure(error: String, rollback_error: Option<String>) -> String {
    match rollback_error {
        Some(rollback_error) => {
            format!("{error}; apex.history.errors.rollbackFailed: {rollback_error}")
        }
        None => error,
    }
}

struct RestoreRequestFailure {
    message: String,
    rollback_succeeded: bool,
}

impl From<String> for RestoreRequestFailure {
    fn from(message: String) -> Self {
        Self {
            message,
            rollback_succeeded: true,
        }
    }
}

pub(crate) fn load_report() -> Result<ApexGameSettingsReport, String> {
    let settings = load_file(ConfigFile::Settings)?;
    let profile = load_file(ConfigFile::Profile)?;
    let bindings = binding_groups(&settings.doc)
        .into_iter()
        .map(|group| group.public)
        .collect();
    Ok(ApexGameSettingsReport {
        settings: report_for(ConfigFile::Settings, &settings),
        profile: report_for(ConfigFile::Profile, &profile),
        bindings,
    })
}

fn apply_request_inner(
    app: Option<&tauri::AppHandle>,
    request: ApexGameSettingsApplyRequest,
) -> Result<ApexGameSettingsReport, String> {
    if request.settings_updates.is_empty()
        && request.profile_updates.is_empty()
        && request.binding_mutations.is_empty()
    {
        return Err("apex.gameSettings.errors.noChanges".to_string());
    }
    if apex_is_running_by_tasklist()? {
        return Err("apex.gameSettings.errors.apexRunning".to_string());
    }

    let mut settings = load_file(ConfigFile::Settings)?;
    let mut profile = load_file(ConfigFile::Profile)?;
    if settings.revision != request.settings_revision
        || profile.revision != request.profile_revision
    {
        return Err("apex.gameSettings.errors.fileChanged".to_string());
    }
    apply_value_updates(
        ConfigFile::Settings,
        &mut settings.doc,
        &request.settings_updates,
    )?;
    apply_value_updates(
        ConfigFile::Profile,
        &mut profile.doc,
        &request.profile_updates,
    )?;
    apply_binding_mutations(&mut settings.doc, &request.binding_mutations)?;

    let settings_changed =
        !request.settings_updates.is_empty() || !request.binding_mutations.is_empty();
    let profile_changed = !request.profile_updates.is_empty();
    let settings_new = encode_doc(&settings.doc);
    let profile_new = encode_doc(&profile.doc);

    ensure_revision(&settings.path, &request.settings_revision)?;
    ensure_revision(&profile.path, &request.profile_revision)?;
    if let Some(app) = app {
        prepare_legacy_game_settings_import_locked(app)?;
    }
    if settings_changed {
        save_backup(&settings.path, &settings.bytes)?;
    }
    if profile_changed {
        save_backup(&profile.path, &profile.bytes)?;
    }
    let history_record = app
        .map(|app| {
            record_game_settings_before_locked(
                app,
                request.history_source,
                request.transaction_id.as_deref(),
            )
        })
        .transpose()?;

    let commit = (|| -> Result<(), String> {
        if settings_changed {
            atomic_write(&settings.path, &settings_new)?;
        }
        if profile_changed {
            atomic_write(&profile.path, &profile_new)?;
        }
        verify_updates(
            ConfigFile::Settings,
            &settings.path,
            &request.settings_updates,
        )?;
        verify_updates(ConfigFile::Profile, &profile.path, &request.profile_updates)?;
        if settings_changed {
            verify_file_bytes(&settings.path, &settings_new)?;
        }
        if profile_changed {
            verify_file_bytes(&profile.path, &profile_new)?;
        }
        Ok(())
    })();
    if let Err(error) = commit {
        let rollback = rollback_loaded_files(
            settings_changed.then_some((settings.path.as_path(), settings.bytes.as_slice())),
            profile_changed.then_some((profile.path.as_path(), profile.bytes.as_slice())),
        );
        if rollback.is_ok() {
            if let (Some(app), Some(history_record)) = (app, history_record.as_ref()) {
                if history_record.scope_added {
                    let _ = discard_scope_locked_for_app(
                        app,
                        &history_record.entry.id,
                        ApexConfigScope::GameSettings,
                    );
                }
            }
        }
        return Err(with_rollback_failure(error, rollback.err()));
    }
    if let Some(app) = app {
        let _ = prune_history_locked(app);
    }
    load_report()
}

pub(crate) fn apply_request_without_history(
    request: ApexGameSettingsApplyRequest,
) -> Result<ApexGameSettingsReport, String> {
    apply_request_inner(None, request)
}

fn restore_request(
    request: ApexGameSettingsRestoreRequest,
) -> Result<ApexGameSettingsReport, RestoreRequestFailure> {
    if apex_is_running_by_tasklist()? {
        return Err("apex.gameSettings.errors.apexRunning".to_string().into());
    }
    if !request.restore_settings && !request.restore_profile {
        return Err("apex.gameSettings.errors.noRestoreSelection"
            .to_string()
            .into());
    }
    let settings = load_file(ConfigFile::Settings)?;
    let profile = load_file(ConfigFile::Profile)?;
    if settings.revision != request.settings_revision
        || profile.revision != request.profile_revision
    {
        return Err("apex.gameSettings.errors.fileChanged".to_string().into());
    }
    let settings_backup = request
        .restore_settings
        .then(|| fs::read(backup_path(&settings.path)))
        .transpose()
        .map_err(|error| format!("apex.gameSettings.errors.backupMissing: {error}"))?;
    let profile_backup = request
        .restore_profile
        .then(|| fs::read(backup_path(&profile.path)))
        .transpose()
        .map_err(|error| format!("apex.gameSettings.errors.backupMissing: {error}"))?;
    for bytes in settings_backup.iter().chain(profile_backup.iter()) {
        let (content, encoding) = decode_bytes(bytes)?;
        ApexCfgDocument::from_content(&content, encoding)?;
    }
    ensure_revision(&settings.path, &request.settings_revision)?;
    ensure_revision(&profile.path, &request.profile_revision)?;

    let commit = (|| -> Result<ApexGameSettingsReport, String> {
        if let Some(bytes) = settings_backup.as_ref() {
            atomic_write(&settings.path, bytes)?;
        }
        if let Some(bytes) = profile_backup.as_ref() {
            atomic_write(&profile.path, bytes)?;
        }
        if let Some(bytes) = settings_backup.as_ref() {
            verify_file_bytes(&settings.path, bytes)?;
        }
        if let Some(bytes) = profile_backup.as_ref() {
            verify_file_bytes(&profile.path, bytes)?;
        }
        load_report()
    })();
    match commit {
        Ok(report) => Ok(report),
        Err(error) => {
            // Restore every selected file so a failed replacement or readback cannot
            // leave settings.cfg and profile.cfg from different snapshots.
            let rollback = rollback_loaded_files(
                request
                    .restore_settings
                    .then_some((settings.path.as_path(), settings.bytes.as_slice())),
                request
                    .restore_profile
                    .then_some((profile.path.as_path(), profile.bytes.as_slice())),
            );
            let rollback_succeeded = rollback.is_ok();
            Err(RestoreRequestFailure {
                message: with_rollback_failure(error, rollback.err()),
                rollback_succeeded,
            })
        }
    }
}

#[tauri::command]
pub async fn get_apex_game_settings() -> IpcResult<ApexGameSettingsReport> {
    blocking_cmd(load_report).await.map_err(apex_settings_error)
}

#[tauri::command]
pub async fn apply_apex_game_settings(
    app: tauri::AppHandle,
    request: ApexGameSettingsApplyRequest,
) -> IpcResult<ApexGameSettingsReport> {
    blocking_cmd(move || {
        let _guard = lock_history()?;
        apply_request_inner(Some(&app), request)
    })
    .await
    .map_err(apex_settings_error)
}

#[tauri::command]
pub async fn restore_apex_game_settings(
    app: tauri::AppHandle,
    request: ApexGameSettingsRestoreRequest,
) -> IpcResult<ApexGameSettingsReport> {
    blocking_cmd(move || {
        let _guard = lock_history()?;
        let history_record =
            record_game_settings_before_locked(&app, ApexHistorySource::HistoryRestore, None)?;
        match restore_request(request) {
            Ok(report) => {
                let _ = prune_history_locked(&app);
                Ok(report)
            }
            Err(error) => {
                if error.rollback_succeeded && history_record.scope_added {
                    let _ = discard_scope_locked_for_app(
                        &app,
                        &history_record.entry.id,
                        ApexConfigScope::GameSettings,
                    );
                }
                Err(error.message)
            }
        }
    })
    .await
    .map_err(apex_settings_error)
}

fn apex_settings_error(message: String) -> IpcError {
    let code = match message
        .split_once(':')
        .map(|(head, _)| head)
        .unwrap_or(message.as_str())
    {
        "apex.gameSettings.errors.fileChanged" => "apex.file_changed",
        "apex.gameSettings.errors.invalidValue" => "apex.invalid_value",
        "apex.gameSettings.errors.invalidBinding" | "apex.gameSettings.errors.bindingMalformed" => {
            "apex.invalid_binding"
        }
        "apex.gameSettings.errors.keyMissing" => "apex.key_missing",
        "apex.gameSettings.errors.verifyFailed" => "apex.verification_failed",
        "apex.gameSettings.errors.apexRunning" => "apex.running",
        "apex.gameSettings.errors.noChanges" => "apex.no_changes",
        "apex.gameSettings.errors.noRestoreSelection" => "apex.no_restore_selection",
        _ => return IpcError::operation_failed("apex", message),
    };
    IpcError::new(code, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_tool::game::apex::config::ApexFileEncoding;

    fn sample() -> ApexCfgDocument {
        ApexCfgDocument::from_content(
            "bind_US_standard \"w\" \"+forward\" 0\r\n\
             bind_US_standard \"4\" \"+scriptCommand4\" 0\r\n\
             bind_held_US_standard \"4\" \"+scriptCommand2\" 0\r\n\
             mouse_sensitivity \"1.0\"\r\n\
             unknown_key \"keep me\"\r\n",
            ApexFileEncoding::Utf8,
        )
        .unwrap()
    }

    #[test]
    fn groups_held_binding_and_preserves_unknown_lines() {
        let doc = sample();
        let groups = binding_groups(&doc);
        assert_eq!(groups.len(), 2);
        assert_eq!(
            groups[1].public.held_command.as_deref(),
            Some("+scriptCommand2")
        );
        assert!(doc.to_string().contains("unknown_key \"keep me\""));
        assert!(doc.uses_crlf);
    }

    #[test]
    fn rejects_conflicting_binding() {
        let mut doc = sample();
        let error = apply_binding_mutations(
            &mut doc,
            &[ApexBindingMutation::Update {
                id: "binding:0".into(),
                input: "4".into(),
            }],
        )
        .unwrap_err();
        assert!(error.contains("bindingConflict"));
    }

    #[test]
    fn updates_tap_and_held_lines_together() {
        let mut doc = sample();
        apply_binding_mutations(
            &mut doc,
            &[ApexBindingMutation::Update {
                id: "binding:1".into(),
                input: "q".into(),
            }],
        )
        .unwrap();
        let output = doc.to_string();
        assert!(output.contains("bind_US_standard \"q\" \"+scriptCommand4\" 0"));
        assert!(output.contains("bind_held_US_standard \"q\" \"+scriptCommand2\" 0"));
    }

    #[test]
    fn validates_only_whitelisted_values() {
        assert!(validate_value(ConfigFile::Settings, "m_acceleration", "0").is_ok());
        assert!(validate_value(ConfigFile::Settings, "m_acceleration", "2").is_err());
        assert!(validate_value(ConfigFile::Profile, "localClientPlayerCachedLevel", "1").is_err());
        assert!(validate_value(ConfigFile::Profile, "cl_fovScale", "1.7").is_ok());
        assert!(validate_value(ConfigFile::Profile, "cl_fovScale", "2.0").is_err());
        assert!(validate_value(ConfigFile::Profile, "laserSightColorCustomized", "1").is_ok());
        assert!(validate_value(ConfigFile::Profile, "reticle_color", "").is_ok());
        assert!(validate_value(ConfigFile::Profile, "reticle_color", "210 190 17").is_ok());
        assert!(validate_value(ConfigFile::Profile, "reticle_color", "256 190 17").is_err());
        assert!(validate_value(ConfigFile::Profile, "reticle_color", "210 190").is_err());
        assert!(validate_value(ConfigFile::Profile, "toggle_on_jump_to_deactivate", "1").is_ok());
        assert!(validate_value(ConfigFile::Profile, "cl_comms_filter", "-1").is_ok());
        assert!(validate_value(ConfigFile::Profile, "cl_comms_filter", "2").is_err());
        assert!(validate_value(ConfigFile::Profile, "gamepad_button_layout", "6").is_ok());
        assert!(validate_value(ConfigFile::Profile, "gamepad_button_layout", "7").is_err());
        assert!(validate_value(ConfigFile::Profile, "gamepad_aim_speed", "7").is_ok());
        assert!(validate_value(ConfigFile::Profile, "gamepad_aim_speed", "8").is_err());
        assert!(validate_value(ConfigFile::Profile, "gamepad_aim_speed_ads_0", "-1").is_ok());
        assert!(validate_value(ConfigFile::Profile, "gamepad_aim_speed_ads_0", "7").is_ok());
        assert!(validate_value(ConfigFile::Profile, "gamepad_aim_speed_ads_0", "8").is_err());
        assert!(validate_value(ConfigFile::Profile, "gamepad_aim_speed_ads_7", "-1").is_ok());
        assert!(validate_value(
            ConfigFile::Profile,
            "gamepad_use_per_scope_ads_settings",
            "1"
        )
        .is_ok());
        assert!(validate_value(ConfigFile::Profile, "gamepad_look_curve", "4").is_ok());
        assert!(validate_value(ConfigFile::Profile, "gamepad_look_curve", "5").is_err());
        assert!(validate_value(ConfigFile::Profile, "gamepad_trigger_threshold", "255").is_ok());
        assert!(validate_value(ConfigFile::Profile, "gamepad_trigger_threshold", "100").is_err());
        assert!(
            validate_value(ConfigFile::Profile, "voice_quiet_threshold", "1932.638062").is_ok()
        );
        assert!(
            validate_value(ConfigFile::Profile, "voice_quiet_threshold", "32767.000000").is_ok()
        );
        assert!(
            validate_value(ConfigFile::Profile, "voice_quiet_threshold", "32767.000001").is_err()
        );
        assert!(validate_value(ConfigFile::Settings, "VoiceChatMode", "0").is_ok());
        assert!(validate_value(ConfigFile::Settings, "VoiceChatMode", "1").is_ok());
        assert!(validate_value(ConfigFile::Settings, "VoiceChatMode", "2").is_ok());
        assert!(validate_value(ConfigFile::Settings, "VoiceChatMode", "3").is_err());
        assert!(validate_value(ConfigFile::Settings, "miles_channels", "0").is_ok());
        assert!(validate_value(ConfigFile::Settings, "miles_channels", "1").is_ok());
        assert!(validate_value(ConfigFile::Settings, "miles_channels", "2").is_ok());
        assert!(validate_value(ConfigFile::Settings, "miles_channels", "3").is_err());
        assert!(validate_value(ConfigFile::Profile, "gamepad_deadzone_index_move", "0").is_err());
        assert!(validate_value(ConfigFile::Profile, "gamepad_deadzone_index_move", "1").is_ok());
        assert!(validate_value(ConfigFile::Profile, "gamepad_deadzone_index_move", "2").is_ok());
        assert!(validate_value(ConfigFile::Profile, "net_netGraph2", "2").is_err());
        for (key, valid, invalid) in [
            ("damage_indicator_style_pilot", "2", "3"),
            ("hud_setting_damageIndicatorStyle", "2", "3"),
            ("hud_setting_damageTextStyle", "3", "4"),
            ("joy_rumble", "2", "3"),
            ("mantle_boost_input_setting", "3", "4"),
            ("mantle_boost_ui_setting", "3", "4"),
            ("player_setting_lowammo_setting", "2", "3"),
        ] {
            assert!(
                validate_value(ConfigFile::Profile, key, valid).is_ok(),
                "{key}={valid}"
            );
            assert!(
                validate_value(ConfigFile::Profile, key, invalid).is_err(),
                "{key}={invalid}"
            );
        }
        assert!(validate_value(ConfigFile::Profile, "ps5_trig_enable", "0").is_ok());
        assert!(validate_value(ConfigFile::Profile, "ps5_trig_enable", "1").is_ok());
        assert!(validate_value(ConfigFile::Profile, "ps5_trig_enable", "2").is_err());
        for value in ["0.5", "1.0", "0.500000", "1.000000"] {
            assert!(validate_value(ConfigFile::Profile, "hud_setting_pingAlpha", value).is_ok());
        }
        for value in ["0", "0.75", "1.1", "NaN"] {
            assert!(validate_value(ConfigFile::Profile, "hud_setting_pingAlpha", value).is_err());
        }
        assert!(validate_value(ConfigFile::Profile, "player_setting_tutorialization", "2").is_ok());
        assert!(validate_value(
            ConfigFile::Profile,
            "player_setting_arsenals_maphudidentifiers",
            "3"
        )
        .is_err());
        assert!(validate_value(ConfigFile::Profile, "pin_opt_in", "1").is_ok());
    }

    #[test]
    fn jetpack_control_marks_the_explicit_choice_as_changed() {
        let mut doc = ApexCfgDocument::from_content(
            "toggle_on_jump_to_deactivate \"0\"\ntoggle_on_jump_to_deactivate_changed \"0\"\n",
            ApexFileEncoding::Utf8,
        )
        .unwrap();
        apply_value_updates(
            ConfigFile::Profile,
            &mut doc,
            &HashMap::from([("toggle_on_jump_to_deactivate".into(), "1".into())]),
        )
        .unwrap();
        let output = doc.to_string();
        assert!(output.contains("toggle_on_jump_to_deactivate \"1\""));
        assert!(output.contains("toggle_on_jump_to_deactivate_changed \"1\""));
    }

    #[test]
    fn jetpack_control_rejects_a_missing_companion_marker() {
        let mut doc = ApexCfgDocument::from_content(
            "toggle_on_jump_to_deactivate \"0\"\n",
            ApexFileEncoding::Utf8,
        )
        .unwrap();
        let error = apply_value_updates(
            ConfigFile::Profile,
            &mut doc,
            &HashMap::from([("toggle_on_jump_to_deactivate".into(), "1".into())]),
        )
        .unwrap_err();
        assert!(error.contains("toggle_on_jump_to_deactivate_changed"));
    }

    #[test]
    fn runtime_verified_keyboard_commands_are_editable() {
        for command in [
            "+dodge",
            "+scriptCommand3",
            "+scriptcommand3",
            "+scriptCommand4",
            "+scriptCommand5",
            "+scriptCommand6",
            "+toggle_zoom",
            "+weaponCycle",
            "+weaponcycle",
            "ping_specific_type ATTACK",
            "in_spec_altitude_lock",
            "toggleconsole",
            "jpeg",
        ] {
            assert!(editable_binding(command, "F2"), "{command}");
        }
    }

    #[test]
    fn rejects_unknown_and_unsafe_inputs() {
        assert!(!valid_binding_input("A_BUTTON"));
        assert!(!valid_binding_input("w;quit"));
        assert!(valid_binding_input("MOUSE4"));
        assert!(valid_binding_input("KP_INS"));
        assert!(valid_binding_input("KP_ENTER"));
        assert!(valid_binding_input("NUMLOCK"));
        assert!(valid_binding_input("SCROLLLOCK"));
        assert!(valid_binding_input("w"));
    }

    #[test]
    fn creates_and_deletes_one_binding_slot_without_touching_the_other() {
        let mut doc = sample();
        apply_binding_mutations(
            &mut doc,
            &[ApexBindingMutation::Create {
                template_id: "binding:0".into(),
                input: "MWHEELUP".into(),
                context: 1,
            }],
        )
        .unwrap();
        let groups = binding_groups(&doc);
        let forward: Vec<_> = groups
            .iter()
            .filter(|group| group.public.command == "+forward")
            .collect();
        assert_eq!(forward.len(), 2);
        assert_eq!(forward[0].public.input, "w");
        assert_eq!(forward[1].public.input, "MWHEELUP");
        assert_eq!(forward[1].public.context, 1);

        let second_id = forward[1].public.id.clone();
        apply_binding_mutations(&mut doc, &[ApexBindingMutation::Delete { id: second_id }])
            .unwrap();
        let output = doc.to_string();
        assert!(output.contains("bind_US_standard \"w\" \"+forward\" 0"));
        assert!(!output.contains("MWHEELUP"));
    }

    #[test]
    fn preserves_held_pair_when_creating_and_deleting_a_slot() {
        let mut doc = sample();
        apply_binding_mutations(
            &mut doc,
            &[ApexBindingMutation::Create {
                template_id: "binding:1".into(),
                input: "q".into(),
                context: 1,
            }],
        )
        .unwrap();
        let output = doc.to_string();
        assert!(output.contains("bind_US_standard \"q\" \"+scriptCommand4\" 1"));
        assert!(output.contains("bind_held_US_standard \"q\" \"+scriptCommand2\" 1"));
    }

    #[test]
    fn can_delete_the_template_slot_while_creating_the_other_slot() {
        let mut doc = sample();
        apply_binding_mutations(
            &mut doc,
            &[
                ApexBindingMutation::Delete {
                    id: "binding:0".into(),
                },
                ApexBindingMutation::Create {
                    template_id: "binding:0".into(),
                    input: "MWHEELUP".into(),
                    context: 1,
                },
            ],
        )
        .unwrap();
        let output = doc.to_string();
        assert!(!output.contains("bind_US_standard \"w\" \"+forward\" 0"));
        assert!(output.contains("bind_US_standard \"MWHEELUP\" \"+forward\" 1"));
    }

    #[test]
    fn rejects_a_third_slot_for_the_same_action() {
        let mut doc = sample();
        apply_binding_mutations(
            &mut doc,
            &[ApexBindingMutation::Create {
                template_id: "binding:0".into(),
                input: "q".into(),
                context: 1,
            }],
        )
        .unwrap();
        let error = apply_binding_mutations(
            &mut doc,
            &[ApexBindingMutation::Create {
                template_id: "binding:0".into(),
                input: "e".into(),
                context: 1,
            }],
        )
        .unwrap_err();
        assert!(error.contains("bindingSlotLimit"));
    }

    #[test]
    fn rejects_duplicate_contexts_for_the_same_action() {
        let mut doc = sample();
        let error = apply_binding_mutations(
            &mut doc,
            &[ApexBindingMutation::Create {
                template_id: "binding:0".into(),
                input: "q".into(),
                context: 0,
            }],
        )
        .unwrap_err();
        assert!(error.contains("duplicateBindingContext"));
    }

    #[test]
    fn rejects_non_finite_and_injected_values() {
        assert!(validate_value(ConfigFile::Settings, "mouse_sensitivity", "NaN").is_err());
        assert!(validate_value(ConfigFile::Settings, "mouse_sensitivity", "1\n0").is_err());
        assert!(validate_value(ConfigFile::Settings, "mouse_sensitivity", "1\"0").is_err());
    }

    #[test]
    fn reads_current_apex_files_without_writing_when_available() {
        let Ok(settings_path) = get_apex_config_path(ApexConfigFileKind::Settings) else {
            return;
        };
        let Ok(profile_path) = get_apex_config_path(ApexConfigFileKind::Profile) else {
            return;
        };
        if !settings_path.is_file() || !profile_path.is_file() {
            return;
        }
        let report = load_report().expect("current Apex config files should be readable");
        assert!(!report.settings.values.is_empty());
        assert!(!report.profile.values.is_empty());
        assert!(!report.bindings.is_empty());
    }
}
