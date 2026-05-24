<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {computed, onUnmounted, ref, shallowRef} from 'vue';
import eaStore from '@/stores/game/ea.ts';
import steamStore from '@/stores/game/steam.ts';
import {invoke} from '@tauri-apps/api/core';
import {useToast} from 'vue-toastification';
import apexStore from '@/stores/game/apex.ts';

const { t } = useI18n();
const steam_store = steamStore();
const ea_store = eaStore();
const apex_store = apexStore();

const toast = useToast();

const dialog = shallowRef(false);
/** 关闭 Steam 或 EA Desktop 的提示框类型 */
const close_launcher_kind = shallowRef<'steam' | 'ea'>('steam');
const is_thoroughly_kill = ref(false);
const interval_id = ref<number | any>(null);
const is_apply_running = ref(false);
const is_setting_launch_option = ref(false);
const WAIT_CLOSE_POLL_MS = 1500;

function stop_monitoring() {
  if (!interval_id.value) return;
  clearInterval(interval_id.value);
  interval_id.value = null;
}

const apply_button_class = computed(() => {
  if (!apex_store.active_apex_account) return '';
  if (apex_store.is_start_loading || !apex_store.is_launch_options_modified) return '';
  const isSteam = apex_store.active_apex_account.kind === 'steam';
  if (isSteam && (steam_store.is_steam_running || !apex_store.is_miles_language_ready)) {
    return 'warning-red-text-edge-animate';
  }
  if (!isSteam && (ea_store.is_ea_desktop_running || !apex_store.is_miles_language_ready)) {
    return 'warning-red-text-edge-animate';
  }
  return 'success-green-text-edge-animate';
});

const close_dialog_title = computed(() =>
  close_launcher_kind.value === 'steam' ? t('apex.closeSteam') : t('apex.closeEaDesktop'),
);

const close_dialog_text = computed(() =>
  close_launcher_kind.value === 'steam' ? t('apex.closeSteamTip') : t('apex.closeEaDesktopTip'),
);

const close_dialog_icon = computed(() =>
  close_launcher_kind.value === 'steam' ? 'mdi-steam' : 'mdi-alpha-e-circle',
);

async function force_close_launcher() {
  is_thoroughly_kill.value = true;
  stop_monitoring();
  if (close_launcher_kind.value === 'steam') {
    await invoke('thoroughly_kill_steam');
    if (await invoke<boolean>('steam_is_running_by_tasklist')) {
      toast.error('toast.cannotCloseSteam');
      is_thoroughly_kill.value = false;
      continuously_monitor_until_closed();
      return;
    }
  } else {
    await invoke('thoroughly_kill_ea_desktop');
    if (await invoke<boolean>('ea_desktop_is_running_by_tasklist')) {
      toast.error('toast.cannotCloseEaDesktop');
      is_thoroughly_kill.value = false;
      continuously_monitor_until_closed();
      return;
    }
  }
  is_thoroughly_kill.value = false;
  dialog.value = false;
  set_launch_option();
}

function set_launch_option() {
  if (is_setting_launch_option.value) {
    return;
  }
  is_setting_launch_option.value = true;
  const acc = apex_store.active_apex_account;
  if (!acc) {
    is_setting_launch_option.value = false;
    is_apply_running.value = false;
    return;
  }
  console.log("set_launch_option",acc,apex_store.launch_options,acc.user.id)
  const done = () => {
    toast.success('toast.applyLaunchOptionSuccess');
    console.log('set_launch_option', apex_store.launch_options);
    apex_store.original_launch_options = apex_store.launch_options;
    dialog.value = false;
    is_setting_launch_option.value = false;
    is_apply_running.value = false;
  };
  const fail = (err: unknown) => {
    console.log(err);
    toast.error('toast.applyLaunchOptionError');
    dialog.value = false;
    is_setting_launch_option.value = false;
    is_apply_running.value = false;
  };
  if (acc.kind === 'steam') {
    invoke<void>('set_apex_launch_option', {
      id: Number(acc.user.id),
      launchOption: apex_store.launch_options,
    }).then(done).catch(fail);
  } else {
    invoke<void>('set_apex_launch_option_ea', {
      eaUserId: acc.user.id,
      launchOption: apex_store.launch_options,
    }).then(done).catch(fail);
  }
}

function cancel() {
  dialog.value = false;
  is_thoroughly_kill.value = false;
  stop_monitoring();
  is_apply_running.value = false;
}

function continuously_monitor_until_closed() {
  stop_monitoring();
  interval_id.value = setInterval(async () => {
    let still_running: boolean;
    if (close_launcher_kind.value === 'steam') {
      still_running = await invoke<boolean>('steam_is_running_by_tasklist');
    } else {
      still_running = await invoke<boolean>('ea_desktop_is_running_by_tasklist');
    }
    if (!still_running) {
      stop_monitoring();
      set_launch_option();
      dialog.value = false;
    }
  }, WAIT_CLOSE_POLL_MS);
}

async function apply_check() {
  is_apply_running.value = true;
  if (!apex_store.active_apex_account) {
    toast.error('apex.noLauncherAccount');
    is_apply_running.value = false;
    return;
  }
  if (!await apex_store.check_miles_language()) {
    toast.error('toast.milesLanguageNotFound');
    if (apex_store.active_apex_account?.kind === 'ea') {
      apex_store.download_miles_language_manual_dialog_ea = true;
    } else {
      apex_store.download_miles_language_semi_automatic_dialog = true;
    }
    is_apply_running.value = false;
    return;
  }
  if (apex_store.active_apex_account.kind === 'ea') {
    await ea_store.check_is_ea_desktop_running();
    if (ea_store.is_ea_desktop_running) {
      close_launcher_kind.value = 'ea';
      dialog.value = true;
      continuously_monitor_until_closed();
    } else {
      set_launch_option();
    }
    return;
  }
  await steam_store.check_is_steam_running();
  if (steam_store.is_steam_running) {
    close_launcher_kind.value = 'steam';
    dialog.value = true;
    continuously_monitor_until_closed();
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
        :prepend-icon="close_dialog_icon"
        :title="close_dialog_title"
        :text="close_dialog_text"
      >
        <template v-slot:actions>
          <v-btn
            @click="force_close_launcher"
            color="red"
            :loading="is_thoroughly_kill"
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
            <v-icon
              size="x-large"
              color="red"
            />
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
