<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {useStateStore} from '@/stores/state.ts';
import {invoke} from '@tauri-apps/api/core';

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
    closable
    height="120px"
    min-height="110px"
    max-height="130px"
  >
    <template v-slot:text>
      {{ text }}
    </template>
    <v-alert-title style="justify-content: end">
      <v-btn color="error" @click="invoke('restart_request_elevation')">
        {{ t('elevation.button') }}
      </v-btn>
    </v-alert-title>
  </v-alert>
</template>

<style scoped>

</style>
