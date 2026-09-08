<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {useApexStore} from '@/stores/game/apex.ts';

defineProps<{disabled?: boolean}>();
const store = useApexStore();
const {t} = useI18n();
</script>

<template>
  <v-alert
    v-if="store.video_config_needs_generation"
    type="warning"
    variant="tonal"
    density="compact"
    class="video-recovery-notice"
  >
    <p>{{ t('apex.videoConfigNeedsGeneration') }}</p>
    <template v-if="Object.keys(store.original_video_config).length || store.is_videoconfig_readonly">
      <p class="mt-1">{{ t('apex.videoConfigRecoveryDescription') }}</p>
      <v-btn
        class="video-recovery-action mt-2"
        color="primary"
        variant="text"
        size="small"
        :disabled="disabled || store.quick_preset_applying"
        :loading="store.is_video_config_saving"
        @click="store.prepare_video_config_regeneration()"
      >
        {{ t('apex.videoConfigRecoveryAction') }}
      </v-btn>
    </template>
  </v-alert>
</template>

<style scoped>
.video-recovery-notice {
  flex: 0 0 auto;
  margin: 8px;
  overflow-wrap: anywhere;
}

.video-recovery-action {
  height: var(--app-control-height-action);
}
</style>
