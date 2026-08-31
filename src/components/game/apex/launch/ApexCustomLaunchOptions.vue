<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import {useApexStore} from '@/stores/game/apex.ts';

const {t} = useI18n();
const apexStore = useApexStore();

const customLaunchOptions = computed({
  get: () => apexStore.custom_launch_options,
  set: (value: string | null) => apexStore.set_custom_launch_options(value ?? ''),
});
</script>

<template>
  <div class="apex-custom-launch-options">
    <v-text-field
      v-model="customLaunchOptions"
      class="mx-standard-field"
      variant="outlined"
      density="compact"
      hide-details
      clearable
      autocomplete="off"
      spellcheck="false"
      prepend-inner-icon="mdi-console"
      :label="t('apexLaunchOptions.ui.customLaunchOptionsLabel')"
      :placeholder="t('apexLaunchOptions.ui.customLaunchOptionsPlaceholder')"
    />
  </div>
</template>

<style scoped>
.apex-custom-launch-options {
  flex: 0 0 auto;
  padding-bottom: 8px;
}
</style>
