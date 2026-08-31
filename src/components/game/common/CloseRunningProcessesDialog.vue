<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import type {SteamUser} from '@/types/steam.ts';
import type {CloseProcessKind} from '@/composables/useCloseLauncherThenApply.ts';
import RunningProcessesList from '@/components/game/common/RunningProcessesList.vue';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  processes: CloseProcessKind[];
  loading?: boolean;
  message?: string;
  steamUser?: SteamUser | null;
}>(), {
  loading: false,
  message: '',
  steamUser: null,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  forceClose: [];
  cancel: [];
}>();

const {t} = useI18n();
const processNames = computed(() => props.processes.map(kind =>
  t(`apex.closeProcesses.apps.${kind}`),
));
const dialogTitle = computed(() => {
  const names = processNames.value.join(t('apex.closeProcesses.nameSeparator'));
  return props.processes.length > 1
    ? t('apex.closeProcesses.multipleTitle', {processes: names})
    : t('apex.closeProcesses.singleTitle', {process: names});
});
const closeMessage = computed(() => {
  if (props.message) return props.message;
  const names = processNames.value.join(t('apex.closeProcesses.nameSeparator'));
  return props.processes.length > 1
    ? t('apex.closeProcesses.multipleMessage', {processes: names})
    : t('apex.closeProcesses.singleMessage', {process: names});
});
const forceCloseLabel = computed(() => props.processes.length > 1
  ? t('apex.closeProcesses.forceCloseAll')
  : t('apex.forceClose'));
const isDialogOpen = computed(() => props.modelValue && props.processes.length > 0);

function onDialogModelUpdate(value: boolean) {
  // The workflow owns opening this dialog after process detection. Vuetify may
  // only request that an already-open dialog closes.
  if (!value) emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog
    :model-value="isDialogOpen"
    max-width="440"
    persistent
    @update:model-value="onDialogModelUpdate"
  >
    <v-card class="close-processes-card" prepend-icon="mdi-alert-outline" :title="dialogTitle">
      <template #append>
        <v-progress-circular indeterminate size="16" color="error" width="2"/>
      </template>
      <v-card-text class="close-processes-body">
        <p class="close-processes-message">
          {{ closeMessage }}
        </p>
        <RunningProcessesList :processes="processes" :steam-user="steamUser"/>
      </v-card-text>
      <v-card-actions class="close-processes-actions">
        <v-btn variant="text" :disabled="props.loading" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </v-btn>
        <v-spacer/>
        <v-btn color="error" variant="flat" :loading="props.loading" @click="emit('forceClose')">
          {{ forceCloseLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.close-processes-body { padding-top: 8px; }
.close-processes-card :deep(.v-card-title) {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.35;
}
.close-processes-message {
  margin: 0 0 12px;
  white-space: normal;
  overflow-wrap: anywhere;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 12px;
  line-height: 1.6;
}
.close-processes-actions :deep(.v-btn) { min-height: var(--app-control-height-action); }
</style>
