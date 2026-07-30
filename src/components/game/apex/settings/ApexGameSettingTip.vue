<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import ApexGameSettingsData from '@/data/apex_game_settings.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import ApexColorblindPreview from './ApexColorblindPreview.vue';

const props = defineProps<{fieldId: string}>();
const apexStore = useApexStore();
const {t} = useI18n();

const field = computed(() => ApexGameSettingsData.find(item => item.id === props.fieldId));
const describedOptions = computed(() => field.value?.options?.filter(option => option.descriptionKey) ?? []);
const value = computed(() => {
  const item = field.value;
  return item ? apexStore.game_settings_values[item.file][item.readKey ?? item.key] ?? '' : '';
});
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
</style>
