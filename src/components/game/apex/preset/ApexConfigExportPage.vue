<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {save} from '@tauri-apps/plugin-dialog';
import {useToast} from 'vue-toastification';
import {emitApexConfigChanged} from '@/utils/game/apex_config_events.ts';
import {explorerFolder, getApexSnapshotDefaults, writeUtf8File} from '@/ipc/commands.ts';
import {changedSnapshot} from '@/utils/game/apex_snapshot_changes.ts';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import {apexConfigSnapshotFilename, buildApexConfigSnapshot, stringifyApexConfigSnapshot} from '@/utils/game/apex_config_snapshot.ts';
import {snapshotDetails, type SnapshotBlock} from '@/utils/game/apex_snapshot_details.ts';
import ApexSnapshotSection from './ApexSnapshotSection.vue';

const props = defineProps<{snapshot: ApexConfigSnapshot; account?: string; defaults?: ApexConfigSnapshot}>();
const emit = defineEmits<{(event: 'close'): void; (event: 'busy', value: boolean): void}>();
const {t} = useI18n();
const toast = useToast();
const exporting = ref(false);
const only_modified = ref(true);
const baseline = ref<ApexConfigSnapshot | null>(props.defaults ?? null);
const defaults_loading = ref(false);
const defaults_error = ref('');
async function loadDefaults() {
  if (props.defaults) return;
  defaults_loading.value = true;
  defaults_error.value = '';
  try {
    const [kind, ...id] = (props.account ?? '').split(':');
    if ((kind !== 'steam' && kind !== 'ea') || !id.join(':')) throw new Error(t('apex.noLauncherAccount'));
    const value = await getApexSnapshotDefaults({launcher: {kind, id: id.join(':'), name: ''}});
    baseline.value = {kind: 'apex-config-snapshot', version: 1, exportedAt: '', launchOptions: {raw: ''},
      videoConfig: value.videoConfig, gameSettings: {settings: value.settings, profile: value.profile, bindings: value.bindings}};
  } catch (error) { defaults_error.value = String(error); }
  finally { defaults_loading.value = false; }
}
onMounted(loadDefaults);
const visible_snapshot = computed(() => only_modified.value
  ? baseline.value ? changedSnapshot(props.snapshot, baseline.value) : null
  : props.snapshot);
const choices = ref<Record<string, boolean>>({launch: true, aiming: true, controller: true, gameSettings: true, bindings: true, video: true});
const blocks = computed(() => ([
  ['launch', 'blockLaunch'], ['aiming', 'blockAiming'], ['controller', 'blockController'],
  ['gameSettings', 'blockGameSettings'], ['bindings', 'blockBindings'], ['video', 'blockVideo'],
] as const).map(([id, label]) => ({
  id, label: 'apex.configSnapshot.' + label, rows: visible_snapshot.value ? snapshotDetails(visible_snapshot.value, id) : [],
  available: id === 'launch' ? !!visible_snapshot.value?.launchOptions
    : id === 'bindings' ? visible_snapshot.value?.gameSettings?.bindings !== undefined
    : !!visible_snapshot.value && snapshotDetails(visible_snapshot.value, id).length > 0,
})));
function selected(id: SnapshotBlock) { return choices.value[id] && blocks.value.some(block => block.id === id && block.available); }
const can_export = computed(() => blocks.value.some(block => selected(block.id)));
async function confirmExport() {
  if (exporting.value || !can_export.value || !visible_snapshot.value) return;
  const displayed = visible_snapshot.value;
  exporting.value = true;
  emit('busy', true);
  try {
    let defaultPath = apexConfigSnapshotFilename();
    try { const folder = await explorerFolder(); if (folder) defaultPath = folder + '\\' + defaultPath; } catch { /* Filename remains usable. */ }
    const output = await save({title: t('apex.configSnapshot.exportTitle'), defaultPath, filters: [{name: 'JSON', extensions: ['json']}]});
    if (!output || typeof output !== 'string') return;
    // Serialize the same draft displayed in the window, never reload it from disk.
    const snapshot = buildApexConfigSnapshot({
      selection: {launchOptions: selected('launch'), videoConfig: selected('video'), gameSettings: selected('gameSettings'),
        aiming: selected('aiming'), controller: selected('controller'), bindings: selected('bindings')},
      launchOptionsRaw: displayed.launchOptions?.raw, videoConfig: displayed.videoConfig,
      gameSettings: displayed.gameSettings,
    });
    await writeUtf8File({path: output, content: stringifyApexConfigSnapshot(snapshot)});
    await emitApexConfigChanged([], {notification: 'snapshotExported'}).catch(error => {
      console.warn('notify snapshot export failed', error);
    });
    emit('busy', false);
    emit('close');
  } catch (error) { toast.error('toast.exportApexConfigSnapshotError\n' + String(error)); }
  finally { exporting.value = false; emit('busy', false); }
}
</script>

<template>
  <v-card class="config-export-card">
    <v-card-text>
      <div class="snapshot-hint"><span>{{ t('apex.configSnapshot.exportHint') }}</span>
        <label class="modified-choice"><input v-model="only_modified" type="checkbox" :disabled="exporting">{{ t('apex.configSnapshot.onlyModified') }}</label>
      </div>
      <p v-if="only_modified && defaults_loading" class="snapshot-hint">{{ t('apex.configSnapshot.exportPreviewLoading') }}</p>
      <div v-if="only_modified && defaults_error" class="defaults-error">
        <span>{{ t('apex.configSnapshot.defaultsFailed') }} {{ defaults_error }}</span>
        <v-btn variant="text" size="small" @click="loadDefaults">{{ t('apexQuickPreset.retry') }}</v-btn>
      </div>
      <ApexSnapshotSection v-for="block in blocks" :key="block.id" v-model="choices[block.id]"
        :title="t(block.label)" :rows="block.rows" :disabled="exporting || !block.available"/>
    </v-card-text>
    <v-card-actions><v-spacer/>
      <v-btn variant="text" :disabled="exporting" @click="emit('close')">{{ t('common.cancel') }}</v-btn>
      <v-btn color="primary" :loading="exporting" :disabled="!can_export" @click="confirmExport">
        {{ t('apex.configSnapshot.exportAction') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
<style scoped>
.snapshot-hint { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; font-size: 12px; color: rgba(var(--v-theme-on-surface), .6); margin: 0 0 12px; }
.modified-choice { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; cursor: pointer; }
.modified-choice input { accent-color: rgb(var(--v-theme-primary)); }
.defaults-error { color: rgb(var(--v-theme-error)); font-size: 12px; overflow-wrap: anywhere; }
</style>
