import {useToast} from 'vue-toastification';
import {
  ASPECT_LETTERBOX_MIN_DEFAULT,
  ASPECT_LETTERBOX_THRESHOLD,
  findGraphicsQualityPreset,
  QUICK_PRESET_AIM_MOUSE_RIGHT_KEY,
  QUICK_PRESET_FORWARD_WHEEL_UP_KEY,
  QUICK_PRESET_JUMP_WHEEL_DOWN_KEY,
  quickPresetGameSettingToggles,
} from '@/data/presets/apex_quick_preset.ts';
import type {ApexQuickPresetSelection, PrimaryDisplayInfo} from '@/types/apex_quick_preset.ts';
import type {ApexBinding} from '@/types/apex_game_settings.ts';
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
import {emitApexConfigChanged} from '@/utils/game/apex_config_events.ts';
import {
  adoptApexGameSettingsReport,
  buildApexGameSettingsMutation,
} from './actions_settings.ts';

const ensure_option_in_selection = ensureOptionInSelection;
const remove_option_from_selection = removeOptionFromSelection;

function sameBindingCommand(actual: string, expected: string): boolean {
  return actual.toLowerCase() === expected.toLowerCase();
}

function sameBindingAction(left: ApexBinding, right: ApexBinding): boolean {
  return sameBindingCommand(left.command, right.command)
    && (left.heldCommand ?? '').toLowerCase() === (right.heldCommand ?? '').toLowerCase();
}

type PresetBindingTarget = {
  templateId?: string;
  binding?: ApexBinding;
  command: '+zoom' | '+toggle_zoom' | '+forward' | '+jump';
  input: 'MOUSE2' | 'MWHEELUP' | 'MWHEELDOWN';
  context: 0 | 1;
};

function clearBinding(store: ApexStoreThis, binding: ApexBinding) {
  if (!binding.editable) {
    throw new Error(`apex.gameSettings.errors.bindingConflict: ${binding.input}`);
  }
  store.set_game_binding_slot(
    binding.templateId ?? binding.id,
    binding.id,
    '',
    binding.context === 1 ? 1 : 0,
  );
}

function resolvePresetAimBinding(store: ApexStoreThis): {
  binding?: ApexBinding;
  command: '+zoom' | '+toggle_zoom';
  context: 0 | 1;
} {
  const aimCommands = ['+zoom', '+toggle_zoom'];
  const mouseAim = store.game_settings_bindings.find(binding => (
    binding.editable
    && binding.input.toUpperCase() === 'MOUSE2'
    && aimCommands.some(command => sameBindingCommand(binding.command, command))
  ));
  if (mouseAim) {
    return {
      binding: mouseAim,
      command: sameBindingCommand(mouseAim.command, '+toggle_zoom') ? '+toggle_zoom' : '+zoom',
      context: mouseAim.context === 1 ? 1 : 0,
    };
  }

  for (const command of aimCommands) {
    const candidates = store.game_settings_bindings.filter(binding => (
      binding.editable && sameBindingCommand(binding.command, command)
    ));
    if (!candidates.length) continue;
    const binding = candidates.find(candidate => !candidate.heldCommand) ?? candidates[0]!;
    const sameAction = candidates.filter(candidate => sameBindingAction(candidate, binding));
    const contexts = new Set(sameAction.filter(candidate => candidate.input).map(candidate => candidate.context));
    const resolvedCommand = command as '+zoom' | '+toggle_zoom';
    if (!contexts.has(1)) return {binding, command: resolvedCommand, context: 1};
    if (!contexts.has(0)) return {binding, command: resolvedCommand, context: 0};
    return {
      binding,
      command: resolvedCommand,
      context: binding.context === 1 ? 1 : 0,
    };
  }
  return {command: '+zoom', context: 0};
}

function resolvePresetActionBinding(
  store: ApexStoreThis,
  command: '+forward' | '+jump',
): ApexBinding | undefined {
  const candidates = store.game_settings_bindings.filter(binding => (
    binding.editable && sameBindingCommand(binding.command, command)
  ));
  return candidates.find(candidate => !candidate.heldCommand) ?? candidates[0];
}

function bindingMatchesTarget(binding: ApexBinding, target: PresetBindingTarget): boolean {
  if (target.binding) return sameBindingAction(binding, target.binding);
  return sameBindingCommand(binding.command, target.command) && !binding.heldCommand;
}

function createPresetBinding(store: ApexStoreThis, target: PresetBindingTarget) {
  if (target.templateId) {
    store.set_game_binding_slot(target.templateId, null, target.input, target.context);
    return;
  }
  const sequence = ++store.game_settings_binding_draft_sequence;
  store.game_settings_bindings.push({
    id: `binding:quick-preset:${sequence}`,
    input: target.input,
    command: target.command,
    context: target.context,
    heldCommand: null,
    editable: true,
    occurrence: sequence,
    createCommand: target.command,
  });
}

function replacePresetBindings(
  store: ApexStoreThis,
  targets: readonly PresetBindingTarget[],
) {
  const wantedInputs = new Set(targets.map(target => target.input));

  // Phase 1: remove every occupied physical key and every stale copy of the
  // target action/context. The backend then validates only the clean final set.
  for (const binding of [...store.game_settings_bindings]) {
    const occupiesInput = Boolean(binding.input)
      && wantedInputs.has(binding.input.toUpperCase() as PresetBindingTarget['input']);
    const occupiesTargetSlot = targets.some(target => (
      bindingMatchesTarget(binding, target)
      && binding.context === target.context
    ));
    if (!occupiesInput && !occupiesTargetSlot) continue;
    clearBinding(store, binding);
  }

  // Phase 2: create each desired slot from its original on-disk template.
  for (const target of targets) {
    createPresetBinding(store, target);
  }
}

function selectedPresetBindingTargets(
  store: ApexStoreThis,
  enabledOptions: Record<string, boolean>,
): PresetBindingTarget[] {
  const targets: PresetBindingTarget[] = [];
  if (enabledOptions[QUICK_PRESET_AIM_MOUSE_RIGHT_KEY]) {
    const aim = resolvePresetAimBinding(store);
    targets.push({
      templateId: aim.binding?.templateId ?? aim.binding?.id,
      binding: aim.binding,
      command: aim.command,
      input: 'MOUSE2',
      context: aim.context,
    });
  }
  if (enabledOptions[QUICK_PRESET_FORWARD_WHEEL_UP_KEY]) {
    const binding = resolvePresetActionBinding(store, '+forward');
    targets.push({
      templateId: binding?.templateId ?? binding?.id,
      binding,
      command: '+forward',
      input: 'MWHEELUP',
      context: 1,
    });
  }
  if (enabledOptions[QUICK_PRESET_JUMP_WHEEL_DOWN_KEY]) {
    const binding = resolvePresetActionBinding(store, '+jump');
    targets.push({
      templateId: binding?.templateId ?? binding?.id,
      binding,
      command: '+jump',
      input: 'MWHEELDOWN',
      context: 1,
    });
  }
  return targets;
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

  const targets = selectedPresetBindingTargets(store, enabledOptions);
  if (!targets.length) return;
  replacePresetBindings(store, targets);
}

export const apexPresetActions = {
  open_quick_preset_window(this: ApexStoreThis) {
    void import('@/utils/windows.ts')
      .then(({openApexQuickPresetWindow}) => (
        openApexQuickPresetWindow(this.launcher_selection_key)
      ))
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
    // settings.cfg 缺失/不完整时不再阻塞:后端会从内置默认模板初始化完整键位再应用
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
    this.settings_config['fps'] = '+fps_max X';

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
  /** 落盘前从磁盘重读启动项、画面与键位(避免重置/外部修改后内存状态过期) */
  async ensure_configs_loaded_for_preset(this: ApexStoreThis): Promise<void> {
    const key = this.launcher_selection_key;
    if (!key) {
      throw new Error('LAUNCH_OPTIONS_LOAD_FAILED');
    }
    await this.load_launch_data({force: true});
    if (this.launch_loaded_for_key !== key || this.launch_load_status !== 'ready') {
      throw new Error('LAUNCH_OPTIONS_LOAD_FAILED');
    }
    await this.load_apex_video_config({silent: true, force: true});
    if (this.video_config_load_status !== 'ready') {
      throw new Error('apex.videoConfigLoadFailed');
    }
    await this.load_apex_game_settings({silent: true, force: true, discardLocal: true});
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

      const apexRunning = await apexIsRunning();
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
      await emitApexConfigChanged(result.changedScopes, {
        notification: 'quickPresetApplied',
      }).catch(error => console.warn('notify Apex config change failed', error));
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
