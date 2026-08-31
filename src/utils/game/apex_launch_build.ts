import type {ApexLauncherAccount} from '@/types/apex.ts';
import type {SteamLaunchOptionsImpl} from '@/types/steam.ts';

export type ApexLaunchBuildInput = {
  options_selection: SteamLaunchOptionsImpl[];
  settings_config: Record<string, string>;
  custom_launch_options?: string;
  lobby_max_fps: number;
  width: number;
  height: number;
  mat_letterbox_aspect_min: number;
  mat_letterbox_aspect_goal: number;
  mat_letterbox_aspect_threshold: number;
  fps: number;
  activeAcc: ApexLauncherAccount | null;
};

/** 将勾选项组合为最终启动参数字符串 */
export function buildApexLaunchOptionsString(input: ApexLaunchBuildInput): string {
  const items: string[] = [];
  const {
    options_selection,
    settings_config,
    custom_launch_options,
    lobby_max_fps,
    width,
    height,
    mat_letterbox_aspect_min,
    mat_letterbox_aspect_goal,
    mat_letterbox_aspect_threshold,
    fps,
    activeAcc,
  } = input;
  const is_ea = activeAcc?.kind === 'ea';

  options_selection.forEach((item: SteamLaunchOptionsImpl) => {
    if (item?.identifier === 'lobby_max_fps') { //大厅fps
      items.push(`+lobby_max_fps ${lobby_max_fps}`);
    } else if (item?.identifier === 'reticle_color') {//准星颜色
      if (activeAcc) {
        if (is_ea) {
          items.push(`+reticle_color 2147483648-2147483648-2147483648`);
        } else {
          items.push('+reticle_color "2147483648 2147483648 2147483648"');
        }
      }
    } else if (item?.identifier === 'fov_scale') {//Fov缩放
      if (activeAcc) {
        if (is_ea) {
          items.push(`+cl_fovScale 1.7`);
        } else {
          items.push('+cl_fovScale "1.7"');
        }
      }
    } else if (item?.identifier === 'skip_intro_animation') {//跳过开场动画
      items.push('-novid');
      items.push('-dev');
    } else if (item?.identifier === 'forced_resolution') {//强制分辨率
      items.push(`-width ${width} -height ${height}`);
    } else if (item?.identifier === 'letterbox_aspect') {//宽高比
      items.push(`+mat_letterbox_aspect_min ${mat_letterbox_aspect_min}`);
      items.push(`+mat_letterbox_aspect_goal ${mat_letterbox_aspect_goal}`);
      items.push(`+mat_letterbox_aspect_threshold ${mat_letterbox_aspect_threshold}`);
    } else if (item?.parameter) {
      if (typeof item.parameter === 'string') {
        items.push(item.parameter);
      } else if (typeof item?.default_parameter === 'string') {
        items.push(item.default_parameter);
      } else {
        // parameter: ['-novid', '-dev']
      }
    } else if (item?.parameters) {//多个参数
      if (item.is_combination_parameters) {//组合参数 暂时只有input_mouse用
        const value = item
          .parameters
          .map((item: SteamLaunchOptionsImpl) => item?.parameter)
          .join(' ');
        items.push(value);
      } else if (item?.identifier) {
        const value = settings_config[item.identifier];
        if (item.identifier === 'fps' && typeof value === 'string' && value.includes('X')) {
          const fpsText = fps.toString();
          items.push(`-freq ${fpsText}`);
          items.push(`+fps_max ${fpsText}`);
        } else {
          items.push(value);
        }
      }
    }
  });
  const custom = custom_launch_options?.trim();
  if (custom) items.push(custom);
  return items.join(' ');
}
