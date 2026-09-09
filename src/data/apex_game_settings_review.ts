import type {ApexGameSettingsFile} from '@/types/apex_game_settings.ts';

export interface ApexGameSettingReviewNote {
  descriptionKey: string;
}

// Read-only compatibility notes for settings without a current editable menu.
export const apexGameSettingsReviewNotes: Readonly<Partial<Record<
  `${ApexGameSettingsFile}:${string}`, ApexGameSettingReviewNote
>>> = {
  'profile:cl_deathhints_enabled': {
    descriptionKey: 'apexGameSettings.reviewNotes.deathHints',
  },
  'profile:cl_safearea': {
    descriptionKey: 'apexGameSettings.reviewNotes.safeArea',
  },
  'profile:hud_setting_accolades_hudState': {
    descriptionKey: 'apexGameSettings.reviewNotes.accoladesHud',
  },
  'profile:hud_setting_accolades_tier_filter': {
    descriptionKey: 'apexGameSettings.reviewNotes.accoladesTier',
  },
  'profile:hud_setting_adsDof': {
    descriptionKey: 'apexGameSettings.reviewNotes.adsDof',
  },
  'profile:hud_setting_aind': {
    descriptionKey: 'apexGameSettings.reviewNotes.aind',
  },
  'profile:hud_setting_compactOverHeadNames': {
    descriptionKey: 'apexGameSettings.reviewNotes.compactNames',
  },
  'profile:hud_setting_pingDoubleTapEnemy': {
    descriptionKey: 'apexGameSettings.reviewNotes.doubleTapPing',
  },
  'profile:hud_setting_showCallsigns': {
    descriptionKey: 'apexGameSettings.reviewNotes.callsigns',
  },
  'profile:hud_setting_showLevelUp': {
    descriptionKey: 'apexGameSettings.reviewNotes.levelUp',
  },
  'profile:hud_setting_showTeamNamesOnMap': {
    descriptionKey: 'apexGameSettings.reviewNotes.mapTeamNames',
  },
  'profile:hud_setting_showWeaponFlyouts': {
    descriptionKey: 'apexGameSettings.reviewNotes.weaponFlyouts',
  },
  'profile:hudchat_visibility': {
    descriptionKey: 'apexGameSettings.reviewNotes.chatVisibility',
  },
  'profile:party_color_enabled': {
    descriptionKey: 'apexGameSettings.reviewNotes.partyColors',
  },
  'profile:rankedplay_display_enabled': {
    descriptionKey: 'apexGameSettings.reviewNotes.rankedDisplay',
  },
  'profile:rankedplay_voice_enabled': {
    descriptionKey: 'apexGameSettings.reviewNotes.rankedVoice',
  },
  'profile:sound_musicReduced': {
    descriptionKey: 'apexGameSettings.reviewNotes.reducedMusic',
  },
  'profile:ziprail_roll_strength': {
    descriptionKey: 'apexGameSettings.reviewNotes.ziprailRoll',
  },
};
