import ApexLaunchOptionsConfig from '@/data/apex_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, SteamLaunchOptionsImpl} from '@/types/steam.ts';
import {
  hasClaimedApexLaunchParameter,
  readApexLaunchOptions,
} from '@/utils/game/apex_custom_launch_options.ts';

export type ParsedApexLaunchOptions = {
  selection: SteamLaunchOptionsImpl[];
  settingsPatch: Record<string, string>;
  customLaunchOptions: string;
  width?: number;
  height?: number;
  lobby_max_fps?: number;
  mat_letterbox_aspect_min?: number;
  mat_letterbox_aspect_goal?: number;
  fps?: number;
};

function parameterIsClaimed(
  parameter: SteamLaunchOptionsImpl['parameter'],
  read: ReturnType<typeof readApexLaunchOptions>,
): boolean {
  if (typeof parameter === 'string') {
    return hasClaimedApexLaunchParameter(read, parameter);
  }
  if (!Array.isArray(parameter)) return false;
  return parameter.some(value => hasClaimedApexLaunchParameter(read, value));
}

/**
 * Parse a launcher value once, then use its claimed token ranges for both
 * catalog selection and the custom-command remainder. This keeps a command
 * such as `+exec "cfg/+fps_max 144.cfg"` out of the FPS parser.
 */
export function parseApexLaunchOptionsString(start_launch_option: string): ParsedApexLaunchOptions {
  const read = readApexLaunchOptions(start_launch_option);
  const selection: SteamLaunchOptionsImpl[] = [];
  const settingsPatch: Record<string, string> = {};
  let width: number | undefined;
  let height: number | undefined;
  let lobby_max_fps: number | undefined;
  let mat_letterbox_aspect_min: number | undefined;
  let mat_letterbox_aspect_goal: number | undefined;
  let fps: number | undefined;

  for (const option of ApexLaunchOptionsConfig) {
    if (!isSteamLaunchOptionsImpl(option)) continue;

    if (option.identifier === 'reticle_color') {
      // Steam's quoted RGB and EA's hyphenated RGB represent the same choice.
      // The catalog contains only Steam spelling; use the classifier's result.
      if (read.simplifiedReticle) selection.push(option);
      continue;
    }

    if (option.identifier === 'window') {
      if (read.window) {
        selection.push(option);
        settingsPatch.window = read.window;
      }
      continue;
    }

    if (option.identifier === 'forced_resolution') {
      if (read.width !== undefined && read.height !== undefined) {
        width = read.width;
        height = read.height;
        selection.push(option);
      }
      continue;
    }

    if (option.identifier === 'lobby_max_fps') {
      if (read.lobbyMaxFps !== undefined) {
        lobby_max_fps = read.lobbyMaxFps;
        selection.push(option);
      }
      continue;
    }

    if (option.identifier === 'letterbox_aspect') {
      if (read.letterbox) {
        // Omitted values inherit game defaults, not quick-preset preferences.
        mat_letterbox_aspect_min = Math.min(2, Math.max(1, read.letterbox.min ?? 1.59));
        mat_letterbox_aspect_goal = read.letterbox.goal ?? 1.6;
        selection.push(option);
      }
      continue;
    }

    if (option.identifier === 'fps') {
      if (read.fps) {
        selection.push(option);
        if (read.fps.unlimited) {
          settingsPatch.fps = '+fps_max unlimited';
        } else {
          fps = read.fps.value;
          // -freq 已从当前游戏构建删除,锁帧只写 +fps_max
          settingsPatch.fps = '+fps_max X';
        }
      }
      continue;
    }

    if (parameterIsClaimed(option.parameter, read)) {
      selection.push(option);
      continue;
    }

    if (!option.parameters) continue;
    for (const parameter of option.parameters) {
      if (!parameterIsClaimed(parameter.parameter, read)) continue;
      selection.push(option);
      if (option.identifier) {
        const patchValue = parameter.default_parameter
          || (typeof parameter.parameter === 'string' ? parameter.parameter : option.default_parameter);
        if (patchValue) settingsPatch[option.identifier] = patchValue;
      }
      break;
    }
  }

  return {
    selection,
    settingsPatch,
    customLaunchOptions: read.customLaunchOptions,
    width,
    height,
    lobby_max_fps,
    mat_letterbox_aspect_min,
    mat_letterbox_aspect_goal,
    fps,
  };
}
