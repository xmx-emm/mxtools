<script setup lang="ts">
import {computed, onUnmounted, ref, shallowRef} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {invoke} from '@tauri-apps/api/core';
import apexStore from '@/stores/game/apex.ts';

const {t} = useI18n();
const toast = useToast();
const apex_store = apexStore();
const dialog = shallowRef(false);
const is_thoroughly_kill = ref(false);
const interval_id = ref<number | any>(null);
const is_apply_running = ref(false);
const is_applying_video_config = ref(false);
const WAIT_CLOSE_POLL_MS = 1500;

const apply_button_class = computed(() => {
  if (apex_store.is_video_config_loading || !apex_store.is_video_config_modified) return '';
  return 'warning-red-text-edge-animate';
});

function stop_monitoring() {
  if (!interval_id.value) return;
  clearInterval(interval_id.value);
  interval_id.value = null;
}

async function apply_video_config() {
  if (is_applying_video_config.value) return;
  is_applying_video_config.value = true;
  try {
    await apex_store.apply_apex_video_config();
  } finally {
    is_applying_video_config.value = false;
    is_apply_running.value = false;
    dialog.value = false;
  }
}

async function force_close_apex() {
  is_thoroughly_kill.value = true;
  stop_monitoring();
  await invoke('thoroughly_kill_apex');
  if (await invoke<boolean>('apex_is_running')) {
    toast.error('toast.cannotCloseApex');
    is_thoroughly_kill.value = false;
    continuously_monitor_until_closed();
    return;
  }
  is_thoroughly_kill.value = false;
  dialog.value = false;
  await apply_video_config();
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
    const still_running = await invoke<boolean>('apex_is_running');
    if (!still_running) {
      stop_monitoring();
      await apply_video_config();
    }
  }, WAIT_CLOSE_POLL_MS);
}

async function apply_check() {
  if (apex_store.is_video_config_loading) return;
  if (!apex_store.is_video_config_modified) {
    toast.info('apex.videoConfigNoChanges');
    return;
  }
  is_apply_running.value = true;
  try {
    const running = await invoke<boolean>('apex_is_running');
    if (running) {
      dialog.value = true;
      continuously_monitor_until_closed();
    } else {
      stop_monitoring();
      await apply_video_config();
    }
  } catch {
    is_apply_running.value = false;
  }
}

onUnmounted(() => {
  stop_monitoring();
});
</script>

<template>
  <v-dialog v-model="dialog" max-width="400" persistent>
    <template v-slot:activator>
      <v-btn
        @click.stop="apply_check"
        :loading="apex_store.is_video_config_saving || is_apply_running"
        :title="t('apex.applyVideoConfig')"
        :class="apply_button_class"
      >
        {{ t('apex.apply') }}
      </v-btn>
    </template>
    <template v-slot:default>
      <v-card
        prepend-icon="mdi-gamepad-variant"
        :title="t('apex.closeApex')"
      >
        <v-card-text>
          <p class="mb-0">
            {{ t('apex.closeApexVideoConfigTip') }}
          </p>
        </v-card-text>
        <template v-slot:actions>
          <v-btn
            @click="force_close_apex"
            color="red"
            :loading="is_thoroughly_kill"
          >
            {{ t('apex.forceClose') }}
          </v-btn>
          <v-spacer/>
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
