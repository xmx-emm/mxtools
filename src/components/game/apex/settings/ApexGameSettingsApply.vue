<script setup lang="ts">
import {computed, ref, shallowRef} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {apexIsRunning, thoroughlyKillApex} from '@/ipc/commands.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import {useProcessPollUntilExit} from '@/composables/useProcessPollUntilExit.ts';

const {t} = useI18n();
const toast = useToast();
const apex_store = useApexStore();
const dialog = shallowRef(false);
const killing = ref(false);
const waiting = ref(false);

const buttonClass = computed(() => apex_store.is_game_settings_modified
  ? 'warning-red-text-edge-animate'
  : '');

async function applyNow() {
  waiting.value = true;
  try {
    await apex_store.apply_apex_game_settings();
  } finally {
    waiting.value = false;
    dialog.value = false;
  }
}

const {start: startMonitoring, stop: stopMonitoring} = useProcessPollUntilExit({
  isRunning: apexIsRunning,
  pollMs: 1500,
  onExit: applyNow,
});

async function applyCheck() {
  if (!apex_store.is_game_settings_modified) {
    toast.info('apex.gameSettings.noChanges');
    return;
  }
  if (await apexIsRunning()) {
    dialog.value = true;
    waiting.value = true;
    startMonitoring();
    return;
  }
  await applyNow();
}

async function forceClose() {
  killing.value = true;
  stopMonitoring();
  await thoroughlyKillApex();
  if (await apexIsRunning()) {
    toast.error('toast.cannotCloseApex');
    killing.value = false;
    startMonitoring();
    return;
  }
  killing.value = false;
  await applyNow();
}

function cancel() {
  stopMonitoring();
  dialog.value = false;
  waiting.value = false;
  killing.value = false;
}
</script>

<template>
  <v-btn
    :loading="apex_store.is_game_settings_saving || waiting"
    :class="buttonClass"
    :title="t('apex.gameSettings.apply')"
    @click="applyCheck"
  >
    {{ t('apex.apply') }}
  </v-btn>

  <v-dialog v-model="dialog" max-width="420" persistent>
    <v-card prepend-icon="mdi-gamepad-variant" :title="t('apex.closeApex')">
      <v-card-text>{{ t('apex.gameSettings.closeApexTip') }}</v-card-text>
      <v-card-actions>
        <v-btn color="error" variant="flat" :loading="killing" @click="forceClose">
          {{ t('apex.forceClose') }}
        </v-btn>
        <v-spacer/>
        <v-btn variant="text" :disabled="killing" @click="cancel">{{ t('common.cancel') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
