import ApexLaunchOptionsConfig from '@/data/apex_launch_options_config.ts';
import {ASPECT_LETTERBOX_MIN_DEFAULT, ASPECT_LETTERBOX_THRESHOLD} from '@/data/presets/apex_quick_preset.ts';
import {isSteamLaunchOptionsImpl, SteamLaunchOptionsImpl} from '@/types/steam.ts';
import {
  match_apex_fps_by_fps_max,
  match_apex_fps_by_freq,
  is_apex_fps_unlimited,
  match_apex_height,
  match_apex_lobby_max_fps,
  match_apex_mat_letterbox_aspect_goal,
  match_apex_mat_letterbox_aspect_min,
  match_apex_mat_letterbox_aspect_threshold,
  match_apex_width,
} from '@/utils/game/apex.ts';

export type ParsedApexLaunchOptions = {
  selection: SteamLaunchOptionsImpl[];
  settingsPatch: Record<string, string>;
  width?: number;
  height?: number;
  lobby_max_fps?: number;
  mat_letterbox_aspect_min?: number;
  mat_letterbox_aspect_goal?: number;
  mat_letterbox_aspect_threshold?: number;
  fps?: number;
};

/** 将已加载的启动参数字符串解析为勾选项与相关数值(Steam VDF 与 EA INI 共用) */
export function parseApexLaunchOptionsString(start_launch_option: string): ParsedApexLaunchOptions {
  const selection: SteamLaunchOptionsImpl[] = [];
  const settingsPatch: Record<string, string> = {};
  let width: number | undefined;
  let height: number | undefined;
  let lobby_max_fps: number | undefined;
  let mat_letterbox_aspect_min: number | undefined;
  let mat_letterbox_aspect_goal: number | undefined;
  let mat_letterbox_aspect_threshold: number | undefined;
  let fps: number | undefined;

  ApexLaunchOptionsConfig.forEach((option) => {
    if (isSteamLaunchOptionsImpl(option)) {
      if (option?.identifier === 'forced_resolution') {
        const h_ok = start_launch_option.includes('-height');
        const w_ok = start_launch_option.includes('-width');
        if (h_ok && w_ok) {
          width = match_apex_width(start_launch_option) || 1920;
          height = match_apex_height(start_launch_option) || 1080;
          selection.push(option);
        }
      } else if (option?.identifier === 'reticle_color') {
        if (start_launch_option.includes('+reticle_color')) {
          selection.push(option);
        }
      } else if (option?.identifier === 'fov_scale') {
        if (start_launch_option.includes('fovScale')) {
          selection.push(option);
        }
      } else if (option?.identifier === 'skip_intro_animation') { //可以不用在这里处理?
        const is_dev = start_launch_option.includes('-dev');
        const is_novid = start_launch_option.includes('-novid');
        if (is_dev || is_novid) {
          selection.push(option);
        }
      } else if (option?.identifier === 'lobby_max_fps') {
        if (start_launch_option.includes('+lobby_max_fps')) {
          lobby_max_fps = match_apex_lobby_max_fps(start_launch_option) || 114;
          selection.push(option);
        }
      } else if (option?.identifier === 'letterbox_aspect') {
        if (start_launch_option.includes('letterbox_aspect')) {
          mat_letterbox_aspect_min = match_apex_mat_letterbox_aspect_min(start_launch_option) || ASPECT_LETTERBOX_MIN_DEFAULT;
          mat_letterbox_aspect_goal = match_apex_mat_letterbox_aspect_goal(start_launch_option) || 1.0;
          mat_letterbox_aspect_threshold = match_apex_mat_letterbox_aspect_threshold(start_launch_option) || ASPECT_LETTERBOX_THRESHOLD;
          selection.push(option);
        }
      } else if (option?.identifier === 'input_mouse') {
        if (option?.parameters) {
          for (const value of option.parameters) {
            if (typeof value?.parameter === 'string' && start_launch_option.includes(value.parameter)) {
              selection.push(option);
              break;
            }
          }
        }
      } else if (option?.identifier === 'fps') {
        const has_fps_max = /(?:^|\s)\+fps_max\s/.test(start_launch_option);
        const has_freq = /(?:^|\s)-freq\s/.test(start_launch_option);
        if (has_fps_max || has_freq) {
          selection.push(option);
          if (is_apex_fps_unlimited(start_launch_option)) {
            settingsPatch['fps'] = '+fps_max unlimited';
          } else {
            const parsed =
              match_apex_fps_by_fps_max(start_launch_option)
              ?? match_apex_fps_by_freq(start_launch_option);
            if (parsed !== null) {
              fps = parsed;
            }
            settingsPatch['fps'] = '-freq X +fps_max X';
          }
        }
      } else if (option?.parameter) {
        if (typeof option?.parameter === 'string') {
          if (start_launch_option.includes(option?.parameter)) {
            selection.push(option);
          }
        } else if (typeof option?.parameter === 'object') {
          const paramValues = Array.isArray(option.parameter)
            ? option.parameter
            : Object.values(option.parameter);
          for (const value of paramValues) {
            if (typeof value === 'string' && start_launch_option.includes(value)) {
              selection.push(option);
              break;
            }
          }
        }
      } else if (option?.parameters) {//只有 window和miles_language需要过这里
        for (const value of option.parameters) {
          if (value?.parameter && typeof value?.parameter === 'string' && start_launch_option.includes(value.parameter)) {
            selection.push(option);
            if (option?.identifier) {
              const patchValue = value.default_parameter || value.parameter || option.default_parameter;
              if (patchValue) {
                settingsPatch[option.identifier] = patchValue;
              }
            }
            break;
          }
        }
      }
    }
  });

  return {
    selection,
    settingsPatch,
    width,
    height,
    lobby_max_fps,
    mat_letterbox_aspect_min,
    mat_letterbox_aspect_goal,
    mat_letterbox_aspect_threshold,
    fps,
  };
}
