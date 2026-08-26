<script setup lang="ts">
import {computed, reactive, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import laserSightPreviewBackground from '@/assets/images/apex/laser_sight_preview.jpg';

type RgbEncoding = 'channels' | 'packed';

const props = defineProps<{
  modelValue: string
  label: string
  disabled?: boolean
  previewOnly?: boolean
  mode?: string
  encoding?: RgbEncoding
  defaultRgb?: [number, number, number]
}>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:mode', value: string): void
}>();
const {t} = useI18n();

const MAX_PACKED_RGB = 0xFF_FF_FF;
const channels = reactive(['0', '0', '0']);

function packRgb(rgb: readonly number[]): number {
  return rgb[0] | (rgb[1] << 8) | (rgb[2] << 16);
}

function decodeRgb(value: string): [number, number, number] | null {
  const normalized = value.trim();
  if ((props.encoding ?? 'packed') === 'channels') {
    const values = normalized.split(/\s+/).map(Number);
    return values.length === 3
      && values.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255)
      ? values as [number, number, number]
      : null;
  }
  const packed = Number(normalized);
  if (!/^\d+$/.test(normalized)
    || !Number.isInteger(packed)
    || packed < 0
    || packed > MAX_PACKED_RGB) return null;
  return [packed & 0xFF, (packed >> 8) & 0xFF, (packed >> 16) & 0xFF];
}

function encodeRgb(rgb: readonly number[]): string {
  return (props.encoding ?? 'packed') === 'channels'
    ? rgb.join(' ')
    : String(packRgb(rgb));
}

function currentChannels(): [number, number, number] | null {
  const parsed = channels.map(Number);
  if (channels.some(value => value === '')
    || parsed.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return parsed as [number, number, number];
}

watch(
  () => props.modelValue,
  value => {
    const parsed = decodeRgb(value) ?? props.defaultRgb ?? [0, 0, 0];
    const next = parsed.map(String);
    if (next.join(' ') !== channels.join(' ')) channels.splice(0, 3, ...next);
  },
  {immediate: true},
);

const rgb = computed<[number, number, number]>(() => (
  currentChannels() ?? decodeRgb(props.modelValue) ?? props.defaultRgb ?? [0, 0, 0]
));
const colorHex = computed(() => `#${rgb.value.map(channel => channel.toString(16).padStart(2, '0')).join('')}`);
const previewStyle = computed(() => ({
  '--laser-color': `rgb(${rgb.value.join(' ')})`,
  '--laser-glow': `rgba(${rgb.value.join(', ')}, 0.72)`,
  backgroundImage: `url("${laserSightPreviewBackground}")`,
}));

function emitChannels(next: [number, number, number]) {
  channels.splice(0, 3, ...next.map(String));
  emit('update:modelValue', encodeRgb(next));
}

function updateMode(value: unknown) {
  const next = String(value ?? '');
  if (props.disabled || (next !== '0' && next !== '1')) return;
  emit('update:mode', next);
  if (next === '1' && !decodeRgb(props.modelValue)) {
    emit('update:modelValue', encodeRgb(props.defaultRgb ?? [0, 0, 0]));
  }
}

function normalizeChannels() {
  const next = rgb.value.map(String);
  if (next.join(' ') !== channels.join(' ')) channels.splice(0, 3, ...next);
}

function updateChannel(index: number, event: Event) {
  if (props.disabled) return;
  channels[index] = (event.target as HTMLInputElement).value;
  const parsed = currentChannels();
  if (parsed) emit('update:modelValue', encodeRgb(parsed));
}

function updateColor(event: Event) {
  if (props.disabled) return;
  const value = (event.target as HTMLInputElement).value;
  const parsed = /^#[\da-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1), 16) : Number.NaN;
  if (!Number.isInteger(parsed)) return;
  emitChannels([(parsed >> 16) & 0xFF, (parsed >> 8) & 0xFF, parsed & 0xFF]);
}
</script>

<template>
  <div
    class="laser-color-input"
    :class="{
      'laser-color-input--disabled': disabled,
      'laser-color-input--preview-only': previewOnly,
    }"
  >
    <div
      v-if="previewOnly"
      class="laser-preview"
      :style="previewStyle"
      role="img"
      :aria-label="`${label}: RGB ${rgb.join(', ')}`"
    >
      <div class="laser-beam" aria-hidden="true"/>
      <div class="laser-impact" aria-hidden="true"/>
    </div>

    <div v-else class="color-editor">
      <v-btn-toggle
        :model-value="mode ?? '1'"
        mandatory
        density="compact"
        color="primary"
        variant="text"
        border
        divided
        class="color-mode-toggle game-page-segmented-toggle"
        :disabled="disabled"
        :aria-label="label"
        @update:model-value="updateMode"
      >
        <v-btn value="0" size="small">{{ t('apexGameSettings.options.default') }}</v-btn>
        <v-btn value="1" size="small">{{ t('apexGameSettings.options.custom') }}</v-btn>
      </v-btn-toggle>
      <div v-if="(mode ?? '1') === '1'" class="laser-controls">
        <label class="color-swatch" :style="{'--swatch-color': colorHex}" :title="label">
          <input
            :value="colorHex"
            type="color"
            :aria-label="label"
            :disabled="disabled"
            @input="updateColor"
            @click.stop
            @mousedown.stop
            @pointerdown.stop
          />
        </label>
        <label v-for="(channel, index) in channels" :key="index" class="rgb-channel">
          <span :class="`rgb-channel-label--${index}`">{{ ['R', 'G', 'B'][index] }}</span>
          <input
            :value="channel"
            type="number"
            min="0"
            max="255"
            step="1"
            :aria-label="`${label} ${['R', 'G', 'B'][index]}`"
            :disabled="disabled"
            @input="updateChannel(index, $event)"
            @blur="normalizeChannels"
            @click.stop
            @mousedown.stop
            @pointerdown.stop
          />
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.laser-color-input {
  min-width: 0;
  max-width: 100%;
}

.laser-color-input--preview-only {
  width: clamp(360px, 40vw, 520px);
}

.laser-preview {
  position: relative;
  aspect-ratio: 800 / 438;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 4px;
  background-color: #050707;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.52);
}

.laser-beam {
  position: absolute;
  z-index: 2;
  top: 32.1%;
  left: 40.3%;
  width: 19.9%;
  height: 2px;
  border-radius: 2px;
  background: var(--laser-color);
  box-shadow: 0 0 4px 1px var(--laser-glow), 0 0 11px 3px var(--laser-glow);
  transform: rotate(41.3deg);
  transform-origin: left center;
}
.laser-beam::after {
  position: absolute;
  inset: -5px 0;
  content: '';
  background: var(--laser-color);
  filter: blur(7px);
  opacity: 0.22;
}
.laser-impact {
  position: absolute;
  z-index: 3;
  top: calc(32.1% - 3px);
  left: calc(40.3% - 3px);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--laser-color);
  box-shadow: 0 0 7px 2px var(--laser-glow);
}

.color-editor {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}
.color-mode-toggle { flex: 0 0 auto; }
.laser-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.color-swatch {
  position: relative;
  flex: 0 0 var(--app-control-height-compact);
  width: var(--app-control-height-compact);
  height: var(--app-control-height-compact);
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
  border-radius: 4px;
  background: var(--swatch-color);
}
.color-swatch input {
  position: absolute;
  inset: -8px;
  width: calc(100% + 16px);
  height: calc(100% + 16px);
  cursor: pointer;
  opacity: 0;
}
.color-swatch:focus-within {
  border-color: rgba(var(--v-theme-primary), 0.78);
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.14);
}
.rgb-channel {
  display: flex;
  align-items: center;
  gap: 3px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 11px;
}
.rgb-channel span { width: 9px; text-align: center; font-weight: 650; }
.rgb-channel-label--0 { color: #ff5555; }
.rgb-channel-label--1 { color: #3fd76b; }
.rgb-channel-label--2 { color: #4c8dff; }
.rgb-channel input {
  box-sizing: border-box;
  width: 50px;
  height: var(--app-control-height-compact);
  padding: 0 3px;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 12px;
  text-align: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 4px;
  outline: none;
  background: rgba(var(--v-theme-surface), 0.78);
}
.rgb-channel input:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.78);
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.14);
}
.laser-color-input--disabled { opacity: 0.46; }
.laser-color-input--disabled .color-swatch input { cursor: default; }

@media (max-width: 980px) {
  .laser-color-input:not(.laser-color-input--preview-only),
  .color-editor {
    width: 100%;
  }
  .color-editor {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
@media (max-width: 760px) {
  .laser-color-input--preview-only { width: 100%; }
  .laser-controls { flex-wrap: wrap; }
}
</style>
