import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import type {ApexBindingSnapshot} from '@/types/apex_game_settings.ts';

export function bindingSnapshotKey(binding: ApexBindingSnapshot): string {
  return [binding.command.toLowerCase(), (binding.heldCommand ?? '').toLowerCase(), binding.context, binding.occurrence].join('\u001f');
}
function equivalent(a: string, b: string | undefined) {
  if (a === b) return true;
  const numeric = /^-?\d+(?:\.\d+)?$/;
  return b !== undefined && numeric.test(a) && numeric.test(b) && Number(a) === Number(b);
}
function changed(current: Record<string, string> = {}, baseline: Record<string, string> = {}) {
  return Object.fromEntries(Object.entries(current).filter(([key, value]) => !equivalent(value, baseline[key])));
}

/** Unknown defaults stay in the export rather than silently discarding a value. */
export function changedSnapshot(current: ApexConfigSnapshot, baseline: ApexConfigSnapshot): ApexConfigSnapshot {
  const result: ApexConfigSnapshot = {kind: current.kind, version: current.version, exportedAt: current.exportedAt};
  if (current.launchOptions && current.launchOptions.raw !== (baseline.launchOptions?.raw ?? '')) result.launchOptions = {...current.launchOptions};
  const video = changed(current.videoConfig, baseline.videoConfig);
  if (Object.keys(video).length) result.videoConfig = video;
  if (current.gameSettings) {
    const settings = changed(current.gameSettings.settings, baseline.gameSettings?.settings);
    const profile = changed(current.gameSettings.profile, baseline.gameSettings?.profile);
    let bindings: ApexBindingSnapshot[] | undefined;
    if (current.gameSettings.bindings !== undefined) {
      const originals = new Map((baseline.gameSettings?.bindings ?? []).map(binding => [bindingSnapshotKey(binding), binding]));
      const present = new Set(current.gameSettings.bindings.map(bindingSnapshotKey));
      bindings = current.gameSettings.bindings.filter(binding => (
        binding.input.toUpperCase() !== originals.get(bindingSnapshotKey(binding))?.input.toUpperCase()
      )).map(binding => ({...binding}));
      for (const [key, binding] of originals) {
        if (!present.has(key)) bindings.push({...binding, input: ''});
      }
    }
    if (Object.keys(settings).length || Object.keys(profile).length || bindings?.length) {
      result.gameSettings = {settings, profile, ...(bindings?.length ? {bindings, bindingsMode: 'patch' as const} : {})};
      if (bindings?.length) result.version = 2;
    }
  }
  return result;
}

/** Apply sparse bindings without clearing unrelated bindings on the destination. */
export function mergeBindingPatch(current: ApexBindingSnapshot[], patch: ApexBindingSnapshot[]): ApexBindingSnapshot[] {
  const replaced = new Set(patch.map(bindingSnapshotKey));
  const assigned = new Set(patch.filter(binding => binding.input).map(binding => binding.input.toUpperCase()));
  return [...current.filter(binding => !replaced.has(bindingSnapshotKey(binding)) && !assigned.has(binding.input.toUpperCase())),
    ...patch.filter(binding => binding.input).map(binding => ({...binding}))];
}
