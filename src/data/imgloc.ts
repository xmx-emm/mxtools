const APEX_FOV_110_IMG_URL = 'https://i.imgs.ovh/2025/12/31/C35v0e.jpeg';
const APEX_FOV_120_IMG_URL = 'https://i.imgs.ovh/2025/12/31/C35Fza.jpeg';
const APEX_SHOW_POS_IMG_URL = 'https://i.imgs.ovh/2026/01/06/yCUbge.png';
const APEX_SHOW_FPS_IMG_URL = 'https://i.imgs.ovh/2026/01/06/yCUnW9.png';
const APEX_HIGH_PRIORITY_IMG_URL = 'https://i.imgs.ovh/2026/01/07/yOtM7C.png';
const APEX_STEAM_LANGUAGE_IMG_URL = 'https://i.imgs.ovh/2026/01/08/yZZjAn.png';
const APEX_FORCED_RESOLUTION_ERROR_IMG_URL = 'https://i.imgs.ovh/2026/02/27/yiwjxX.png';

//Apex 手动下载语音包
const APEX_STEAM_SELECT_LANGUAGE_IMG_URL = 'https://i.imgs.ovh/2026/01/09/ya2JjC.png';
const APEX_STEAM_DOWNLOAD_IMG_URL = 'https://i.imgs.ovh/2026/01/09/yaPctN.png';
const APEX_EA_SELECT_LANGUAGE_IMG_URL = 'https://i.imgs.ovh/2026/04/09/ZJVVsL.png';
const XMX_AVATAR_IMG_URL = 'https://i.imgs.ovh/2026/01/06/yCP8yQ.png';
const APEX_AIM_PREVIEW= "https://i.imgs.ovh/2026/04/13/ZKptkx.png"

// Apex 机瞄启动项对比
const APEX_LIGHT_ROUNDS_PREVIEW= "https://i.imgs.ovh/2026/04/13/ZKp9pc.png"
const APEX_HEAVY_ROUNDS_PREVIEW= "https://i.imgs.ovh/2026/04/13/ZKperm.png"
const APEX_ENERGY_AMMO_PREVIEW= "https://i.imgs.ovh/2026/04/13/ZKp2Vg.png"
const APEX_SHOTGUN_PREVIEW= "https://i.imgs.ovh/2026/04/13/ZKpK4M.png"
const APEX_SNIPER_RIFLE_PREVIEW= "https://i.imgs.ovh/2026/04/13/ZKpss9.png"
const APEX_LOOT_BIN_WEAPON_PREVIEW= "https://i.imgs.ovh/2026/04/13/ZKpHn0.png"

/** 机瞄透明效果预览(与启动项说明对应) */
const APEX_AIM_PREVIEW_ITEMS = [
  { labelKey: 'apexTips.reticleColor.previewLabels.aim', src: APEX_AIM_PREVIEW },
  { labelKey: 'apexTips.reticleColor.previewLabels.lightRounds', src: APEX_LIGHT_ROUNDS_PREVIEW },
  { labelKey: 'apexTips.reticleColor.previewLabels.heavyRounds', src: APEX_HEAVY_ROUNDS_PREVIEW },
  { labelKey: 'apexTips.reticleColor.previewLabels.energyAmmo', src: APEX_ENERGY_AMMO_PREVIEW },
  { labelKey: 'apexTips.reticleColor.previewLabels.shotgun', src: APEX_SHOTGUN_PREVIEW },
  { labelKey: 'apexTips.reticleColor.previewLabels.sniper', src: APEX_SNIPER_RIFLE_PREVIEW },
  { labelKey: 'apexTips.reticleColor.previewLabels.carePackageWeapon', src: APEX_LOOT_BIN_WEAPON_PREVIEW },
] as const

export {
  APEX_FOV_110_IMG_URL,
  APEX_FOV_120_IMG_URL,
  APEX_SHOW_POS_IMG_URL,
  APEX_SHOW_FPS_IMG_URL,
  APEX_HIGH_PRIORITY_IMG_URL,
  APEX_STEAM_LANGUAGE_IMG_URL,
  APEX_FORCED_RESOLUTION_ERROR_IMG_URL,

  APEX_STEAM_SELECT_LANGUAGE_IMG_URL,
  APEX_STEAM_DOWNLOAD_IMG_URL,
  APEX_EA_SELECT_LANGUAGE_IMG_URL,

  APEX_AIM_PREVIEW_ITEMS,

  XMX_AVATAR_IMG_URL
};
