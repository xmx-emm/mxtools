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
  field('damageFeedback', 'profile', 'damage_indicator_style_pilot', 'gameplay', 'enum', {
    options: describedOptions('damageFeedback', ['1', 'twoDimensional'], ['2', 'threeDimensional'], ['3', 'both']),
  }),
  field('reticleDamageFeedback', 'profile', 'hud_setting_damageIndicatorStyle', 'gameplay', 'enum', {
    options: describedOptions('reticleDamageFeedback', ['0', 'off'], ['1', 'reticleX'], ['2', 'reticleXShield']),
  }),
  field('damageTextStyle', 'profile', 'hud_setting_damageTextStyle', 'gameplay', 'enum', {options: zeroToThree}),
  field('reticleColor', 'profile', 'reticle_color', 'gameplay', 'rgb'),
  field('laserSightCustom', 'profile', 'laserSightColorCustomized', 'gameplay', 'enum', {
    options: options(['0', 'default'], ['1', 'custom']),
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
  field('interactionPromptStyle', 'profile', 'player_use_prompt_enabled', 'gameplay', 'enum', {
    options: options(['0', 'compact'], ['1', 'default']),
  }),
  field('tutorialSystem', 'profile', 'player_setting_tutorialization', 'gameplay', 'enum', {
    options: describedOptions('tutorialSystem', ['0', 'off'], ['1', 'automatic'], ['2', 'on']),
  }),
  bool('crossPlay', 'profile', 'CrossPlay_user_optin', 'gameplay'),
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
  bool('lightingEffects', 'settings', 'chroma_enable', 'aiming'),
  field('mouseSensitivity', 'settings', 'mouse_sensitivity', 'aiming', 'number', {min: 0.01, max: 20, step: 0.01}),
  field('mouseAdsMultiplier', 'settings', 'mouse_ads_multiplier', 'aiming', 'number', {
    min: 0.1,
    max: 10,
    step: 0.05,
    readKey: 'mouse_zoomed_sensitivity_scalar_0',
    writeKeys: Array.from({length: 8}, (_, index) => `mouse_zoomed_sensitivity_scalar_${index}`),
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

  bool('controllerCustom', 'profile', 'gamepad_custom_enabled', 'controller'),
  field('controllerAimSpeed', 'profile', 'gamepad_aim_speed', 'controller', 'number', {min: 0, max: 8, step: 1}),
  field('controllerButtonLayout', 'profile', 'gamepad_button_layout', 'controller', 'enum', {
    options: describedOptions('controllerButtonLayout',
      ['4', 'default'], ['5', 'buttonJumper'], ['6', 'buttonPuncher'], ['0', 'evolved'],
      ['1', 'grenadier'], ['2', 'ninja'], ['3', 'custom'],
    ),
  }),
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

  bool('buttonHints', 'profile', 'hud_setting_showButtonHints', 'hud'),
  bool('hopUpPopup', 'profile', 'hud_setting_showHopUpPopUp', 'hud'),
  bool('obituary', 'profile', 'hud_setting_showObituary', 'hud'),
  bool('rotateMinimap', 'profile', 'hud_setting_minimapRotate', 'hud'),
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

export const apexBindingCommandLabels: Record<string, string> = {
  weaponSelectPrimary0: 'weapon1', weaponSelectPrimary1: 'weapon2', weaponSelectPrimary2: 'holster',
  '+scriptCommand4': 'useSelectedMedical', '+scriptCommand3': 'toggleFireMode', '+scriptcommand3': 'toggleFireMode',
  '+scriptCommand5': 'characterUtility', '+scriptCommand6': 'survivalItem', '+dodge': 'movementAbility',
  '+moveleft': 'moveLeft', '+moveright': 'moveRight',
  '+forward': 'moveForward', '+backward': 'moveBack', '+toggle_duck': 'toggleCrouch',
  '+duck': 'holdCrouch', '+speed': 'sprintToggleZoom', '+jump': 'jump', '+use; +use_long': 'interact',
  '+use_alt': 'otherInteract', '+reload': 'reload', '+attack': 'attack', '+zoom': 'holdAim',
  '+toggle_zoom': 'toggleAim', '+weaponCycle': 'cycleWeapon', '+melee': 'melee', '+ping': 'ping',
  'ping_specific_type ENEMY': 'enemyPing', toggle_inventory: 'inventory', toggle_map: 'map',
  weapon_inspect: 'inspect', weaponSelectOrdnance: 'grenade', '+offhand1': 'tactical',
  '+offhand4': 'ultimate', '+pushtotalk': 'voiceChat', say_team: 'teamChat', chat_wheel: 'legendWheel',
  'use_consumable HEALTH_SMALL': 'syringe', 'use_consumable HEALTH_LARGE': 'medKit',
  'use_consumable SHIELD_SMALL': 'shieldCell', 'use_consumable SHIELD_LARGE': 'shieldBattery',
  'use_consumable PHOENIX_KIT': 'phoenixKit', jpeg: 'screenshot', screenshotDevNet: 'screenshot',
  screenshotDevNet_noRPROF: 'screenshot', in_spec_mode: 'privateMatchObserver',
  in_spec_teamplayer1: 'spectatePlayer1', in_spec_teamplayer2: 'spectatePlayer2',
  in_spec_teamplayer3: 'spectatePlayer3', in_spec_next: 'spectateNextPlayer',
  in_spec_prev: 'spectatePreviousPlayer', in_spec_next_team: 'spectateNextTeam',
  in_spec_prev_team: 'spectatePreviousTeam', in_spec_closest_player: 'spectateClosestPlayer',
  in_spec_closest_enemy: 'spectateClosestEnemy', in_spec_kill_leader: 'spectateKillLeader',
};

export default ApexGameSettings;
