<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {computed, ref, shallowRef} from 'vue';
import {steamStore} from '@/stores/game/steam.ts';
import {invoke} from '@tauri-apps/api/core';
import {useToast} from 'vue-toastification';
import apexStore from '@/stores/game/apex.ts';

const {t} = useI18n();
const steam_store = steamStore();
const apex_store = apexStore();

const toast = useToast();

const dialog = shallowRef(false)
const is_thoroughly_kill_steam = ref(false)
const interval_id = ref<number | any>(null);
const is_apply_running = ref(false);

const apply_button_class = computed(() => {
  if (apex_store.is_start_loading || !apex_store.is_launch_options_modified) return ''
  if (steam_store.is_steam_running || !apex_store.is_miles_language_ready) {
    return 'warning-red-text-edge-animate'
  }
  return 'success-green-text-edge-animate'
})

/**
 * 强制关闭steam
 * tips:注册表的值不会被修改,从注册表中判断是否运行会失效
 */
async function force_close_steam() {
  is_thoroughly_kill_steam.value = true
  await invoke("thoroughly_kill_steam")
  if (await invoke("steam_is_running_by_tasklist")) {
    toast.error('toast.cannotCloseSteam')
  } else {
    is_thoroughly_kill_steam.value = false
    dialog.value = false

    if (interval_id.value) {
      clearInterval(interval_id.value);
    }
    set_launch_option()
  }
}

/**
 * 设置启动项
 */
function set_launch_option() {
  invoke<void>("set_apex_launch_option", {
    id: Number(steam_store.active_steam_user?.id),
    launchOption: apex_store.launch_options,
  }).then(() => {
    toast.success('toast.applyLaunchOptionSuccess');
    console.log("set_launch_option", apex_store.launch_options)
    apex_store.original_launch_options = apex_store.launch_options
    dialog.value = false
    is_apply_running.value = false
  }).catch((err) => {
    console.log(err);
    toast.error('toast.applyLaunchOptionError');
    dialog.value = false
    is_apply_running.value = false
  });
}

/**
 * 取消等待Steam关闭
 */
function cancel() {
  dialog.value = false
  is_thoroughly_kill_steam.value = false
  clearInterval(interval_id.value);
  is_apply_running.value = false
}

/**
 * 持续监控运行状态
 * 如果关了steam就设置启动项
 */
function continuously_monitor_the_operational_status() {
  interval_id.value = setInterval(async () => {
    const is_running = await invoke("steam_is_running_by_tasklist")
    if (!is_running && interval_id.value) {
      clearInterval(interval_id.value);
      set_launch_option()
      dialog.value = false
      interval_id.value = null
    }
  }, 1500)
}


async function apply_check() {
  is_apply_running.value = true
  if (!await apex_store.check_miles_language()) {
    toast.error('toast.milesLanguageNotFound')
    apex_store.download_miles_language_semi_automatic_dialog = true
    is_apply_running.value = false
    return
  }
  await steam_store.check_is_steam_running()
  if (steam_store.is_steam_running) {
    dialog.value = true
    continuously_monitor_the_operational_status()
  } else {
    set_launch_option()
  }
}
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
          <v-btn @click="force_close_steam" color="red"
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
            <v-icon size="x-large"
                    color="red"
            ></v-icon>
          </div>
        </template>
        <template v-slot:append>
          <v-progress-circular
              indeterminate="disable-shrink"
              size="16"
              color="red"
              width="2"
          ></v-progress-circular>
        </template>
      </v-card>
    </template>
  </v-dialog>
</template>

<style scoped>
</style>