<script setup lang="ts">
import {open, save} from '@tauri-apps/plugin-dialog';
import {ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import type {WubiLexiconInfo} from '@/types/inputMethod.ts';
import {useStateStore} from '@/stores/state.ts';
import {
  exportWubiUserPhrases,
  getWubiLexiconInfo,
  importWubiSystemLexicon,
  importWubiUserPhrases,
  openMsSettingsPage,
  restoreWubiSystemLexicon,
} from '@/ipc/commands.ts';

const props = defineProps<{
  visible: boolean;
}>();

const { t } = useI18n();
const toast = useToast();
const appState = useStateStore();
const info = ref<WubiLexiconInfo | null>(null);
const loading = ref(false);
const saving = ref(false);
const tab = ref('system');

async function loadInfo() {
  loading.value = true;
  try {
    info.value = await getWubiLexiconInfo();
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    loading.value = false;
  }
}

async function pickAndImport(importFn: (args: {filePath: string}) => Promise<void>) {
  const selected = await open({
    multiple: false,
    filters: [
      { name: 'Lex/Txt', extensions: ['lex', 'txt'] },
    ],
  });
  if (!selected || typeof selected !== 'string') return;
  saving.value = true;
  try {
    await importFn({filePath: selected});
    await loadInfo();
    toast.success(t('inputMethod.wubiLexicon.importDone'));
    toast.info(t('inputMethod.restartHint'));
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function exportUserPhrases() {
  const selected = await save({
    defaultPath: 'wubi_user_phrases.txt',
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
  if (!selected || typeof selected !== 'string') return;
  saving.value = true;
  try {
    await exportWubiUserPhrases({filePath: selected});
    toast.success(t('inputMethod.wubiLexicon.exportDone'));
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function restoreSystemLex() {
  saving.value = true;
  try {
    await restoreWubiSystemLexicon({backupId: null});
    await loadInfo();
    toast.success(t('inputMethod.wubiLexicon.restoreDone'));
    toast.info(t('inputMethod.restartHint'));
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function openWubiUdpSettings() {
  try {
    await openMsSettingsPage({
      uri: 'ms-settings:regionlanguage-chsime-wubi-udp',
    });
  } catch (e: unknown) {
    toast.error(String(e));
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

watch(
  () => props.visible,
  (v) => {
    if (v) void loadInfo();
  },
  { immediate: true },
);
</script>

<template>
  <v-card v-if="visible" variant="flat" class="app-section wubi-panel">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('inputMethod.wubiLexicon.title') }}
    </v-card-title>
    <v-card-text>
      <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3"/>
      <template v-else-if="info">
        <v-tabs v-model="tab" density="compact" class="mb-3">
          <v-tab value="system">{{ t('inputMethod.wubiLexicon.systemTab') }}</v-tab>
          <v-tab value="user">{{ t('inputMethod.wubiLexicon.userTab') }}</v-tab>
        </v-tabs>
        <v-window v-model="tab">
          <v-window-item value="system">
            <p class="text-caption text-medium-emphasis mb-2">
              {{ info.system_lex_path }} ({{ formatSize(info.system_lex_size) }})
            </p>
            <p class="text-caption text-medium-emphasis mb-3">
              {{ t('inputMethod.wubiLexicon.systemHint') }}
            </p>
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                variant="tonal"
                rounded="lg"
                :loading="saving"
                :disabled="!appState.is_elevated"
                @click="pickAndImport(importWubiSystemLexicon)"
              >
                {{ t('inputMethod.wubiLexicon.importSystem') }}
              </v-btn>
              <v-btn
                variant="outlined"
                rounded="lg"
                :loading="saving"
                :disabled="!appState.is_elevated || info.backups.length === 0"
                @click="restoreSystemLex"
              >
                {{ t('inputMethod.wubiLexicon.restoreSystem') }}
              </v-btn>
            </div>
          </v-window-item>
          <v-window-item value="user">
            <p class="text-caption text-medium-emphasis mb-2">
              {{ info.user_udp_path }} ({{ formatSize(info.user_udp_size) }})
            </p>
            <p class="text-caption text-medium-emphasis mb-3">
              {{ t('inputMethod.wubiLexicon.userHint') }}
            </p>
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                variant="tonal"
                rounded="lg"
                :loading="saving"
                @click="pickAndImport(importWubiUserPhrases)"
              >
                {{ t('inputMethod.wubiLexicon.importUser') }}
              </v-btn>
              <v-btn
                variant="outlined"
                rounded="lg"
                :loading="saving"
                @click="exportUserPhrases"
              >
                {{ t('inputMethod.wubiLexicon.exportUser') }}
              </v-btn>
              <v-btn
                variant="text"
                rounded="lg"
                @click="openWubiUdpSettings"
              >
                {{ t('inputMethod.wubiLexicon.openUdpSettings') }}
              </v-btn>
            </div>
          </v-window-item>
        </v-window>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.wubi-panel {
  margin-top: 14px;
  overflow: hidden;
  border-radius: 16px;
  background: var(--app-layer);
}

.wubi-panel :deep(.v-card-title) {
  padding: 17px 18px 5px;
  font-size: 13px !important;
  font-weight: 680 !important;
}

.wubi-panel :deep(.v-card-text) {
  padding: 8px 18px 18px;
}
</style>
