import {useToast} from 'vue-toastification';
import ApexVideoConfig from '@/data/apex_video_config.ts';
import {
  collectVideoConfigIdentifiers,
  isApexVideoConfigImpl,
  type ApexVideoConfigImpl,
} from '@/types/apex.ts';
import {
  applyDvsRelatedConstraints,
  dvsTargetToConfig,
  type DvsConstraintTrigger,
} from '@/utils/apex_dvs.ts';
import {
  normalizeVideoConfigMap,
  videoConfigDisplayKey,
  videoConfigValueEquals,
} from '@/utils/game/apex_store_helpers.ts';
import type {ApexStoreThis, ApexVideoWindowMode} from './types.ts';
import type {ApexConfigMutationMeta} from '@/types/apex_history.ts';
import {createApexHistoryTransactionId} from '@/utils/game/apex_history.ts';
import {
  apexIsRunning,
  getApexConfigFile,
  getApexVideoConfig,
  getApexVideoconfigReadonly,
  setApexVideoConfig,
  setApexVideoconfigReadonly,
} from '@/ipc/commands.ts';

let syncing_dvs_constraints = false;

const video_config_value_equals = videoConfigValueEquals;
const video_config_display_key = videoConfigDisplayKey;
const normalize_video_config_map = normalizeVideoConfigMap;

export const apexVideoActions = {
  async load_apex_video_config(
    this: ApexStoreThis,
    options?: {silent?: boolean; force?: boolean},
  ) {
    if (this.is_video_config_loading && !options?.force) return;
    const generation = ++this.video_config_request_generation;
    this.is_video_config_loading = true;
    this.video_config_load_status = 'loading';
    this.video_config_load_error = null;
    try {
      let raw_map: Record<string, string> = {};
      try {
        raw_map = await getApexVideoConfig();
      } catch {
        // 兼容旧版后端：仅提供通用配置读取命令。
        raw_map = await getApexConfigFile({ kind: 'videoconfig' });
      }
      if (generation !== this.video_config_request_generation) return;
      const map = normalize_video_config_map(raw_map);
      this.video_config_values = {...map};
      this.original_video_config = {...map};
      this.video_config_loaded = true;
      this.video_config_loaded_key = 'machine';
      this.video_config_load_status = 'ready';
      this.reset_pending_scopes = this.reset_pending_scopes.filter(scope => scope !== 'video');
      await this.load_videoconfig_readonly();
    } catch (err) {
      if (generation !== this.video_config_request_generation) return;
      console.warn('load_apex_video_config failed', err);
      this.video_config_load_error = String(err);
      this.video_config_load_status = 'error';
      if (!options?.silent) {
        const toast = useToast();
        toast.warning('apex.videoConfigLoadFailed');
      }
    } finally {
      if (generation === this.video_config_request_generation) {
        this.is_video_config_loading = false;
      }
    }
  },

  start_video_config(this: ApexStoreThis, force = false) {
    if (!force && this.reset_pending_scopes.includes('video')) return;
    if (!force && this.video_config_loaded && Object.keys(this.video_config_values).length > 0) {
      return;
    }
    void this.load_apex_video_config();
  },

  set_video_config_value(this: ApexStoreThis, identifier: string, value: string) {
    this.video_config_values[identifier] = value;
    if (syncing_dvs_constraints) return;
    if (
      identifier === 'setting.dvs_enable'
      || identifier === 'setting.dvs_gpuframetime_min'
      || identifier === 'setting.dvs_gpuframetime_max'
    ) {
      this.sync_dvs_related_settings('dvs');
    }
  },

  sync_dvs_related_settings(this: ApexStoreThis, trigger: DvsConstraintTrigger) {
    if (syncing_dvs_constraints) return;
    syncing_dvs_constraints = true;
    try {
      applyDvsRelatedConstraints(
        (id) => this.get_video_config_value(id),
        (id, val) => {
          this.video_config_values[id] = val;
        },
        trigger,
      );
    } finally {
      syncing_dvs_constraints = false;
    }
  },

  set_dvs_fps_target(this: ApexStoreThis, target: number) {
    const { enable, min, max } = dvsTargetToConfig(target);
    syncing_dvs_constraints = true;
    try {
      this.video_config_values['setting.dvs_enable'] = enable;
      this.video_config_values['setting.dvs_gpuframetime_min'] = min;
      this.video_config_values['setting.dvs_gpuframetime_max'] = max;
    } finally {
      syncing_dvs_constraints = false;
    }
    this.sync_dvs_related_settings('dvs');
  },

  get_video_config_value(this: ApexStoreThis, identifier: string): string {
    const value = this.video_config_values[identifier]
      ?? this.video_config_values[`"${identifier}"`]
      ?? '';
    return value;
  },

  get_video_config_bool(this: ApexStoreThis, identifier: string, onValue = '1'): boolean {
    return video_config_value_equals(this.get_video_config_value(identifier), onValue);
  },

  set_video_config_bool(this: ApexStoreThis, identifier: string, enabled: boolean, onValue = '1', offValue = '0') {
    this.set_video_config_value(identifier, enabled ? onValue : offValue);
    if (identifier === 'setting.mat_antialias_mode') {
      this.sync_dvs_related_settings('antialias');
    }
  },

  /** enum：返回当前匹配的档位 index，无匹配返回 -1(界面显示为未选中) */
  get_video_config_enum(this: ApexStoreThis, item: ApexVideoConfigImpl): number {
    const options = item.options ?? [];
    for (let i = 0; i < options.length; i++) {
      const matched = Object.entries(options[i].values).every(([key, value]) =>
        video_config_value_equals(this.get_video_config_value(key), value),
      );
      if (matched) return i;
    }
    return -1;
  },

  /** enum：选中某档位，写入该档位的全部底层键值 */
  set_video_config_enum(this: ApexStoreThis, item: ApexVideoConfigImpl, optionIndex: number) {
    const option = item.options?.[optionIndex];
    if (!option) return;
    for (const [key, value] of Object.entries(option.values)) {
      this.set_video_config_value(key, value);
    }
    if (item.identifier === 'setting.mat_vsync_mode') {
      this.sync_dvs_related_settings('vsync');
    }
  },

  get_video_config_number(this: ApexStoreThis, identifier: string, fallback = 0): number {
    const raw = this.get_video_config_value(identifier);
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  },

  set_video_config_number(this: ApexStoreThis, identifier: string, value: number, valueType: 'integer' | 'float') {
    const text = valueType === 'integer' ? String(Math.round(value)) : String(value);
    this.set_video_config_value(identifier, text);
  },

  get_video_config_parameter_info(this: ApexStoreThis, item: ApexVideoConfigImpl): string {
    return collectVideoConfigIdentifiers(item)
      .map((id) => `${video_config_display_key(id)} ${this.get_video_config_value(id)}`)
      .join(' ');
  },

  get_video_config_window_mode(this: ApexStoreThis): ApexVideoWindowMode {
    const fullscreen = this.get_video_config_bool('setting.fullscreen');
    const borderless = this.get_video_config_bool('setting.nowindowborder');
    if (fullscreen && borderless) return 'fullscreen';
    if (borderless) return 'borderless';
    return 'windowed';
  },

  set_video_config_window_mode(this: ApexStoreThis, mode: ApexVideoWindowMode) {
    if (mode === 'fullscreen') {
      this.set_video_config_bool('setting.fullscreen', true);
      this.set_video_config_bool('setting.nowindowborder', true);
    } else if (mode === 'borderless') {
      this.set_video_config_bool('setting.fullscreen', false);
      this.set_video_config_bool('setting.nowindowborder', true);
    } else {
      this.set_video_config_bool('setting.fullscreen', false);
      this.set_video_config_bool('setting.nowindowborder', false);
    }
  },

  build_video_config_updates(this: ApexStoreThis): Record<string, string> {
    const updates: Record<string, string> = {};
    for (const row of ApexVideoConfig) {
      if (!isApexVideoConfigImpl(row)) continue;
      for (const id of collectVideoConfigIdentifiers(row)) {
        if (id in this.video_config_values) {
          updates[id] = this.video_config_values[id];
        }
      }
    }
    return updates;
  },

  async apply_apex_video_config(
    this: ApexStoreThis,
    options?: {silent?: boolean} & ApexConfigMutationMeta,
  ): Promise<boolean> {
    const toast = useToast();
    const running = await apexIsRunning().catch(() => false);
    if (running) {
      toast.error('apex.apexRunningVideoConfig');
      return false;
    }
    this.is_video_config_saving = true;
    try {
      const updates = this.build_video_config_updates();
      await setApexVideoConfig({
        updates,
        historySource: options?.historySource ?? 'apply',
        transactionId: options?.transactionId ?? createApexHistoryTransactionId(),
      });
      this.original_video_config = {...this.video_config_values};
      // 选用了 Apex 预设之外的档位时，强制只读，防止启动游戏被还原。
      if (this.has_out_of_preset_selection) {
        try {
          await this.set_videoconfig_readonly(true);
          toast.info('apex.outOfPresetAutoLocked');
        } catch (e) {
          console.warn('force readonly after apply failed', e);
        }
      } else {
        await this.load_videoconfig_readonly();
      }
      if (!options?.silent) {
        toast.success('toast.applyVideoConfigSuccess');
      }
      return true;
    } catch (err) {
      console.warn('apply_apex_video_config failed', err);
      if (!options?.silent) {
        toast.error('toast.applyVideoConfigError');
      }
      return false;
    } finally {
      this.is_video_config_saving = false;
    }
  },

  /** 读取 videoconfig.txt 当前只读状态 */
  async load_videoconfig_readonly(this: ApexStoreThis) {
    try {
      this.is_videoconfig_readonly = await getApexVideoconfigReadonly();
    } catch (e) {
      console.warn('load_videoconfig_readonly failed', e);
    }
  },

  /** 设置/取消 videoconfig.txt 只读 */
  async set_videoconfig_readonly(this: ApexStoreThis, locked: boolean): Promise<boolean> {
    const toast = useToast();
    this.is_videoconfig_readonly_busy = true;
    try {
      await setApexVideoconfigReadonly({locked});
      this.is_videoconfig_readonly = locked;
      return true;
    } catch (e) {
      console.warn('set_videoconfig_readonly failed', e);
      toast.error(String(e));
      return false;
    } finally {
      this.is_videoconfig_readonly_busy = false;
    }
  },
};
