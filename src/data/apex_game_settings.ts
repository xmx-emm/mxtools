import type {
  ApexGameSettingDefinition,
  ApexGameSettingDependency,
  ApexGameSettingOption,
  ApexGameSettingsSection,
} from '@/types/apex_game_settings.ts';

const boolOptions: ApexGameSettingOption[] = [
  {value: '0', labelKey: 'apexGameSettings.options.off'},
  {value: '1', labelKey: 'apexGameSettings.options.on'},
];

const options = (...items: [string, string][]): ApexGameSettingOption[] => items.map(
  ([value, label]) => ({value, labelKey: `apexGameSettings.options.${label}`}),
);

const describedOptions = (
  fieldId: string,
  ...items: [string, string][]
): ApexGameSettingOption[] => items.map(([value, label]) => ({
  value,
  labelKey: `apexGameSettings.options.${label}`,
  descriptionKey: `apexGameSettings.fields.${fieldId}.options.${label}`,
}));

const linkedOptions = (
  fieldId: string,
  ...items: [string, string, Record<string, string>][]
): ApexGameSettingOption[] => items.map(([value, label, values]) => ({
  value,
  labelKey: `apexGameSettings.options.${label}`,
  descriptionKey: `apexGameSettings.fields.${fieldId}.options.${label}`,
  values,
}));

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

const profileDependency = (key: string, value: string): ApexGameSettingDependency => ({
  file: 'profile', key, value,
});

const alcDisabled = profileDependency('gamepad_custom_enabled', '0');
const alcPerOpticDisabled = [
  alcDisabled,
  profileDependency('gamepad_use_per_scope_sensitivity_scalars', '0'),
];

// Still deliberately absent because no current visible menu owner was confirmed:
// hud_setting_showMeter (a separate legacy key, not the Chinese "health and
// ammo popup" row), sound_num_speakers, and unowned gamepad_custom_* internals.
// The runtime-confirmed advanced-look controls below intentionally exclude
// assist_style, custom_pilot/custom_titan, and the four high/low-power scope
// aim-assist keys. The
// runtime-confirmed meanings for the editable keys below are recorded in the
// locale descriptions and docs/APEX_GAME_SETTINGS_RUNTIME_MAPPING.md.
const ApexGameSettings: ApexGameSettingDefinition[] = [
  field('reticleDamageFeedback', 'profile', 'damage_indicator_style_pilot', 'gameplay', 'enum', {
    options: describedOptions('reticleDamageFeedback', ['0', 'off'], ['1', 'reticleX'], ['2', 'reticleXShield']),
  }),
  field('incomingDamageFeedback', 'profile', 'hud_setting_damageIndicatorStyle', 'gameplay', 'enum', {
    options: describedOptions('incomingDamageFeedback', ['0', 'twoD'], ['1', 'threeD'], ['2', 'both']),
  }),
  field('damageTextStyle', 'profile', 'hud_setting_damageTextStyle', 'gameplay', 'enum', {
    options: describedOptions('damageTextStyle', ['0', 'off'], ['1', 'stacking'], ['2', 'floating'], ['3', 'both']),
  }),
  field('reticleColor', 'profile', 'reticle_color', 'gameplay', 'rgb'),
  field('laserSightCustom', 'profile', 'laserSightColorCustomized', 'gameplay', 'enum', {
    options: options(['0', 'default'], ['1', 'custom']),
  }),
  field('laserSightColor', 'profile', 'laserSightColor', 'gameplay', 'packed-rgb', {
    disabledWhen: {file: 'profile', key: 'laserSightColorCustomized', value: '0'},
  }),
  bool('enemyHealthBar', 'profile', 'hud_setting_showEnemyHealthBar', 'gameplay'),
  bool('enemyHighlight', 'profile', 'hud_setting_showEnemyHighlight', 'gameplay'),
  bool('autoCycleEmpty', 'profile', 'weapon_setting_autocycle_on_empty', 'gameplay'),
  bool('damageClosesDeathbox', 'profile', 'player_setting_damage_closes_deathbox_menu', 'gameplay'),
  field('chainHeal', 'profile', 'hud_setting_chainHeal', 'gameplay', 'enum', {
    options: describedOptions('chainHeal', ['0', 'off'], ['1', 'single'], ['2', 'automatic']),
  }),
  field('stickySprint', 'profile', 'player_setting_stickysprintforward', 'gameplay', 'toggle', {
    options: describedOptions('stickySprint', ['0', 'off'], ['1', 'on']),
  }),
  field('holdToSprint', 'profile', 'player_setting_holdtosprint', 'gameplay', 'enum', {
    options: options(['0', 'press'], ['1', 'hold']),
    disabledWhen: {file: 'profile', key: 'player_setting_stickysprintforward', value: '1'},
  }),
  bool('autoSprint', 'profile', 'player_setting_autosprint', 'gameplay'),
  field('jetpackGlideControl', 'profile', 'toggle_on_jump_to_deactivate', 'gameplay', 'enum', {
    options: describedOptions('jetpackGlideControl', ['0', 'hold'], ['1', 'toggle']),
  }),
  field('mantleBoostActivation', 'profile', 'mantle_boost_input_setting', 'gameplay', 'enum', {
    options: describedOptions('mantleBoostActivation',
      ['0', 'off'], ['1', 'jump'], ['2', 'crouch'], ['3', 'movementAbility']),
  }),
  field('mantleBoostUi', 'profile', 'mantle_boost_ui_setting', 'gameplay', 'enum', {
    options: describedOptions('mantleBoostUi',
      ['0', 'off'], ['1', 'minimum'], ['2', 'hiddenPrompts'], ['3', 'full']),
  }),
  field('healthAmmoPopup', 'profile', 'player_setting_lowammo_setting', 'gameplay', 'enum', {
    options: describedOptions('healthAmmoPopup', ['0', 'off'], ['1', 'limited'], ['2', 'on']),
  }),
  field('interactionPromptStyle', 'profile', 'player_use_prompt_enabled', 'gameplay', 'enum', {
    options: options(['0', 'compact'], ['1', 'default']),
  }),
  field('tutorialSystem', 'profile', 'player_setting_tutorialization', 'gameplay', 'enum', {
    options: describedOptions('tutorialSystem', ['0', 'off'], ['1', 'automatic'], ['2', 'on']),
  }),
  bool('crossPlay', 'profile', 'CrossPlay_user_optin', 'gameplay'),
  bool('abilityFovScaling', 'profile', 'fov_disableAbilityScaling', 'gameplay'),
  field('viewShake', 'profile', 'sprint_view_shake_style', 'gameplay', 'number', {min: 0, max: 1, step: 0.1}),
  bool('nvidiaLowLatency', 'settings', 'gfx_nvnUseLowLatency', 'gameplay'),
  bool('nvidiaLowLatencyBoost', 'settings', 'gfx_nvnUseLowLatencyBoost', 'gameplay'),
  bool('amdLowLatency', 'settings', 'gfx_amdUseLowLatency', 'gameplay'),

  field('fovScale', 'profile', 'cl_fovScale', 'aiming', 'number', {min: 1, max: 1.7, step: 0.01}),
  bool('invertMouse', 'profile', 'm_invert_pitch', 'aiming'),
  bool('mouseAcceleration', 'settings', 'm_acceleration', 'aiming'),
  bool('mouseClamp', 'settings', 'm_clamp_to_window', 'aiming'),
  bool('lightingEffects', 'settings', 'chroma_enable', 'aiming'),
  field('mouseSensitivity', 'settings', 'mouse_sensitivity', 'aiming', 'number', {min: 0.01, max: 20, step: 0.01}),
  field('mouseAdsMultiplier', 'settings', 'mouse_ads_multiplier', 'aiming', 'number', {
    min: 0.1,
    max: 10,
    step: 0.05,
    readKey: 'mouse_zoomed_sensitivity_scalar_0',
    writeKeys: ['mouse_zoomed_sensitivity_scalar_0'],
    disabledWhen: {file: 'settings', key: 'mouse_use_per_scope_sensitivity_scalars', value: '1'},
  }),
  bool('perScopeMouse', 'settings', 'mouse_use_per_scope_sensitivity_scalars', 'aiming'),
  ...Array.from({length: 8}, (_, index) => field(
    `mouseScope${index}`,
    'settings',
    `mouse_zoomed_sensitivity_scalar_${index}`,
    'aiming',
    'number',
    {
      min: 0.1,
      max: 10,
      step: 0.05,
      disabledWhen: {
        file: 'settings',
        key: 'mouse_use_per_scope_sensitivity_scalars',
        value: '0',
      },
    },
  )),

  field('controllerAimSpeed', 'profile', 'gamepad_aim_speed', 'controller', 'enum', {
    options: options(
      ['0', 'veryLow'], ['1', 'low'], ['2', 'preset'], ['3', 'high'],
      ['4', 'veryHigh'], ['5', 'superHigh'], ['6', 'ultraHigh'], ['7', 'extreme'],
    ),
  }),
  field('controllerAdsSensitivity', 'profile', 'gamepad_ads_sensitivity', 'controller', 'enum', {
    options: options(
      ['-1', 'same'], ['0', 'veryLow'], ['1', 'low'], ['2', 'preset'], ['3', 'high'],
      ['4', 'veryHigh'], ['5', 'superHigh'], ['6', 'ultraHigh'], ['7', 'extreme'],
    ),
    readKey: 'gamepad_aim_speed_ads_0',
    writeKeys: ['gamepad_aim_speed_ads_0'],
    disabledWhen: {file: 'profile', key: 'gamepad_use_per_scope_ads_settings', value: '1'},
  }),
  bool('perScopeControllerAds', 'profile', 'gamepad_use_per_scope_ads_settings', 'controller'),
  ...Array.from({length: 8}, (_, index) => field(
    `controllerAdsScope${index}`,
    'profile',
    `gamepad_aim_speed_ads_${index}`,
    'controller',
    'enum',
    {
      options: options(
        ['-1', 'default'], ['0', 'veryLow'], ['1', 'low'], ['2', 'preset'], ['3', 'high'],
        ['4', 'veryHigh'], ['5', 'superHigh'], ['6', 'ultraHigh'], ['7', 'extreme'],
      ),
      disabledWhen: {file: 'profile', key: 'gamepad_use_per_scope_ads_settings', value: '0'},
    },
  )),
  field('controllerButtonLayout', 'profile', 'gamepad_button_layout', 'controller', 'enum', {
    options: describedOptions('controllerButtonLayout',
      ['0', 'default'], ['1', 'buttonJumper'], ['2', 'buttonPuncher'], ['3', 'evolved'],
      ['4', 'grenadier'], ['5', 'ninja'], ['6', 'custom'],
    ),
  }),
  field('controllerStickLayout', 'profile', 'gamepad_stick_layout', 'controller', 'enum', {
    options: describedOptions('controllerStickLayout',
      ['0', 'default'], ['1', 'southpaw'], ['2', 'legacy'], ['3', 'legacySouthpaw'],
    ),
  }),
  field('controllerUseType', 'profile', 'gamepad_use_type', 'controller', 'enum', {
    options: describedOptions('controllerUseType',
      ['0', 'tapUseHoldReload'], ['1', 'holdUseTapReload'], ['2', 'tapUseReload'],
    ),
  }),
  field('controllerLookCurve', 'profile', 'gamepad_look_curve', 'controller', 'enum', {
    options: describedOptions('controllerLookCurve',
      ['0', 'classic'], ['1', 'steady'], ['2', 'fineAim'], ['3', 'highVelocity'], ['4', 'linear'],
    ),
  }),
  field('controllerLookDeadzone', 'profile', 'gamepad_deadzone_index_look', 'controller', 'enum', {
    options: options(['0', 'none'], ['1', 'small'], ['2', 'large']),
  }),
  field('controllerMoveDeadzone', 'profile', 'gamepad_deadzone_index_move', 'controller', 'enum', {
    options: options(['1', 'small'], ['2', 'large']),
  }),
  field('controllerTriggerThreshold', 'profile', 'gamepad_trigger_threshold', 'controller', 'enum', {
    options: options(['0', 'none'], ['30', 'default'], ['64', 'medium'], ['128', 'high'], ['255', 'highest']),
  }),
  field('controllerVibration', 'profile', 'joy_rumble', 'controller', 'enum', {
    options: describedOptions('controllerVibration', ['0', 'off'], ['1', 'default'], ['2', 'advanced']),
  }),
  bool('ps5AdaptiveTriggers', 'profile', 'ps5_trig_enable', 'controller'),
  field('controllerToggleAds', 'profile', 'gamepad_toggle_ads', 'controller', 'enum', {
    options: options(['0', 'hold'], ['1', 'toggle']),
  }),
  field('controllerToggleCrouch', 'profile', 'gamepad_togglecrouch_hold', 'controller', 'enum', {
    options: options(['0', 'toggle'], ['1', 'hold']),
  }),
  field('controllerSurvivalSlot', 'profile', 'gamepad_toggle_survivalSlot_to_weaponInspect', 'controller', 'enum', {
    options: boolOptions,
  }),
  bool('controllerInvert', 'profile', 'joy_inverty', 'controller'),
  field('menuCursorVelocity', 'profile', 'gameCursor_Velocity', 'controller', 'number', {
    min: 1300, max: 4300, step: 1,
  }),
  bool('alcEnabled', 'profile', 'gamepad_custom_enabled', 'controller'),
  field('alcDeadzone', 'profile', 'gamepad_custom_deadzone_in', 'controller', 'number', {
    min: 0, max: 0.5, step: 0.01, disabledWhen: alcDisabled,
  }),
  field('alcOuterThreshold', 'profile', 'gamepad_custom_deadzone_out', 'controller', 'number', {
    min: 0.01, max: 0.3, step: 0.01, disabledWhen: alcDisabled,
  }),
  field('alcResponseCurve', 'profile', 'gamepad_custom_curve', 'controller', 'number', {
    min: 0, max: 30, step: 1, disabledWhen: alcDisabled,
  }),
  field('alcPerOpticEnabled', 'profile', 'gamepad_use_per_scope_sensitivity_scalars', 'controller', 'toggle', {
    options: boolOptions,
    disabledWhen: alcDisabled,
  }),
  ...Array.from({length: 8}, (_, index) => field(
    `alcScope${index}`,
    'profile',
    `gamepad_ads_advanced_sensitivity_scalar_${index}`,
    'controller',
    'number',
    {min: 0.2, max: 10, step: 0.01, disabledWhen: alcPerOpticDisabled},
  )),
  field('alcHipYaw', 'profile', 'gamepad_custom_hip_yaw', 'controller', 'number', {
    min: 0, max: 500, step: 1, disabledWhen: alcDisabled,
  }),
  field('alcHipPitch', 'profile', 'gamepad_custom_hip_pitch', 'controller', 'number', {
    min: 0, max: 500, step: 1, disabledWhen: alcDisabled,
  }),
  field('alcHipExtraYaw', 'profile', 'gamepad_custom_hip_turn_yaw', 'controller', 'number', {
    min: 0, max: 250, step: 1, disabledWhen: alcDisabled,
  }),
  field('alcHipExtraPitch', 'profile', 'gamepad_custom_hip_turn_pitch', 'controller', 'number', {
    min: 0, max: 250, step: 1, disabledWhen: alcDisabled,
  }),
  field('alcHipRampTime', 'profile', 'gamepad_custom_hip_turn_time', 'controller', 'number', {
    min: 0, max: 1, step: 0.01, disabledWhen: alcDisabled,
  }),
  field('alcHipRampDelay', 'profile', 'gamepad_custom_hip_turn_delay', 'controller', 'number', {
    min: 0, max: 1, step: 0.01, disabledWhen: alcDisabled,
  }),
  field('alcAdsYaw', 'profile', 'gamepad_custom_ads_yaw', 'controller', 'number', {
    min: 0, max: 500, step: 1, disabledWhen: alcDisabled,
  }),
  field('alcAdsPitch', 'profile', 'gamepad_custom_ads_pitch', 'controller', 'number', {
    min: 0, max: 500, step: 1, disabledWhen: alcDisabled,
  }),
  field('alcAdsExtraYaw', 'profile', 'gamepad_custom_ads_turn_yaw', 'controller', 'number', {
    min: 0, max: 250, step: 1, disabledWhen: alcDisabled,
  }),
  field('alcAdsExtraPitch', 'profile', 'gamepad_custom_ads_turn_pitch', 'controller', 'number', {
    min: 0, max: 250, step: 1, disabledWhen: alcDisabled,
  }),
  field('alcAdsRampTime', 'profile', 'gamepad_custom_ads_turn_time', 'controller', 'number', {
    min: 0, max: 1, step: 0.01, disabledWhen: alcDisabled,
  }),
  field('alcAdsRampDelay', 'profile', 'gamepad_custom_ads_turn_delay', 'controller', 'number', {
    min: 0, max: 1, step: 0.01, disabledWhen: alcDisabled,
  }),
  field('alcTargetCompensation', 'profile', 'gamepad_custom_assist_on', 'controller', 'toggle', {
    options: boolOptions,
    disabledWhen: alcDisabled,
  }),
  field('alcMeleeTargetCompensation', 'profile', 'gamepad_aim_assist_melee', 'controller', 'toggle', {
    options: boolOptions,
    disabledWhen: [alcDisabled, profileDependency('gamepad_custom_assist_on', '0')],
  }),
  field('audioOutputConfiguration', 'settings', 'miles_channels', 'audio', 'enum', {
    options: describedOptions('audioOutputConfiguration', ['0', 'deviceDefault'], ['1', 'mono'], ['2', 'stereo']),
  }),
  field('audioMix', 'profile', 'miles_mix', 'audio', 'enum', {
    options: describedOptions('audioMix', ['0', 'original'], ['1', 'focused']),
  }),
  field('spectatorGameVolume', 'profile', 'sound_volume_sfx_observer', 'audio', 'number', {min: 0, max: 1, step: 0.01}),
  field('sfxVolume', 'profile', 'sound_volume_sfx', 'audio', 'number', {min: 0, max: 1, step: 0.01}),
  field('dialogueVolume', 'profile', 'sound_volume_dialogue', 'audio', 'number', {min: 0, max: 1, step: 0.01}),
  field('gameMusicVolume', 'profile', 'sound_volume_music_game', 'audio', 'number', {min: 0, max: 1, step: 0.01}),
  field('lobbyMusicVolume', 'profile', 'sound_volume_music_lobby', 'audio', 'number', {min: 0, max: 1, step: 0.01}),
  field('legendDialogue', 'profile', 'dialogue_cat_legend_flavor', 'audio', 'enum', {
    readKey: 'dialogue_cat_legend_flavor',
    writeKeys: ['dialogue_cat_legend_flavor', 'dialogue_cat_legend_important'],
    options: linkedOptions('legendDialogue',
      ['none', 'none', {dialogue_cat_legend_flavor: '0', dialogue_cat_legend_important: '0'}],
      ['important', 'importantOnly', {dialogue_cat_legend_flavor: '0', dialogue_cat_legend_important: '1'}],
      ['all', 'all', {dialogue_cat_legend_flavor: '1', dialogue_cat_legend_important: '1'}]),
  }),
  field('pingDialogue', 'profile', 'dialogue_cat_ping_flavor', 'audio', 'enum', {
    readKey: 'dialogue_cat_ping_flavor',
    writeKeys: ['dialogue_cat_ping_flavor', 'dialogue_cat_ping_important'],
    options: linkedOptions('pingDialogue',
      ['none', 'none', {dialogue_cat_ping_flavor: '0', dialogue_cat_ping_important: '0'}],
      ['important', 'importantOnly', {dialogue_cat_ping_flavor: '0', dialogue_cat_ping_important: '1'}],
      ['all', 'all', {dialogue_cat_ping_flavor: '1', dialogue_cat_ping_important: '1'}]),
  }),
  field('broadcastDialogue', 'profile', 'dialogue_cat_host_flavor', 'audio', 'enum', {
    readKey: 'dialogue_cat_host_flavor',
    writeKeys: ['dialogue_cat_host_flavor', 'dialogue_cat_host_important'],
    options: linkedOptions('broadcastDialogue',
      ['none', 'none', {dialogue_cat_host_flavor: '0', dialogue_cat_host_important: '0'}],
      ['important', 'importantOnly', {dialogue_cat_host_flavor: '0', dialogue_cat_host_important: '1'}],
      ['all', 'all', {dialogue_cat_host_flavor: '1', dialogue_cat_host_important: '1'}]),
  }),
  bool('emotePreviewSound', 'profile', 'cl_anim_always_play_nonlobby_sfx', 'audio'),
  field('voiceVolume', 'settings', 'sound_volume_voice', 'audio', 'number', {min: 0, max: 2, step: 0.01}),
  bool('soundWithoutFocus', 'profile', 'sound_without_focus', 'audio'),
  field('voiceActivationThreshold', 'profile', 'voice_quiet_threshold', 'audio', 'number', {min: 0, max: 32767, step: 0.01}),
  field('voiceChatRecordMode', 'settings', 'VoiceChatMode', 'audio', 'enum', {
    options: describedOptions('voiceChatRecordMode', ['0', 'pushToTalk'], ['1', 'openMic'], ['2', 'toggle']),
  }),

  bool('buttonHints', 'profile', 'hud_setting_showButtonHints', 'hud'),
  field('uiMode', 'settings', 'ui_layout_mode', 'hud', 'enum', {
    options: describedOptions('uiMode', ['0', 'automatic'], ['1', 'compact'], ['2', 'full']),
  }),
  bool('energyAmmoDisplay', 'profile', 'hud_setting_energyAmmoDisplay', 'hud'),
  bool('showMedals', 'profile', 'hud_setting_showMedals', 'hud'),
  bool('hopUpPopup', 'profile', 'hud_setting_showHopUpPopUp', 'hud'),
  bool('obituary', 'profile', 'hud_setting_showObituary', 'hud'),
  bool('rotateMinimap', 'profile', 'hud_setting_minimapRotate', 'hud'),
  field('pingOpacity', 'profile', 'hud_setting_pingAlpha', 'hud', 'enum', {
    // Apex writes this scalar with six fractional digits in profile.cfg.
    // Keep the canonical UI values aligned with that representation while the
    // native validator accepts equivalent decimal spellings from older files.
    options: describedOptions('pingOpacity', ['0.500000', 'transparent'], ['1.000000', 'default']),
  }),
  field('arsenalMapIcons', 'profile', 'player_setting_arsenals_maphudidentifiers', 'hud', 'enum', {
    options: describedOptions('arsenalMapIcons', ['0', 'minimum'], ['1', 'medium'], ['2', 'maximum']),
  }),
  field('offscreenPortraits', 'profile', 'hud_setting_showOffscreenPortrait', 'hud', 'enum', {
    options: describedOptions('offscreenPortraits', ['0', 'off'], ['1', 'on']),
  }),
  field('performanceDisplay', 'profile', 'net_netGraph2', 'hud', 'enum', {
    options: describedOptions('performanceDisplay', ['0', 'off'], ['1', 'on']),
  }),
  bool('showTips', 'profile', 'hud_setting_showTips', 'hud'),

  field('colorblindMode', 'profile', 'colorblind_mode', 'accessibility', 'enum', {
    options: options(['0', 'off'], ['1', 'redBlind'], ['2', 'greenBlind'], ['3', 'blueBlind']),
  }),
  bool('subtitles', 'profile', 'closecaption', 'accessibility'),
  field('subtitleSize', 'profile', 'cc_text_size', 'accessibility', 'enum', {
    options: options(['0', 'normal'], ['1', 'large'], ['2', 'extraLarge']),
  }),
  field('healthAmmoVoice', 'profile', 'player_setting_gamestateawareness_callouts', 'accessibility', 'enum', {
    options: describedOptions('healthAmmoVoice', ['0', 'off'], ['1', 'limited'], ['2', 'on']),
  }),
  bool('textToSpeech', 'profile', 'hudchat_play_text_to_speech', 'accessibility'),
  bool('speechToText', 'profile', 'speechtotext_enabled', 'accessibility'),

  field('autoMuteCommunications', 'profile', 'cl_comms_filter', 'privacy', 'enum', {
    options: options(['1', 'none'], ['0', 'nonFriends'], ['-1', 'everyone']),
  }),
  field('streamerMode', 'profile', 'hud_setting_streamerMode', 'privacy', 'enum', {
    options: describedOptions('streamerMode', ['0', 'off'], ['1', 'killer'], ['2', 'all']),
  }),
  bool('anonymousMode', 'profile', 'hud_setting_anonymousMode', 'privacy'),
  bool('shareUsageData', 'profile', 'pin_opt_in', 'privacy'),
];

export const apexGameSettingsSections: ApexGameSettingsSection[] = [
  'gameplay', 'aiming', 'bindings', 'controller', 'audio', 'hud', 'accessibility', 'privacy', 'unknown',
];

// Runtime, machine-local, telemetry, cache, and legacy keys that have been
// reviewed and deliberately do not belong in the current editable menu.
export const apexGameSettingsReviewIgnoredKeys = new Set([
  'settings:cc_linger_time',
  'settings:cc_predisplay_time',
  'settings:func_break_max_pieces',
  'settings:hdr_screenshot_directory',
  'settings:lookspring',
  'settings:lookstrafe',
  'settings:miles_dumpuploadtime',
  'settings:miles_output_device',
  'settings:name',
  'settings:sound_num_speakers',
  'settings:sv_specaccelerate',
  'settings:sv_specnoclip',
  'settings:sv_specspeed',
  'settings:sv_voiceenable',
  'settings:voice_forcemicrecord',
  'settings:voice_input_device',
  'settings:voice_mixer_boost',
  'settings:voice_mixer_mute',
  'settings:voice_mixer_volume',
  'settings:voice_modenable',
  'settings:voice_scale',
  'settings:voice_vox',
  'profile:communicationBlock_time_to_unblock',
  'profile:eula_version_accepted',
  'profile:first_time_player_state',
  'profile:gamepad_aim_assist_ads_high_power_scopes',
  'profile:gamepad_aim_assist_ads_low_power_scopes',
  'profile:gamepad_aim_assist_hip_high_power_scopes',
  'profile:gamepad_aim_assist_hip_low_power_scopes',
  'profile:gamepad_buttons_are_southpaw',
  'profile:gamepad_custom_assist_style',
  'profile:gamepad_custom_pilot',
  'profile:gamepad_custom_titan',
  'profile:gamma_adjusted',
  'profile:hud_setting_showMeter',
  'profile:intro_viewed',
  'profile:localClientPlayerCachedLevel',
  'profile:menu_was_multiplayer_played_last',
  'profile:miles_language',
  'profile:mp_player_level',
  'profile:noise_filter_scale',
  'profile:pin_telemetry_report_date',
  'profile:speechtotext_disable_time',
  'profile:voice_enabled',
  'profile:xlog_tls_allow_vip_upload',
]);

export const apexBindingCommandLabels: Record<string, string> = {
  weaponSelectPrimary0: 'weapon1', weaponSelectPrimary1: 'weapon2', weaponSelectPrimary2: 'holster',
  '+scriptCommand4': 'useSelectedMedical', '+scriptCommand3': 'toggleFireMode', '+scriptcommand3': 'toggleFireMode',
  '+scriptCommand5': 'characterUtility', '+scriptCommand6': 'survivalItem', '+scriptCommand7': 'scriptCommand7', '+dodge': 'movementAbility',
  '+moveleft': 'moveLeft', '+moveright': 'moveRight',
  '+forward': 'moveForward', '+backward': 'moveBack', '+toggle_duck': 'toggleCrouch',
  '+duck': 'holdCrouch', '+speed': 'sprintToggleZoom', '+jump': 'jump', '+use; +use_long': 'interact',
  '+use_alt': 'otherInteract', '+reload': 'reload', '+attack': 'attack', '+zoom': 'holdAim',
  '+toggle_zoom': 'toggleAim', '+weaponCycle': 'cycleWeapon', '+weaponcycle': 'cycleWeapon', '+melee': 'melee', '+ping': 'ping',
  'ping_specific_type ENEMY': 'enemyPing', 'ping_specific_type ATTACK': 'pingAttack', 'ping_specific_type REGROUP': 'pingRegroup',
  'ping_specific_type ENEMY_AUDIO': 'pingEnemyAudio', 'ping_specific_type AVOID': 'pingAvoid',
  'ping_specific_type AREA_VISITED': 'pingAreaVisited', 'ping_specific_type WATCHING': 'pingWatching',
  'ping_specific_type GOING': 'pingGoing', 'ping_specific_type LOOTING': 'pingLooting',
  'ping_specific_type DEFENDING': 'pingDefending', toggle_inventory: 'inventory', toggle_map: 'map',
  weapon_inspect: 'inspect', weaponSelectOrdnance: 'grenade', '+offhand1': 'tactical',
  '+offhand4': 'ultimate', '+pushtotalk': 'voiceChat', say_team: 'teamChat', chat_wheel: 'legendWheel',
  'use_consumable HEALTH_SMALL': 'syringe', 'use_consumable HEALTH_LARGE': 'medKit',
  'use_consumable SHIELD_SMALL': 'shieldCell', 'use_consumable SHIELD_LARGE': 'shieldBattery',
  'use_consumable PHOENIX_KIT': 'phoenixKit', jpeg: 'screenshot', screenshotDevNet: 'screenshot',
  screenshotDevNet_noRPROF: 'screenshot', in_spec_mode: 'privateMatchObserver',
  in_spec_altitude_lock: 'spectateAltitudeLock', in_spec_teamplayer1: 'spectatePlayer1', in_spec_teamplayer2: 'spectatePlayer2',
  in_spec_teamplayer3: 'spectatePlayer3', in_spec_next: 'spectateNextPlayer',
  in_spec_prev: 'spectatePreviousPlayer', in_spec_next_team: 'spectateNextTeam', in_spec_last_attacker: 'spectateLastAttacker',
  in_spec_prev_team: 'spectatePreviousTeam', in_spec_closest_player: 'spectateClosestPlayer',
  in_spec_closest_enemy: 'spectateClosestEnemy', in_spec_kill_leader: 'spectateKillLeader',
  in_spec_insert_annotation: 'spectateInsertAnnotation', in_spec_toggle_smoothcam: 'spectateSmoothCamera',
  in_spec_toggle_map_teamnames: 'spectateMapTeamNames', in_spec_toggle_obituary: 'spectateObituary',
  in_spec_chasecam_zoom_out: 'spectateChasecamZoomOut', in_spec_chasecam_zoom_in: 'spectateChasecamZoomIn',
  in_spec_toggle_ui: 'spectateToggleUi', in_spec_toggle_freecam: 'spectateFreecam',
  in_spec_toggle_chasecam_lock: 'spectateChasecamLock', toggle_obs_player_tags: 'observerPlayerTags',
  toggle_obs_highlight: 'observerHighlight', toggleconsole: 'toggleConsole',
  ingamemenu_activate: 'ingameMenu', miles_insert_bug_marker: 'milesBugMarker', toggle_obs_ring_survey: 'observerRingSurvey',
  roamingcam_togglerollmode: 'spectatorRollMode', '+spectatorRollClockwise': 'spectatorRollClockwise',
  '+spectatorRollCounterClockwise': 'spectatorRollCounterClockwise',
};

export default ApexGameSettings;
