<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import type {SteamUser} from '@/types/steam.ts';
import type {CloseProcessKind} from '@/composables/useCloseLauncherThenApply.ts';
import CloseSteamApplyAccount from '@/components/game/CloseSteamApplyAccount.vue';

const props = withDefaults(defineProps<{
  processes: CloseProcessKind[];
  steamUser?: SteamUser | null;
}>(), {steamUser: null});

const {t} = useI18n();
const processRows = computed(() => props.processes.map(kind => ({
  kind,
  name: t(`apex.closeProcesses.apps.${kind}`),
  icon: kind === 'apex' ? 'mdi-gamepad-variant' : kind === 'steam' ? 'mdi-steam' : 'mdi-alpha-e-circle',
})));
</script>

<template>
  <v-list class="running-processes-list" density="compact">
    <v-list-item
      v-for="process in processRows"
      :key="process.kind"
      :prepend-icon="process.icon"
      :title="process.name"
    >
      <template #append>
        <span class="running-processes-status">{{ t('apex.closeProcesses.running') }}</span>
      </template>
    </v-list-item>
  </v-list>
  <CloseSteamApplyAccount
    v-if="processes.includes('steam') && steamUser"
    :user="steamUser"
  />
</template>

<style scoped>
.running-processes-list {
  padding: 0;
  border-block: 1px solid rgba(var(--v-border-color), 0.12);
  background: transparent;
}
.running-processes-list :deep(.v-list-item) { min-height: 38px; }
.running-processes-list :deep(.v-icon) { color: rgb(var(--v-theme-error)); }
.running-processes-status {
  color: rgb(var(--v-theme-error));
  font-size: 11px;
}
</style>
