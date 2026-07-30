<script setup lang="ts">
import {computed, reactive, watch} from 'vue';
import {useI18n} from 'vue-i18n';

const props = defineProps<{
  modelValue: string
  label: string
}>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>();
const {t} = useI18n();

const channels = reactive(['', '', '']);

function parsedChannels(value: string): string[] | null {
  if (!value.trim()) return ['', '', ''];
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  const numbers = parts.map(part => Number(part));
  if (numbers.some(number => !Number.isInteger(number) || number < 0 || number > 255)) return null;
  return numbers.map(String);
}

watch(
  () => props.modelValue,
  value => {
    const parsed = parsedChannels(value);
    if (parsed && parsed.join(' ') !== channels.join(' ')) channels.splice(0, 3, ...parsed);
  },
  {immediate: true},
);

const isDefault = computed(() => !props.modelValue.trim());

function updateChannel(index: number, event: Event) {
  channels[index] = (event.target as HTMLInputElement).value;
  const parsed = channels.map(value => Number(value));
  if (channels.some(value => value === '')
    || parsed.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return;
  emit('update:modelValue', parsed.join(' '));
}

function useDefault() {
  channels.splice(0, 3, '', '', '');
  emit('update:modelValue', '');
}
</script>

<template>
  <div class="rgb-integer-input">
    <v-btn
      size="small"
      :variant="isDefault ? 'tonal' : 'text'"
      :color="isDefault ? 'primary' : undefined"
      @click.stop="useDefault"
    >
      {{ t('apexGameSettings.options.default') }}
    </v-btn>
    <v-chip v-if="!isDefault" size="x-small" color="primary" variant="tonal">
      {{ t('apexGameSettings.options.custom') }}
    </v-chip>
    <label v-for="(channel, index) in channels" :key="index" class="rgb-channel">
      <span>{{ ['R', 'G', 'B'][index] }}</span>
      <input
        :value="channel"
        type="number"
        min="0"
        max="255"
        step="1"
        :placeholder="String(['R', 'G', 'B'][index])"
        :aria-label="`${label} ${['R', 'G', 'B'][index]}`"
        @input="updateChannel(index, $event)"
        @click.stop
        @mousedown.stop
        @pointerdown.stop
      />
    </label>
  </div>
</template>

<style scoped>
.rgb-integer-input {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rgb-channel {
  display: flex;
  align-items: center;
  gap: 3px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 11px;
}

.rgb-channel input {
  box-sizing: border-box;
  width: 54px;
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
</style>
