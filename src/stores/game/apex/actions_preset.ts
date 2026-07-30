import {useToast} from 'vue-toastification';
import {
  ASPECT_LETTERBOX_MIN_DEFAULT,
  ASPECT_LETTERBOX_THRESHOLD,
  findGraphicsQualityPreset,
  quickPresetGameSettingToggles,
} from '@/data/presets/apex_quick_preset.ts';
import type {ApexQuickPresetSelection, PrimaryDisplayInfo} from '@/types/apex_quick_preset.ts';
import {
  applyQuickPresetLaunchOptions,
  clampFpsCap,
  applyQuickPresetVideoOptions,
  buildVideoResolutionValues,
  uncheckedQuickPresetVideoKeys,
  resolveGameResolution,
} from '@/utils/game/apex_quick_preset.ts';
import {
  ensureOptionInSelection,
  removeOptionFromSelection,
} from '@/utils/game/apex_store_helpers.ts';
import type {ApexStoreThis} from './types.ts';
import {
  createApexHistoryTransactionId,
  toApexLauncherRef,
} from '@/utils/game/apex_history.ts';
import {normalizeVideoConfigMap} from '@/utils/game/apex_store_helpers.ts';
import {apexIsRunning, mutateApexConfig} from '@/ipc/commands.ts';
import {
  adoptApexGameSettingsReport,
  buildApexGameSettingsMutation,
} from './actions_settings.ts';

const ensure_option_in_selection = ensureOptionInSelection;
const remove_option_from_selection = removeOptionFromSelection;

function sameBindingCommand(actual: string, expected: string): boolean {
  return actual.toLowerCase() === expected.toLowerCase();
}

function clearPresetBindingInput(
  store: ApexStoreThis,
  command: string,
  inputs: readonly string[],
) {
  const wanted = new Set(inputs.map(input => input.toUpperCase()));
  for (const binding of store.game_settings_bindings) {
    if (binding.editable
      && sameBindingCommand(binding.command, command)
      && wanted.has(binding.input.toUpperCase())) {
      store.set_game_binding_slot(
        binding.templateId ?? binding.id,
        binding.id,
        '',
        binding.context === 1 ? 1 : 0,
      );
    }
  }
}

function setPresetBindingInput(
  store: ApexStoreThis,
  command: string,
  input: string,
  context: 0 | 1,
) {
  const normalizedInput = input.toUpperCase();
  for (const binding of store.game_settings_bindings) {
    if (!binding.input || binding.input.toUpperCase() !== normalizedInput) continue;
    if (sameBindingCommand(binding.command, command) && binding.context === context) return;
    store.set_game_binding_slot(
      binding.templateId ?? binding.id,
      binding.id,
      '',
      binding.context === 1 ? 1 : 0,
    );
  }

  const actionBindings = store.game_settings_bindings.filter(binding => (
    binding.editable
    && sameBindingCommand(binding.command, command)
    && !binding.heldCommand
  ));
  const active = actionBindings.filter(binding => binding.input);
  if (active.length >= 2) {
    const replace = active[1];
    store.set_game_binding_slot(
      replace.templateId ?? replace.id,
      replace.id,
      '',
      replace.context === 1 ? 1 : 0,
    );
  }
  const template = actionBindings.find(binding => !binding.templateId) ?? actionBindings[0];
  if (!template) {
    throw new Error(`apex.gameSettings.errors.bindingMissing: ${command}`);
  }
  store.set_game_binding_slot(template.id, null, input, context);
}

function prepareQuickPresetGameSettings(
  store: ApexStoreThis,
  enabledOptions: Record<string, boolean>,
) {
  for (const [id, key, value] of quickPresetGameSettingToggles) {
    if (enabledOptions[id] && key in store.game_settings_values.profile) {
      store.set_game_setting_value('profile', key, value);
    }
  }

  clearPresetBindingInput(store, '+toggle_zoom', ['MOUSE2']);
  clearPresetBindingInput(store, '+weaponCycle', ['MWHEELUP', 'MWHEELDOWN']);
  setPresetBindingInput(store, '+zoom', 'MOUSE2', 0);
  setPresetBindingInput(store, '+forward', 'MWHEELUP', 1);
  setPresetBindingInput(store, '+jump', 'MWHEELDOWN', 1);
}

export const apexPresetActions = {
  open_quick_preset_window() {
    void import('@/utils/windows.ts')
      .then(({openApexQuickPresetWindow}) => openApexQuickPresetWindow())
      .catch((error) => console.warn('open apex quick preset failed', error));
  },

  open_apex_q_dialog(this: ApexStoreThis) {
    void import('@/utils/windows.ts')
      .then(({openApexQWindow}) => openApexQWindow())
      .catch((error) => console.warn('open apex-q preset failed', error));
  },

  close_apex_q_dialog(this: ApexStoreThis) {
    this.apex_q_dialog = false;
  },

  set_quick_preset_display(this: ApexStoreThis, info: PrimaryDisplayInfo | null) {
    this.quick_preset_display = info;
  },

  /** 将快速预设选项写入内存状态(启动项 + 视频配置)，不落盘 */
  prepare_quick_preset(this: ApexStoreThis, screen: PrimaryDisplayInfo, selection: ApexQuickPresetSelection) {
    const fpsCap = clampFpsCap(selection.fpsCap);
    this.fps = fpsCap;
    this.lobby_max_fps = fpsCap;

    if (selection.enableResolutionPreset) {
      const { width, height } = resolveGameResolution(
        screen,
        selection.aspectValue,
        selection.lockAxis,
      );
      this.width = width;
      this.height = height;
      this.mat_letterbox_aspect_min = ASPECT_LETTERBOX_MIN_DEFAULT;
      this.mat_letterbox_aspect_goal = selection.aspectValue;
      this.mat_letterbox_aspect_threshold = ASPECT_LETTERBOX_THRESHOLD;
      ensure_option_in_selection(this.options_selection, 'forced_resolution');
      ensure_option_in_selection(this.options_selection, 'letterbox_aspect');
      for (const [key, value] of Object.entries(buildVideoResolutionValues(width, height))) {
        this.set_video_config_value(key, value);
      }
    }

    ensure_option_in_selection(this.options_selection, 'fps');
    ensure_option_in_selection(this.options_selection, 'lobby_max_fps');
    applyQuickPresetLaunchOptions(this.options_selection, selection.launchOptions);

    if (selection.enableSimplifiedReticle) {
      ensure_option_in_selection(this.options_selection, 'reticle_color');
    } else {
      remove_option_from_selection(this.options_selection, 'reticle_color');
    }
    this.settings_config['fps'] = '-freq X +fps_max X';

    const skip_video_keys = uncheckedQuickPresetVideoKeys(selection.videoOptions);

    if (selection.enableGraphicsPreset) {
      const gfx = findGraphicsQualityPreset(selection.graphicsPresetId);
      if (!gfx) {
        throw new Error('GRAPHICS_PRESET_NOT_FOUND');
      }
      for (const [key, value] of Object.entries(gfx.values)) {
        if (skip_video_keys.has(key)) continue;
        this.set_video_config_value(key, value);
      }
    }
    applyQuickPresetVideoOptions(
      (key, value) => this.set_video_config_value(key, value),
      selection.videoOptions,
    );
    prepareQuickPresetGameSettings(this, selection.gameSettingOptions);
  },

  /**
   * 快速预设联合应用：先确保配置已加载，再写启动项与 videoconfig。
   * 调用方需自行处理 Steam/EA 运行中的提示。
   */
  /** 落盘前确保启动项与视频配置已从磁盘加载(避免 load 覆盖 prepare 写入的值) */
  async ensure_configs_loaded_for_preset(this: ApexStoreThis): Promise<void> {
    const key = this.launcher_selection_key;
    if (!key || this.launch_loaded_for_key !== key) {
      const ok = await this.start_load_apex_launch_options_data();
      if (!ok) {
        throw new Error('LAUNCH_OPTIONS_LOAD_FAILED');
      }
      this.original_launch_options = this.launch_options;
      this.launch_loaded_for_key = this.launcher_selection_key;
    }
    if (Object.keys(this.video_config_values).length === 0) {
      await this.load_apex_video_config();
    }
    if (!this.game_settings_report) {
      await this.load_apex_game_settings();
    }
    if (!this.game_settings_report) {
      throw new Error('apex.gameSettings.errors.readFailed');
    }
  },

  /** 快速预设落盘(调用前须 ensure_configs_loaded + prepare_quick_preset) */
  async apply_quick_preset_persist(this: ApexStoreThis): Promise<boolean> {
    const toast = useToast();
    const transactionId = createApexHistoryTransactionId();
    this.quick_preset_applying = true;
    try {
      if (!await this.check_miles_language()) {
        toast.error('toast.milesLanguageNotFound');
        return false;
      }

      const apexRunning = await apexIsRunning().catch(() => false);
      if (apexRunning) {
        toast.error('apex.apexRunningVideoConfig');
        return false;
      }

      const account = this.active_apex_account;
      if (!account) throw new Error('NO_LAUNCHER_ACCOUNT');
      const gameSettingsMutation = buildApexGameSettingsMutation(this);
      const gameSettings = gameSettingsMutation
        && (Object.keys(gameSettingsMutation.settingsUpdates).length
          || Object.keys(gameSettingsMutation.profileUpdates).length
          || gameSettingsMutation.bindingMutations.length)
        ? gameSettingsMutation
        : null;
      const result = await mutateApexConfig({request: {
        source: 'quickPreset',
        transactionId,
        launcher: toApexLauncherRef(account),
        launchOptions: this.launch_options,
        videoUpdates: this.build_video_config_updates(),
        gameSettings,
      }});
      this.original_launch_options = result.launchOptions ?? this.launch_options;
      this.launch_loaded_for_key = this.launcher_selection_key;
      this.launch_load_status = 'ready';
      if (result.videoConfig) {
        const values = normalizeVideoConfigMap(result.videoConfig);
        this.video_config_values = {...values};
        this.original_video_config = {...values};
        this.video_config_loaded = true;
        this.video_config_loaded_key = 'machine';
        this.video_config_load_status = 'ready';
      } else {
        this.original_video_config = {...this.video_config_values};
      }
      if (result.gameSettingsReport) {
        adoptApexGameSettingsReport(this, result.gameSettingsReport);
      }
      if (this.has_out_of_preset_selection) {
        await this.set_videoconfig_readonly(true);
      } else {
        await this.load_videoconfig_readonly();
      }
      toast.success('apexQuickPreset.applySuccess');
      return true;
    } catch (err) {
      console.warn('apply_quick_preset_persist failed', err);
      const detail = (err instanceof Error ? err.message : String(err ?? '')).trim();
      toast.error(
        detail ? `apexQuickPreset.applyError\n${detail}` : 'apexQuickPreset.applyError',
        {timeout: 8000},
      );
      return false;
    } finally {
      this.quick_preset_applying = false;
    }
  },
};
