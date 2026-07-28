<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {open, save} from '@tauri-apps/plugin-dialog';
import {useToast} from 'vue-toastification';
import {usePortForwardingStore} from '@/stores/port_forwarding.ts';
import {useStateStore} from '@/stores/state.ts';
import {
  backupsPortForwarding,
  backupsPortForwardingDefaultPath,
  explorerFolder,
  loadPortForwarding,
} from '@/ipc/commands.ts';

const {t} = useI18n();
const toast = useToast();
const portStore = usePortForwardingStore();
const appState = useStateStore();
const emits = defineEmits(['import_finished', 'export_finished']);

async function import_config() {
  if (!appState.is_elevated) return;
  try {
    const folder: string = await explorerFolder();
    const filepath = await open({
      title: t('portForwarding.import'),
      filters: [{
        name: 'Port Forwarding',
        extensions: ['json'],
      }],
      defaultPath: folder,
      multiple: false,
    });
    if (!filepath || typeof filepath !== 'string') return;
    portStore.list = await loadPortForwarding({filepath});
    toast.success('toast.importPortForwardingConfigSuccess');
    emits('import_finished');
  } catch (e) {
    toast.error(String(e) || 'toast.importPortForwardingConfigError');
  }
}

async function export_config() {
  if (!appState.is_elevated) return;
  try {
    const default_path = await backupsPortForwardingDefaultPath();
    const output_file = await save({
      defaultPath: default_path ?? undefined,
      filters: [{
        name: 'Port Forwarding',
        extensions: ['json'],
      }],
    });
    if (!output_file) return;
    await backupsPortForwarding({output: output_file});
    emits('export_finished');
    toast.success('toast.exportPortForwardingConfigSuccess');
  } catch (e) {
    toast.error(String(e) || 'toast.exportPortForwardingConfigError');
  }
}
</script>

<template>
  <v-tooltip :text="t('portForwarding.export')" location="bottom">
    <template v-slot:activator="{isActive, props}">
      <v-icon
        icon="mdi-arrow-top-right"
        v-bind="props"
        :color="isActive ? 'red' :'per'"
        size="small"
        :disabled="!appState.is_elevated"
        @click="export_config"
      />
    </template>
  </v-tooltip>
  <v-tooltip :text="t('portForwarding.import')" location="bottom">
    <template v-slot:activator="{isActive, props}">
      <v-icon
        icon="mdi-arrow-bottom-left"
        v-bind="props"
        :color="isActive ? 'red' :'per'"
        size="small"
        :disabled="!appState.is_elevated"
        @click="import_config"
      />
    </template>
  </v-tooltip>
</template>

<style scoped>

</style>
