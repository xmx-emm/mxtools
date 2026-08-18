<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import ApexGameSettingsData from '@/data/apex_game_settings.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import ApexColorblindPreview from './ApexColorblindPreview.vue';
import ApexLaserSightColorInput from './ApexLaserSightColorInput.vue';

const props = defineProps<{fieldId: string}>();
const apexStore = useApexStore();
const {t} = useI18n();

const field = computed(() => ApexGameSettingsData.find(item => item.id === props.fieldId));
const describedOptions = computed(() => field.value?.options?.filter(option => option.descriptionKey) ?? []);
const value = computed(() => {
  const item = field.value;
  return item ? apexStore.game_settings_values[item.file][item.readKey ?? item.key] ?? '' : '';
});
const isLaserColorTip = computed(() => field.value?.id === 'laserSightCustom' || field.value?.id === 'laserSightColor');
const laserColorValue = computed(() => {
  const stored = (apexStore.game_settings_values.profile.laserSightColor ?? '').trim();
  const packed = Number(stored);
  return /^\d+$/.test(stored) && Number.isInteger(packed) && packed >= 0 && packed <= 0xFF_FF_FF
    ? stored
    : '255';
});
const reticleRgb = computed<[number, number, number]>(() => {
  const parts = value.value.trim().split(/\s+/).map(Number);
  return parts.length === 3
    && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts as [number, number, number]
    : [255, 255, 255];
});
const reticlePreviewStyle = computed(() => ({
  '--reticle-color': `rgb(${reticleRgb.value.join(' ')})`,
}));
</script>

<template>
  <ApexTipCard
    v-if="field"
    class="game-setting-tip"
    :title="t(field.labelKey)"
    :subtitle="t(field.descriptionKey)"
  >
    <div v-if="describedOptions.length" class="tip-options">
      <p v-for="option in describedOptions" :key="option.value">
        <strong>{{ t(option.labelKey) }}：</strong>{{ t(option.descriptionKey ?? '') }}
      </p>
    </div>
    <ApexColorblindPreview v-if="field.id === 'colorblindMode'" :value="value" />
    <div
      v-else-if="field.id === 'reticleColor'"
      class="reticle-color-preview"
      :style="reticlePreviewStyle"
      role="img"
      :aria-label="`${t(field.labelKey)}: RGB ${reticleRgb.join(', ')}`"
    >
      <span aria-hidden="true"/>
    </div>
    <ApexLaserSightColorInput
      v-else-if="isLaserColorTip"
      class="laser-color-preview"
      :model-value="laserColorValue"
      :label="t(field.labelKey)"
      preview-only
    />
  </ApexTipCard>
</template>

<style scoped>
.game-setting-tip {
  width: min(680px, calc(100vw - 32px));
}

.tip-options {
  display: grid;
  gap: 6px;
}

.tip-options p {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.74);
}

.reticle-color-preview {
  position: relative;
  width: min(360px, 100%);
  aspect-ratio: 16 / 7;
  overflow: hidden;
  margin-top: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 4px;
  background: #242a2d;
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.4);
}

.reticle-color-preview::before,
.reticle-color-preview::after {
  position: absolute;
  top: 50%;
  left: 50%;
  content: '';
  background: var(--reticle-color);
  box-shadow: 0 0 5px var(--reticle-color);
  transform: translate(-50%, -50%);
}

.reticle-color-preview::before {
  width: 54px;
  height: 2px;
}

.reticle-color-preview::after {
  width: 2px;
  height: 54px;
}

.reticle-color-preview span {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--reticle-color);
  box-shadow: 0 0 7px var(--reticle-color);
  transform: translate(-50%, -50%);
}

.laser-color-preview {
  margin-top: 12px;
}
</style>
