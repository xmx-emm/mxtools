import {type Component} from 'vue';

export interface SteamUser {
  name: string;
  id: string;
  /** 默认头像 fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb */
  avatar: string;
  /** "c:/program files (x86)/steam\\userdata\\xxxxx\\config\\localconfig.vdf" */
  config_path: string;
}

export interface SteamLaunchOptionsImpl {
  name: string;
  description?: string;
  replace_numbers?: boolean;
  default_parameter?: string;
  parameter?: string | string[];
  parameters?: SteamLaunchOptionsImpl[];
  /** 是组合参input_mouse 使用 */
  is_combination_parameters?: boolean;
  identifier?: string;
  requirement?: string | string[] | (() => boolean);
  requirement_description?: string;
  is_new?: boolean;
  /** Apex：NORMAL 过滤模式下隐与游戏内设置重复) */
  hide_in_normal_filter?: boolean;
  tip?: Component | null;
}

export function isSteamLaunchOptionsImpl(item: unknown): item is SteamLaunchOptionsImpl {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const obj = item as SteamLaunchOptionsImpl;
  return typeof obj.name === 'string';
}
