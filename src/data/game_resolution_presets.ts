export interface ResolutionPreset {
  title: string;
  width: number;
  height: number;
  value: string;
}

const common_resolutions: ResolutionPreset[] = [
  {title: '1280 x 720 (720P)', width: 1280, height: 720, value: '1280x720'},
  {title: '1920 x 1080 (1K)', width: 1920, height: 1080, value: '1920x1080'},
  {title: '2560 x 1440 (2K)', width: 2560, height: 1440, value: '2560x1440'},
  {title: '3440 x 1440 (2K 超宽)', width: 3440, height: 1440, value: '3440x1440'},
];

export const all_resolution_presets: ResolutionPreset[] = [
  ...common_resolutions,
  {title: '1600 x 900 (900P)', width: 1600, height: 900, value: '1600x900'},
  {title: '1680 x 1050 (1050P)', width: 1680, height: 1050, value: '1680x1050'},
  {title: '2560 x 1080 (2K 超宽)', width: 2560, height: 1080, value: '2560x1080'},
  {title: '3840 x 2160 (4K)', width: 3840, height: 2160, value: '3840x2160'},
];

export function sort_resolution_presets(list: ResolutionPreset[]): ResolutionPreset[] {
  return [...list].sort((a, b) => {
    if (a.width !== b.width) return a.width - b.width;
    return a.height - b.height;
  });
}
