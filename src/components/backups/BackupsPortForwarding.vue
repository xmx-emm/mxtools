
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from 'vue-toastification';

const { t } = useI18n();
const toast = useToast();
const emits = defineEmits(["import_finished", "export_finished"]);

async function import_config() {
  const folder: string = await invoke("explorer_folder");
  open({
    title: "Import Port Forwarding Config",
    filters: [{
      name: "Port Forwarding",
      extensions: ['json']
    }],
    defaultPath: folder,
    multiple: false,
  }).then(async (filepath) => {
    console.log("import_config", filepath);
    if (await invoke("load_port_forwarding", {filepath: filepath})) {
      toast.success('toast.importPortForwardingConfigSuccess');
      emits("import_finished");
    } else {
      toast.error('toast.importPortForwardingConfigError');
    }
  }).catch(() => {
    toast.error('toast.configNotFound');
  })
}

async function export_config() {
  invoke("backups_port_forwarding_default_path").then((default_path) => {
    save({
      defaultPath: default_path as any,
      filters: [{
        name: "Port Forwarding",
        extensions: ['json']
      }]
    }).then(async (output_file) => {
      console.log("output_file", output_file);
      if (await invoke("backups_port_forwarding", {output: output_file})) {
        emits("export_finished");
        toast.success('toast.exportPortForwardingConfigSuccess', {
          onClick: () => {
            console.log("Export to Backups PortForwarding");
          },
        });
      } else {
        toast.error('toast.exportPortForwardingConfigError');
      }
    }).catch((error) => {
      console.info(error);
    })
  }).catch((error) => {
    console.error(error);
  })
}
</script>

<template>
  <v-tooltip :text="t('portForwarding.export')" location="bottom">
    <template v-slot:activator="{ isActive, props }">
      <v-icon
          icon="mdi-arrow-top-right"
          v-bind="props"
          :color="isActive ? 'red' :'per'"
          size="small"
          @click="export_config"
      />
    </template>
  </v-tooltip>
  <v-tooltip :text="t('portForwarding.import')" location="bottom">
    <template v-slot:activator="{ isActive, props }">
      <v-icon
        icon="mdi-arrow-bottom-left"
        v-bind="props"
        :color="isActive ? 'red' :'per'"
        size="small"
        @click="import_config"
      />
    </template>
  </v-tooltip>
</template>

<style scoped>

</style>
