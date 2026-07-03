import {type Component} from 'vue';
import type {EaDesktopUser} from './ea.ts';
import type {SteamUser} from './steam.ts';

export type ApexLauncherAccount =
  | { kind: 'steam'; user: SteamUser }
  | { kind: 'ea'; user: EaDesktopUser };

export type ApexVideoConfigValueType = 'boolean' | 'integer' | 'float' | 'string' | 'enum';

export type ApexVideoConfigUiType = 'windowMode' | 'brightness' | 'dvsFpsTarget' | 'csm';

/** 枚举档位：一个界面选项对应一组底层 key 的固定值组合 */
export interface ApexVideoConfigEnumOption {
  /** i18n key 或文本，如 'apexVideoConfig.options.high' */
  label: string;
  /** 该档位写入的底层 key -> 值 组合 */
  values: Record<string, string>;
  /** 超出 Apex 官方预设的档位(如 256超低)；选中后必须只读，否则启动游戏会被还原 */
  outOfPreset?: boolean;
}

export interface ApexVideoConfigField {
  identifier: string;
  valueType: ApexVideoConfigValueType;
  min?: number;
  max?: number;
  step?: number;
  hide_in_normal_filter?: boolean;
  /** 展开关联设置时不移入关联面板(仍保持主行内联) */
  hide_in_linked_panel?: boolean;
  inlineLabel?: string;
  /** boolean 自定义开/关值，默认 '1' / '0' */
  onValue?: string;
  offValue?: string;
}

export interface ApexVideoConfigImpl {
  /** 行主键；合并行可用合成 id(如 group.resolution) */
  identifier: string;
  name: string;
  description?: string;
  tip?: Component | null;
  is_new?: boolean;
  valueType?: ApexVideoConfigValueType;
  min?: number;
  max?: number;
  step?: number;
  /** NORMAL 过滤下隐藏 */
  hide_in_normal_filter?: boolean;
  /** 游戏内视频设置菜单无对应项，仅能改 videoconfig */
  not_in_game_settings?: boolean;
  /** 展开关联设置时 fields 仍保留在主行，不移入关联面板 */
  keep_inline_on_individual_input?: boolean;
  fields?: ApexVideoConfigField[];
  uiType?: ApexVideoConfigUiType;
  /** valueType === 'enum' 时的档位列表；uiType === 'csm' 时为阳光阴影细节档位 */
  options?: ApexVideoConfigEnumOption[];
  /** uiType === 'csm' 时的阳光阴影范围档位 */
  coverageOptions?: ApexVideoConfigEnumOption[];
  /** 单键自定义开/关值，默认 '1' / '0' */
  onValue?: string;
  offValue?: string;
}

export function isApexVideoConfigImpl(item: unknown): item is ApexVideoConfigImpl {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const obj = item as ApexVideoConfigImpl;
  return typeof obj.identifier === 'string' && typeof obj.name === 'string';
}

function collectOptionKeys(options: ApexVideoConfigEnumOption[] | undefined, keys: Set<string>) {
  if (!options?.length) return;
  for (const option of options) {
    for (const key of Object.keys(option.values)) {
      keys.add(key);
    }
  }
}

export function collectVideoConfigIdentifiers(row: ApexVideoConfigImpl): string[] {
  const keys = new Set<string>();

  if (row.valueType === 'enum' && row.options?.length) {
    collectOptionKeys(row.options, keys);
    if (row.fields?.length) {
      for (const f of row.fields) {
        keys.add(f.identifier);
      }
    }
    return Array.from(keys);
  }

  collectOptionKeys(row.options, keys);
  collectOptionKeys(row.coverageOptions, keys);

  if (row.fields?.length) {
    for (const f of row.fields) {
      keys.add(f.identifier);
    }
    return Array.from(keys);
  }

  if (keys.size > 0) {
    return Array.from(keys);
  }

  return [row.identifier];
}
