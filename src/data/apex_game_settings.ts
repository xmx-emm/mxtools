import type {
  ApexGameSettingDefinition,
  ApexGameSettingOption,
  ApexGameSettingsSection,
} from '@/types/apex_game_settings.ts';

const boolOptions: ApexGameSettingOption[] = [
  {value: '0', labelKey: 'apexGameSettings.options.off'},
  {value: '1', labelKey: 'apexGameSettings.options.on'},
];

const zeroToTwo: ApexGameSettingOption[] = [
  {value: '0', labelKey: 'apexGameSettings.options.level0'},
  {value: '1', labelKey: 'apexGameSettings.options.level1'},
  {value: '2', labelKey: 'apexGameSettings.options.level2'},
];

const zeroToThree: ApexGameSettingOption[] = [
  ...zeroToTwo,
  {value: '3', labelKey: 'apexGameSettings.options.level3'},
];

const field = (
  id: string,
  file: ApexGameSettingDefinition['file'],
  key: string,
  section: ApexGameSettingDefinition['section'],
  control: ApexGameSettingDefinition['control'],
  extra: Partial<ApexGameSettingDefinition> = {},
): ApexGameSettingDefinition => ({
  id,
  file,
  key,
  section,
  control,
  labelKey: `apexGameSettings.fields.${id}.name`,
  descriptionKey: `apexGameSettings.fields.${id}.description`,
  ...extra,
});

const bool = (
  id: string,
  file: ApexGameSettingDefinition['file'],
  key: string,
  section: ApexGameSettingDefinition['section'],
) => field(id, file, key, section, 'toggle', {options: boolOptions});

const ApexGameSettings: ApexGameSettingDefinition[] = [
  bool('crossPlay', 'profile', 'CrossPlay_user_optin', 'gameplay'),
  bool('autoSprint', 'profile', 'player_setting_autosprint', 'gameplay'),
  bool('holdToSprint', 'profile', 'player_setting_holdtosprint', 'gameplay'),
  bool('stickySprint', 'profile', 'player_setting_stickysprintforward', 'gameplay'),
  bool('damageClosesDeathbox', 'profile', 'player_setting_damage_closes_deathbox_menu', 'gameplay'),
  bool('autoCycleEmpty', 'profile', 'weapon_setting_autocycle_on_empty', 'gameplay'),
  bool('abilityFovScaling', 'profile', 'fov_disableAbilityScaling', 'gameplay'),
  field('lowAmmoWarning', 'profile', 'player_setting_lowammo_setting', 'gameplay', 'enum', {options: zeroToTwo}),
  field('viewShake', 'profile', 'sprint_view_shake_style', 'gameplay', 'number', {min: 0, max: 1, step: 0.1}),
  bool('nvidiaLowLatency', 'settings', 'gfx_nvnUseLowLatency', 'gameplay'),
  bool('nvidiaLowLatencyBoost', 'settings', 'gfx_nvnUseLowLatencyBoost', 'gameplay'),
  bool('amdLowLatency', 'settings', 'gfx_amdUseLowLatency', 'gameplay'),

  field('fovScale', 'profile', 'cl_fovScale', 'aiming', 'number', {min: 1, max: 1.7, step: 0.01}),
  bool('invertMouse', 'profile', 'm_invert_pitch', 'aiming'),
  bool('mouseAcceleration', 'settings', 'm_acceleration', 'aiming'),
  bool('mouseClamp', 'settings', 'm_clamp_to_window', 'aiming'),
  field('mouseSensitivity', 'settings', 'mouse_sensitivity', 'aiming', 'number', {min: 0.01, max: 20, step: 0.01}),
  bool('perScopeMouse', 'settings', 'mouse_use_per_scope_sensitivity_scalars', 'aiming'),
  ...Array.from({length: 8}, (_, index) => field(
    `mouseScope${index}`,
    'settings',
    `mouse_zoomed_sensitivity_scalar_${index}`,
    'aiming',
    'number',
    {min: 0.1, max: 10, step: 0.05},
  )),

  bool('controllerCustom', 'profile', 'gamepad_custom_enabled', 'controller'),
  field('controllerAimSpeed', 'profile', 'gamepad_aim_speed', 'controller', 'number', {min: 0, max: 8, step: 1}),
  field('controllerButtonLayout', 'profile', 'gamepad_button_layout', 'controller', 'enum', {options: zeroToThree}),
  field('controllerStickLayout', 'profile', 'gamepad_stick_layout', 'controller', 'enum', {options: zeroToThree}),
  field('controllerLookCurve', 'profile', 'gamepad_look_curve', 'controller', 'number', {min: 0, max: 5, step: 1}),
  field('controllerLookDeadzone', 'profile', 'gamepad_deadzone_index_look', 'controller', 'enum', {options: zeroToTwo}),
  field('controllerMoveDeadzone', 'profile', 'gamepad_deadzone_index_move', 'controller', 'enum', {options: zeroToTwo}),
  field('controllerTriggerThreshold', 'profile', 'gamepad_trigger_threshold', 'controller', 'number', {min: 0, max: 100, step: 1}),
  bool('controllerToggleAds', 'profile', 'gamepad_toggle_ads', 'controller'),
  bool('controllerToggleCrouch', 'profile', 'gamepad_togglecrouch_hold', 'controller'),
  field('controllerRumble', 'profile', 'joy_rumble', 'controller', 'enum', {options: zeroToTwo}),
  bool('controllerInvert', 'profile', 'joy_inverty', 'controller'),
  field('alcResponseCurve', 'profile', 'gamepad_custom_curve', 'controller', 'number', {min: 0, max: 30, step: 0.1}),
  field('alcInnerDeadzone', 'profile', 'gamepad_custom_deadzone_in', 'controller', 'number', {min: 0, max: 1, step: 0.01}),
  field('alcOuterThreshold', 'profile', 'gamepad_custom_deadzone_out', 'controller', 'number', {min: 0, max: 1, step: 0.01}),
  field('alcHipYaw', 'profile', 'gamepad_custom_hip_yaw', 'controller', 'number', {min: 0, max: 500, step: 1}),
  field('alcHipPitch', 'profile', 'gamepad_custom_hip_pitch', 'controller', 'number', {min: 0, max: 500, step: 1}),
  field('alcAdsYaw', 'profile', 'gamepad_custom_ads_yaw', 'controller', 'number', {min: 0, max: 500, step: 1}),
  field('alcAdsPitch', 'profile', 'gamepad_custom_ads_pitch', 'controller', 'number', {min: 0, max: 500, step: 1}),
  bool('perScopeController', 'profile', 'gamepad_use_per_scope_sensitivity_scalars', 'controller'),

  field('speakerChannels', 'settings', 'sound_num_speakers', 'audio', 'enum', {
    options: ['0', '2', '4', '6', '8'].map(value => ({value, labelKey: `apexGameSettings.options.channels${value}`})),
  }),
  field('sfxVolume', 'profile', 'sound_volume_sfx', 'audio', 'number', {min: 0, max: 1, step: 0.01}),
  field('dialogueVolume', 'profile', 'sound_volume_dialogue', 'audio', 'number', {min: 0, max: 1, step: 0.01}),
  field('gameMusicVolume', 'profile', 'sound_volume_music_game', 'audio', 'number', {min: 0, max: 1, step: 0.01}),
  field('lobbyMusicVolume', 'profile', 'sound_volume_music_lobby', 'audio', 'number', {min: 0, max: 1, step: 0.01}),
  field('voiceVolume', 'settings', 'sound_volume_voice', 'audio', 'number', {min: 0, max: 2, step: 0.01}),
  bool('soundWithoutFocus', 'profile', 'sound_without_focus', 'audio'),
  bool('voiceEnabled', 'profile', 'voice_enabled', 'audio'),
  bool('voiceMute', 'settings', 'voice_mixer_mute', 'audio'),
  field('voiceInputVolume', 'settings', 'voice_mixer_volume', 'audio', 'number', {min: 0, max: 1, step: 0.01}),
  bool('pushToTalk', 'settings', 'voice_vox', 'audio'),

  bool('subtitles', 'profile', 'closecaption', 'interface'),
  field('subtitleSize', 'profile', 'cc_text_size', 'interface', 'enum', {options: zeroToTwo}),
  field('colorblindMode', 'profile', 'colorblind_mode', 'interface', 'enum', {options: zeroToThree}),
  field('damageTextStyle', 'profile', 'hud_setting_damageTextStyle', 'interface', 'enum', {options: zeroToThree}),
  field('damageIndicatorStyle', 'profile', 'hud_setting_damageIndicatorStyle', 'interface', 'enum', {options: zeroToThree}),
  bool('rotateMinimap', 'profile', 'hud_setting_minimapRotate', 'interface'),
  bool('buttonHints', 'profile', 'hud_setting_showButtonHints', 'interface'),
  bool('enemyHealthBar', 'profile', 'hud_setting_showEnemyHealthBar', 'interface'),
  bool('enemyHighlight', 'profile', 'hud_setting_showEnemyHighlight', 'interface'),
  bool('showTips', 'profile', 'hud_setting_showTips', 'interface'),
  field('streamerMode', 'profile', 'hud_setting_streamerMode', 'interface', 'enum', {options: zeroToTwo}),
  bool('textToSpeech', 'profile', 'hudchat_play_text_to_speech', 'interface'),
];

export const apexGameSettingsSections: ApexGameSettingsSection[] = [
  'gameplay', 'aiming', 'bindings', 'controller', 'audio', 'interface', 'unknown',
];

export const apexBindingCommandLabels: Record<string, string> = {
  weaponSelectPrimary0: 'weapon1', weaponSelectPrimary1: 'weapon2', weaponSelectPrimary2: 'holster',
  '+scriptCommand4': 'survival', '+moveleft': 'moveLeft', '+moveright': 'moveRight',
  '+forward': 'moveForward', '+backward': 'moveBack', '+toggle_duck': 'toggleCrouch',
  '+duck': 'holdCrouch', '+speed': 'sprint', '+jump': 'jump', '+use; +use_long': 'interact',
  '+reload': 'reload', '+attack': 'attack', '+zoom': 'aim', '+melee': 'melee', '+ping': 'ping',
  'ping_specific_type ENEMY': 'enemyPing', toggle_inventory: 'inventory', toggle_map: 'map',
  weapon_inspect: 'inspect', weaponSelectOrdnance: 'grenade', '+offhand1': 'tactical',
  '+offhand4': 'ultimate', '+pushtotalk': 'voiceChat', say_team: 'teamChat', chat_wheel: 'chatWheel',
};

export default ApexGameSettings;
