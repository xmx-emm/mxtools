use crate::ipc_error::{IpcError, IpcResult};
use crate::utils::blocking_cmd;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
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
    Enum(&'static [&'static str]),
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
#[serde(rename_all = "camelCase")]
pub struct ApexBindingUpdate {
    pub id: String,
    pub input: String,
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
    pub binding_updates: Vec<ApexBindingUpdate>,
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
const ZERO_TO_TWO: &[&str] = &["0", "1", "2"];
const ZERO_TO_THREE: &[&str] = &["0", "1", "2", "3"];
const MINUS_ONE_TO_EIGHT: &[&str] = &["-1", "0", "1", "2", "3", "4", "5", "6", "7", "8"];
const AUDIO_CHANNELS: &[&str] = &["0", "2", "4", "6", "8"];

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
            "miles_channels" | "sound_num_speakers" => Some(Enum(AUDIO_CHANNELS)),
            "sound_volume_voice" => Some(Number(0.0, 2.0)),
            "voice_mixer_volume" | "voice_scale" => Some(Number(0.0, 1.0)),
            "VoiceChatMode" => Some(Enum(ZERO_TO_TWO)),
            "ui_layout_mode" => Some(Enum(BOOL)),
            _ if indexed_suffix(key, "mouse_zoomed_sensitivity_scalar_", 7) => {
                Some(Number(0.1, 10.0))
            }
            _ => None,
        },
        ConfigFile::Profile => match key {
            "cl_deathhints_enabled"
            | "closecaption"
            | "CrossPlay_user_optin"
            | "fov_disableAbilityScaling"
            | "gamepad_aim_assist_ads_high_power_scopes"
            | "gamepad_aim_assist_ads_low_power_scopes"
            | "gamepad_aim_assist_hip_high_power_scopes"
            | "gamepad_aim_assist_hip_low_power_scopes"
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
            | "hud_setting_minimapRotate"
            | "hud_setting_pingDoubleTapEnemy"
            | "hud_setting_showButtonHints"
            | "hud_setting_showCallsigns"
            | "hud_setting_showEnemyHealthBar"
            | "hud_setting_showEnemyHighlight"
            | "hud_setting_showHopUpPopUp"
            | "hud_setting_showLevelUp"
            | "hud_setting_showMedals"
            | "hud_setting_showMeter"
            | "hud_setting_showObituary"
            | "hud_setting_showOffscreenPortrait"
            | "hud_setting_showTeamNamesOnMap"
            | "hud_setting_showTips"
            | "hud_setting_showWeaponFlyouts"
            | "hudchat_play_text_to_speech"
            | "joy_inverty"
            | "m_invert_pitch"
            | "party_color_enabled"
            | "player_setting_autosprint"
            | "player_setting_damage_closes_deathbox_menu"
            | "player_setting_holdtosprint"
            | "player_setting_stickysprintforward"
            | "player_use_prompt_enabled"
            | "sound_musicReduced"
            | "sound_without_focus"
            | "speechtotext_enabled"
            | "voice_enabled"
            | "weapon_setting_autocycle_on_empty" => Some(Bool),
            "cc_text_size"
            | "gamepad_deadzone_index_look"
            | "gamepad_deadzone_index_move"
            | "gamepad_use_type"
            | "hud_setting_chainHeal"
            | "hud_setting_streamerMode"
            | "hudchat_visibility"
            | "joy_rumble"
            | "player_setting_lowammo_setting"
            | "player_setting_gamestateawareness_callouts" => Some(Enum(ZERO_TO_TWO)),
            "colorblind_mode"
            | "damage_indicator_style_pilot"
            | "gamepad_button_layout"
            | "gamepad_stick_layout"
            | "hud_setting_damageIndicatorStyle"
            | "hud_setting_damageTextStyle"
            | "mantle_boost_ui_setting" => Some(Enum(ZERO_TO_THREE)),
            "gamepad_look_curve" => Some(Integer(0, 5)),
            "gamepad_custom_assist_style" => Some(Enum(BOOL)),
            "gamepad_trigger_threshold" => Some(Integer(0, 100)),
            "cl_fovScale" => Some(Number(1.0, 1.7)),
            "cl_safearea" | "hud_setting_pingAlpha" => Some(Number(0.0, 1.0)),
            "gameCursor_Velocity" => Some(Number(100.0, 5000.0)),
            "gamepad_custom_curve" => Some(Number(0.0, 30.0)),
            "gamepad_custom_deadzone_in"
            | "gamepad_custom_deadzone_out"
            | "gamepad_custom_ads_turn_delay"
            | "gamepad_custom_ads_turn_time"
            | "gamepad_custom_hip_turn_delay"
            | "gamepad_custom_hip_turn_time" => Some(Number(0.0, 1.0)),
            "gamepad_custom_ads_pitch"
            | "gamepad_custom_ads_turn_pitch"
            | "gamepad_custom_ads_turn_yaw"
            | "gamepad_custom_ads_yaw"
            | "gamepad_custom_hip_pitch"
            | "gamepad_custom_hip_turn_pitch"
            | "gamepad_custom_hip_turn_yaw"
            | "gamepad_custom_hip_yaw" => Some(Number(0.0, 500.0)),
            "sound_volume_dialogue"
            | "sound_volume_music_game"
            | "sound_volume_music_lobby"
            | "sound_volume_sfx"
            | "sound_volume_sfx_observer"
            | "sprint_view_shake_style"
            | "ziprail_roll_strength" => Some(Number(0.0, 1.0)),
            "voice_quiet_threshold" => Some(Integer(0, 4000)),
            "net_netGraph2" | "mantle_boost_input_setting" => Some(Enum(ZERO_TO_TWO)),
            _ if indexed_suffix(key, "gamepad_ads_advanced_sensitivity_scalar_", 7) => {
                Some(Number(0.1, 10.0))
            }
            _ if indexed_suffix(key, "gamepad_aim_speed_ads_", 7) => Some(Enum(MINUS_ONE_TO_EIGHT)),
            "gamepad_aim_speed" => Some(Integer(0, 8)),
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
        ValueRule::Enum(values) => values.contains(&value),
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
            | "+ping"
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
    Ok(())
}

fn apply_binding_updates(
    doc: &mut ApexCfgDocument,
    updates: &[ApexBindingUpdate],
) -> Result<(), String> {
    let groups = binding_groups(doc);
    let by_id: HashMap<&str, &BindingGroup> = groups
        .iter()
        .map(|group| (group.public.id.as_str(), group))
        .collect();
    let mut requested: HashMap<&str, String> = HashMap::new();
    for update in updates {
        let group = by_id
            .get(update.id.as_str())
            .ok_or_else(|| format!("apex.gameSettings.errors.bindingMissing: {}", update.id))?;
        if !group.public.editable {
            return Err(format!(
                "apex.gameSettings.errors.bindingNotEditable: {}",
                update.id
            ));
        }
        let normalized = normalize_binding_input(&update.input);
        if !valid_binding_input(&normalized) {
            return Err(format!(
                "apex.gameSettings.errors.invalidBinding: {normalized}"
            ));
        }
        if requested
            .insert(group.public.id.as_str(), normalized)
            .is_some()
        {
            return Err(format!(
                "apex.gameSettings.errors.duplicateBindingUpdate: {}",
                update.id
            ));
        }
    }

    let mut final_inputs: HashMap<String, String> = HashMap::new();
    for group in &groups {
        let final_input = requested
            .get(group.public.id.as_str())
            .cloned()
            .unwrap_or_else(|| group.public.input.clone());
        if let Some(existing) =
            final_inputs.insert(final_input.to_ascii_uppercase(), group.public.id.clone())
        {
            if existing != group.public.id {
                return Err(format!(
                    "apex.gameSettings.errors.bindingConflict: {final_input}"
                ));
            }
        }
    }

    for group in &groups {
        let Some(input) = requested.get(group.public.id.as_str()) else {
            continue;
        };
        for index in &group.line_indices {
            let ApexCfgLine::Raw(raw) = &mut doc.lines[*index] else {
                return Err("apex.gameSettings.errors.bindingMalformed".to_string());
            };
            *raw = replace_binding_input(raw, input)?;
        }
    }
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

fn verify_binding_updates(path: &Path, updates: &[ApexBindingUpdate]) -> Result<(), String> {
    if updates.is_empty() {
        return Ok(());
    }
    let bytes =
        fs::read(path).map_err(|error| format!("apex.gameSettings.errors.readFailed: {error}"))?;
    let (content, encoding) = decode_bytes(&bytes)?;
    let doc = ApexCfgDocument::from_content(&content, encoding)?;
    let groups = binding_groups(&doc);
    for update in updates {
        let expected = normalize_binding_input(&update.input);
        let Some(group) = groups.iter().find(|group| group.public.id == update.id) else {
            return Err(format!(
                "apex.gameSettings.errors.verifyFailed: binding {}",
                update.id
            ));
        };
        if group.public.input != expected {
            return Err(format!(
                "apex.gameSettings.errors.verifyFailed: binding {}",
                update.id
            ));
        }
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

fn load_report() -> Result<ApexGameSettingsReport, String> {
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

fn apply_request(request: ApexGameSettingsApplyRequest) -> Result<ApexGameSettingsReport, String> {
    if apex_is_running_by_tasklist()? {
        return Err("apex.gameSettings.errors.apexRunning".to_string());
    }
    if request.settings_updates.is_empty()
        && request.profile_updates.is_empty()
        && request.binding_updates.is_empty()
    {
        return Err("apex.gameSettings.errors.noChanges".to_string());
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
    apply_binding_updates(&mut settings.doc, &request.binding_updates)?;

    let settings_changed =
        !request.settings_updates.is_empty() || !request.binding_updates.is_empty();
    let profile_changed = !request.profile_updates.is_empty();
    let settings_new = encode_doc(&settings.doc);
    let profile_new = encode_doc(&profile.doc);

    ensure_revision(&settings.path, &request.settings_revision)?;
    ensure_revision(&profile.path, &request.profile_revision)?;
    if settings_changed {
        save_backup(&settings.path, &settings.bytes)?;
    }
    if profile_changed {
        save_backup(&profile.path, &profile.bytes)?;
    }

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
        verify_binding_updates(&settings.path, &request.binding_updates)?;
        Ok(())
    })();
    if let Err(error) = commit {
        if settings_changed {
            let _ = atomic_write(&settings.path, &settings.bytes);
        }
        if profile_changed {
            let _ = atomic_write(&profile.path, &profile.bytes);
        }
        return Err(error);
    }
    load_report()
}

fn restore_request(
    request: ApexGameSettingsRestoreRequest,
) -> Result<ApexGameSettingsReport, String> {
    if apex_is_running_by_tasklist()? {
        return Err("apex.gameSettings.errors.apexRunning".to_string());
    }
    if !request.restore_settings && !request.restore_profile {
        return Err("apex.gameSettings.errors.noRestoreSelection".to_string());
    }
    let settings = load_file(ConfigFile::Settings)?;
    let profile = load_file(ConfigFile::Profile)?;
    if settings.revision != request.settings_revision
        || profile.revision != request.profile_revision
    {
        return Err("apex.gameSettings.errors.fileChanged".to_string());
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

    let commit = (|| -> Result<(), String> {
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
        Ok(())
    })();
    if let Err(error) = commit {
        // Restore every selected file so a failed second replacement cannot leave
        // settings.cfg and profile.cfg from different snapshots.
        if request.restore_settings {
            let _ = atomic_write(&settings.path, &settings.bytes);
        }
        if request.restore_profile {
            let _ = atomic_write(&profile.path, &profile.bytes);
        }
        return Err(error);
    }
    load_report()
}

#[tauri::command]
pub async fn get_apex_game_settings() -> IpcResult<ApexGameSettingsReport> {
    blocking_cmd(load_report).await.map_err(apex_settings_error)
}

#[tauri::command]
pub async fn apply_apex_game_settings(
    request: ApexGameSettingsApplyRequest,
) -> IpcResult<ApexGameSettingsReport> {
    blocking_cmd(move || apply_request(request))
        .await
        .map_err(apex_settings_error)
}

#[tauri::command]
pub async fn restore_apex_game_settings(
    request: ApexGameSettingsRestoreRequest,
) -> IpcResult<ApexGameSettingsReport> {
    blocking_cmd(move || restore_request(request))
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
    use std::fs;
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
        let error = apply_binding_updates(
            &mut doc,
            &[ApexBindingUpdate {
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
        apply_binding_updates(
            &mut doc,
            &[ApexBindingUpdate {
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
    }

    #[test]
    fn rejects_unknown_and_unsafe_inputs() {
        assert!(!valid_binding_input("A_BUTTON"));
        assert!(!valid_binding_input("w;quit"));
        assert!(valid_binding_input("MOUSE4"));
        assert!(valid_binding_input("w"));
    }

    #[test]
    fn verifies_serialized_binding_updates() {
        let mut doc = sample();
        let update = ApexBindingUpdate {
            id: "binding:1".into(),
            input: "q".into(),
        };
        apply_binding_updates(&mut doc, std::slice::from_ref(&update)).unwrap();

        let path = std::env::temp_dir().join(format!(
            "mxtools-apex-settings-{}-{}.cfg",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&path, encode_doc(&doc)).unwrap();
        assert!(verify_binding_updates(&path, std::slice::from_ref(&update)).is_ok());

        fs::write(&path, encode_doc(&sample())).unwrap();
        assert!(verify_binding_updates(&path, std::slice::from_ref(&update)).is_err());
        let _ = fs::remove_file(path);
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
