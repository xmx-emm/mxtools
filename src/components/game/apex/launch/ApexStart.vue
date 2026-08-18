<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {openUrl} from '@tauri-apps/plugin-opener';
import {sleep} from '@/utils/time.ts';
import {ref} from 'vue';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';

const { t } = useI18n();
const is_launching = ref(false);
const toast = useToast();
const apex_store = useApexStore();

/** 仅 Steam 帐户提供一键启动；EA 请在客户端内点「开始」。 */
async function start_apex() {
  is_launching.value = true;
  try {
    await openUrl(apex_store.open_apex_url);
    toast.info(t('apex.startApex'));
    await sleep(2000);
  } catch (e) {
    const detail = (e instanceof Error ? e.message : String(e ?? '')).trim();
    toast.error(detail || t('apex.startApex'), {timeout: 8000});
  } finally {
    is_launching.value = false;
  }
}
</script>

<template>
  <v-btn
    v-if="apex_store.active_account_is_steam"
    @click="start_apex"
    :loading="is_launching"
    :title="`${t('apex.startApex')} ${apex_store.open_apex_url}`"
  >
    {{ t('apex.startApex') }}
  </v-btn>
</template>

<style scoped>
</style>
