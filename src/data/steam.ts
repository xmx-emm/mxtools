import {type Component} from 'vue';


export interface SteamLaunchOptionsImpl {
  name: string,
  description?: string,
  replace_numbers?: boolean,
  default_parameter?: string,
  parameter?: string | string[],
  parameters?: SteamLaunchOptionsImpl[],
  is_combination_parameters?: boolean,//是组合参数,仅input_mouse使用 TODO 简化属性
  identifier?: string,
  requirement?: string | string[] | (() => boolean), //需要的前置条件
  requirement_description?: string,
  is_new?: boolean,
  /** Apex：NORMAL 过滤模式下隐藏(与游戏内设置重复) */
  hide_in_normal_filter?: boolean,
  tip?: Component | null,
}

// 核心：类型守卫函数(运行时判断)
function isSteamLaunchOptionsImpl(item: unknown): item is SteamLaunchOptionsImpl {
  // 先判断基础类型：是对象且非 null
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  // 核心特征：必须包含 name 字段且 name 是字符串(必选属性)
  const obj = item as SteamLaunchOptionsImpl;
  return typeof obj.name === 'string';
}

export {
  isSteamLaunchOptionsImpl,
};
