<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {openUrl} from '@tauri-apps/plugin-opener';
import {sleep} from '@/utils/time.ts';
import {ref} from 'vue';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import {startApexEa} from '@/ipc/commands.ts';

const { t } = useI18n();
const is_launching = ref(false);
const toast = useToast();
const apex_store = useApexStore();

async function start_apex() {
  if (is_launching.value) return;
  is_launching.value = true;
  try {
    const account = apex_store.active_apex_account;
    if (account?.kind === 'ea') await startApexEa(account.user.id);
    else if (account?.kind === 'steam') await openUrl(apex_store.open_apex_url);
    else return;
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
    v-if="apex_store.active_account_is_steam || apex_store.active_account_is_ea"
    @click="start_apex"
    :loading="is_launching"
    :title="t('apex.startApex')"
  >
    {{ t('apex.startApex') }}
  </v-btn>
</template>

<style scoped>
</style>
