<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {emit, listen, type UnlistenFn} from '@tauri-apps/api/event';
import AppTopBar from '@/components/AppTopBar.vue';
import ApexConfigExportPage from '@/components/game/apex/preset/ApexConfigExportPage.vue';
import ApexConfigImportPage from '@/components/game/apex/preset/ApexConfigImportPage.vue';
import {useApexStore} from '@/stores/game/apex.ts';
import {startTauriStoreOnce} from '@/utils/tauri_store.ts';
import {readUtf8File} from '@/ipc/commands.ts';
import {parseApexConfigSnapshot} from '@/utils/game/apex_config_snapshot.ts';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import {SNAPSHOT_WINDOW_READY, SNAPSHOT_WINDOW_LOAD, SNAPSHOT_WINDOW_PROBE,
  type SnapshotWindowRequest} from '@/utils/game/apex_snapshot_window.ts';

const props = defineProps<{kind: 'import' | 'export'}>();
const store = useApexStore();
const {t, te} = useI18n();
const ready = ref(false);
const error = ref('');
const session = ref(0);
const pageBusy = ref(false);
const busy = computed(() => pageBusy.value || store.is_config_snapshot_applying);
const exportSnapshot = ref<ApexConfigSnapshot>();
const exportAccount = ref('');
let generation = 0;
const stops: UnlistenFn[] = [];
let request: SnapshotWindowRequest | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let received = false;

function errorText(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return te(message) ? t(message) : message;
}
async function initialize(next: SnapshotWindowRequest) {
  if (busy.value || disposed) return;
  request = {...next};
  const current = ++generation;
  ready.value = false;
  error.value = '';
  try {
    // Read the selected file before account lookup; parsing failures remain visible.
    const text = next.snapshot || (next.path ? await readUtf8File({path: next.path}) : '');
    const snapshot = parseApexConfigSnapshot(text);
    if (current !== generation || disposed) return;
    if (props.kind === 'import') {
      if (isTauri()) {
        await startTauriStoreOnce('apex', () => store.$tauri.start());
        if (current !== generation || disposed) return;
        if (next.account) store.launcher_selection_key = next.account;
        await store.refresh_apex_accounts({silent: true});
        if (current !== generation || disposed) return;
        if (next.account && store.launcher_selection_key !== next.account) {
          throw new Error(t('apexQuickPreset.accountUnavailable'));
        }
      }
      store.set_config_import_snapshot(snapshot);
    } else {
      exportSnapshot.value = snapshot;
      exportAccount.value = next.account;
    }
    session.value++;
    ready.value = true;
  } catch (reason) {
    if (current === generation && !disposed) error.value = errorText(reason);
  }
}
async function close() {
  if (!busy.value && isTauri()) await getCurrentWindow().close();
}
async function requestSource() {
  error.value = '';
  if (!isTauri()) { error.value = t('apex.configSnapshot.sourceUnavailable'); return; }
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    if (!received && !disposed) error.value = t('apex.configSnapshot.sourceUnavailable');
  }, 10000);
  await emit(SNAPSHOT_WINDOW_READY, {kind: props.kind});
}
async function retry() {
  try { if (request) await initialize(request); else await requestSource(); }
  catch (reason) { error.value = errorText(reason); }
}
onMounted(async () => {
  try {
    if (!isTauri()) { await requestSource(); return; }
    stops.push(await listen<SnapshotWindowRequest>(SNAPSHOT_WINDOW_LOAD, event => {
      received = true;
      clearTimeout(timeout);
      // A ready/probe pair may deliver the same initial payload twice.
      if (request && JSON.stringify(request) === JSON.stringify(event.payload) && !error.value) return;
      void initialize(event.payload);
    }));
    stops.push(await listen(SNAPSHOT_WINDOW_PROBE, () => {
      void emit(SNAPSHOT_WINDOW_READY, {kind: props.kind}).catch(reason => { error.value = errorText(reason); });
    }));
    stops.push(await getCurrentWindow().onCloseRequested(event => {
      if (busy.value) event.preventDefault();
    }));
    if (disposed) { stops.forEach(stop => stop()); return; }
    await requestSource();
  } catch (reason) { error.value = errorText(reason); }
});
onBeforeUnmount(() => { disposed = true; generation++; clearTimeout(timeout); stops.forEach(stop => stop()); });
</script>
<template>
  <v-main class="config-window-root">
    <AppTopBar :title="t('apex.configSnapshot.' + kind + 'Title')" :close-disabled="busy"/>
    <div class="config-window-body">
      <template v-if="ready">
        <ApexConfigExportPage v-if="kind === 'export' && exportSnapshot" :key="session" :snapshot="exportSnapshot" :account="exportAccount"
          @busy="pageBusy = $event" @close="close"/>
        <ApexConfigImportPage v-else-if="kind === 'import'" :key="session" @busy="pageBusy = $event" @close="close"/>
      </template>
      <div v-else-if="error" class="config-window-state">
        <v-alert type="error" variant="tonal" :text="error"/>
        <v-btn @click="retry">{{ t('apexQuickPreset.retry') }}</v-btn>
      </div>
      <div v-else class="config-window-state">
        <v-progress-circular indeterminate color="primary"/>
        <p>{{ t('apex.configSnapshot.waitingForSource') }}</p>
      </div>
    </div>
  </v-main>
</template>
<style scoped>
.config-window-root { display: flex; flex-flow: column; height: 100vh; overflow: hidden; background: rgb(var(--v-theme-background)); }
.config-window-body { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.config-window-body :deep(.config-export-card), .config-window-body :deep(.config-import-card) {
  display: flex; flex-direction: column; flex: 1; width: 100%; min-height: 0; border-radius: 0; box-shadow: none;
}
.config-window-body :deep(.v-card-text) { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 24px; }
.config-window-body :deep(.v-card-actions) { flex: 0 0 auto; padding: 12px 24px; border-top: 1px solid var(--app-border); }
.config-window-body :deep(.v-card-actions .v-btn) { height: var(--app-control-height-action); }
.config-window-state { padding: 24px; width: 100%; }
</style>
