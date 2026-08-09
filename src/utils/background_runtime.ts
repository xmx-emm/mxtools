import {toRaw} from 'vue';
import type {
  BackgroundRuntimeConfig,
  RazerBackgroundConfig,
} from '@/types/background_runtime.ts';

export function cloneBackgroundRuntimeConfig(
  config: BackgroundRuntimeConfig,
): BackgroundRuntimeConfig {
  return structuredClone(toRaw(config));
}

export function cloneRazerBackgroundConfig(
  config: RazerBackgroundConfig,
): RazerBackgroundConfig {
  return structuredClone(toRaw(config));
}
