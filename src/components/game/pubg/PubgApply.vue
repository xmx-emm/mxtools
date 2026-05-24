<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {invoke} from '@tauri-apps/api/core';
import {useToast} from 'vue-toastification';
import {computed, onUnmounted, ref, shallowRef} from 'vue';
import steamStore from '@/stores/game/steam.ts';
import pubgStore from '@/stores/game/pubg.ts';

const {t} = useI18n();
const toast = useToast();

const steam_store = steamStore();
const pubg_store = pubgStore();

const dialog = shallowRef(false);
const is_thoroughly_kill_steam = ref(false);
const interval_id = ref<number | any>(null);
const is_apply_running = ref(false);
const WAIT_CLOSE_POLL_MS = 1500;

function stop_monitoring() {
  if (!interval_id.value) return;
  clearInterval(interval_id.value);
  interval_id.value = null;
}

function start_monitoring() {
  stop_monitoring();
  interval_id.value = setInterval(async () => {
    const is_running = await invoke('steam_is_running_by_tasklist');
    if (!is_running) {
      stop_monitoring();
      set_launch_option();
      dialog.value = false;
    }
  }, WAIT_CLOSE_POLL_MS);
}

const apply_button_class = computed(() => {
  if (pubg_store.is_start_loading || !pubg_store.is_launch_options_modified) return '';
  if (steam_store.is_steam_running) {
    return 'warning-red-text-edge-animate';
  }
  return 'success-green-text-edge-animate';
});

async function force_close_steam() {
  is_thoroughly_kill_steam.value = true;
  stop_monitoring();
  await invoke('thoroughly_kill_steam');

  if (await invoke('steam_is_running_by_tasklist')) {
    toast.error('toast.cannotCloseSteam');
    is_thoroughly_kill_steam.value = false;
    start_monitoring();
  } else {
    is_thoroughly_kill_steam.value = false;
    dialog.value = false;
    stop_monitoring();
    set_launch_option();
  }
}

function set_launch_option() {
  invoke<void>('set_pubg_launch_option', {
    id: Number(steam_store.active_steam_user?.id),
    launchOption: pubg_store.launch_options,
  }).then(() => {
    toast.success('toast.applyLaunchOptionSuccess');
    pubg_store.original_launch_options = pubg_store.launch_options;
    dialog.value = false;
    is_apply_running.value = false;
  }).catch((err) => {
    console.log(err);
    toast.error('toast.applyLaunchOptionError');
    dialog.value = false;
    is_apply_running.value = false;
  });
}

function cancel() {
  dialog.value = false;
  is_thoroughly_kill_steam.value = false;
  stop_monitoring();
  is_apply_running.value = false;
}

function continuously_monitor_the_operational_status() {
  start_monitoring();
}

async function apply_check() {
  is_apply_running.value = true;
  await steam_store.check_is_steam_running();

  if (steam_store.is_steam_running) {
    dialog.value = true;
    continuously_monitor_the_operational_status();
  } else {
    stop_monitoring();
    set_launch_option();
  }
}

onUnmounted(() => {
  stop_monitoring();
});
</script>

<template>
  <v-dialog
    v-model="dialog"
    max-width="400"
    persistent
  >
    <template v-slot:activator>
      <v-btn
        @click.stop="apply_check"
        :loading="is_apply_running"
        :title="t('apex.applyLaunchOptions')"
        :class="apply_button_class"
      >
        {{ t('apex.apply') }}
      </v-btn>
    </template>
    <template v-slot:default>
      <v-card
        prepend-icon="mdi-steam"
        :title="t('apex.closeSteam')"
        :text="t('apex.closeSteamTip')"
      >
        <template v-slot:actions>
          <v-btn
            @click="force_close_steam"
            color="red"
            :loading="is_thoroughly_kill_steam"
          >
            {{ t('apex.forceClose') }}
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn @click="cancel">
            {{ t('common.cancel') }}
          </v-btn>
        </template>
        <template v-slot:prepend>
          <div class="pe-4">
            <v-icon size="x-large" color="red"></v-icon>
          </div>
        </template>
        <template v-slot:append>
          <v-progress-circular
            indeterminate="disable-shrink"
            size="16"
            color="red"
            width="2"
          />
        </template>
      </v-card>
    </template>
  </v-dialog>
</template>

<style scoped>
</style>

