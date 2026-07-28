<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {useStateStore} from '@/stores/state.ts';
import {restartRequestElevation} from '@/ipc/commands.ts';

defineProps<{ text: string }>();
const { t } = useI18n();
const state = useStateStore();
</script>

<template>
  <v-alert
    v-if="!state.is_elevated"
    density="compact"
    :title="t('elevation.title')"
    type="warning"
    icon="mdi-security"
    variant="tonal"
    class="elevation-notice"
  >
    <template v-slot:text>
      {{ text }}
    </template>
    <template #append>
      <v-btn color="warning" variant="flat" size="small" rounded="lg" @click="restartRequestElevation()">
        {{ t('elevation.button') }}
      </v-btn>
    </template>
  </v-alert>
</template>

<style scoped>
.elevation-notice {
  min-height: 0;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-warning), 0.2);
  border-radius: 13px;
}

.elevation-notice :deep(.v-alert__prepend) {
  align-self: center;
  margin-inline-end: 10px;
}

.elevation-notice :deep(.v-alert__content) {
  min-width: 0;
}

.elevation-notice :deep(.v-alert-title) {
  margin-bottom: 1px;
  font-size: 12px;
  font-weight: 680;
}

.elevation-notice :deep(.v-alert__text) {
  font-size: 10px;
  line-height: 1.45;
}

.elevation-notice :deep(.v-alert__append) {
  align-self: center;
  margin-inline-start: 14px;
}
</style>
