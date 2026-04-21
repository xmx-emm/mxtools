<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {useSettingsStore} from '@/stores/settings';
import {useDebugStore} from '@/stores/debug';
import {uiStyleStore} from '@/stores/style.ts';
import {computed, ref} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {openPath} from '@tauri-apps/plugin-opener';
import {openAboutWindow} from '@/utils/windows.ts';
import FeedbackErrorDialog from '@/components/settings/FeedbackErrorDialog.vue';
import ClearPersistedDataDialog from '@/components/settings/ClearPersistedDataDialog.vue';
import ThemeColorPicker from '@/components/settings/ThemeColorPicker.vue';
import type {LocaleCode} from '@/utils/locale';
import {resolveLocale} from '@/utils/locale';
import {useToast} from 'vue-toastification';

const { t, locale: i18nLocale } = useI18n();
const settingsStore = useSettingsStore();
const debugStore = useDebugStore();
const uiStore = uiStyleStore();
const toast = useToast();

const editTheme = ref(uiStore.theme);
const themeItems = computed(() => [
  { value: 'system', title: t('settings.themeSystem') },
  { value: 'light', title: t('settings.themeLight') },
  { value: 'dark', title: t('settings.themeDark') },
]);

const localeItems = computed(() => [
  { value: 'system' as LocaleCode, title: t('settings.languageSystem') },
  { value: 'zh-CN' as LocaleCode, title: t('settings.languageZh') },
  { value: 'en-US' as LocaleCode, title: t('settings.languageEn') },
]);

function applyLocale(locale: LocaleCode) {
  settingsStore.setLocale(locale);
  i18nLocale.value = resolveLocale(locale);
}

async function openLogFolder() {
  try {
    const path = await invoke<string>('get_log_folder_path');
    await openPath(path);
  } catch (e) {
    toast.error(String(e));
  }
}

function onCleared() {
  editTheme.value = uiStore.theme;
}
</script>

<template>
  <div class="settings-root d-flex flex-column h-100">
    <div class="settings-scroll flex-1">
      <div class="page-content d-flex flex-column h-100">
        <v-card variant="flat" class="settings-card d-flex flex-column h-100">
          <v-card-title class="settings-card-title">
            <h2 class="text-h6 font-weight-medium" style="letter-spacing: -0.02em;">
              {{ t('settings.title') }}
            </h2>
          </v-card-title>
          <v-card-text class="settings-card-body d-flex flex-column" style="gap: 16px;">
            <v-select
              v-model="editTheme"
              :items="themeItems"
              :label="t('settings.theme')"
              item-title="title"
              item-value="value"
              @update:model-value="uiStore.setTheme(editTheme)"
            />

            <ThemeColorPicker/>

            <v-select
              :model-value="settingsStore.locale"
              :items="localeItems"
              :label="t('settings.language')"
              item-title="title"
              item-value="value"
              @update:model-value="applyLocale"
            />
            <v-switch
              :model-value="settingsStore.restoreLastRoute"
              :label="t('settings.restoreLastPage')"
              hide-details
              color="primary"
              @update:model-value="settingsStore.setRestoreLastRoute"
            />
            <div class="d-flex flex-wrap ga-2 mt-2">
              <v-btn color="primary" variant="tonal" rounded="lg" @click="openAboutWindow">
                {{ t('settings.about') }}
              </v-btn>
            </div>
            <v-sheet
              border="md"
              class="pa-6"
              rounded="xl"
            >
              <v-col>
                <v-btn color="primary" variant="tonal" rounded="lg" @click="openLogFolder">
                  {{ t('settings.openLogFolder') }}
                </v-btn>
                <FeedbackErrorDialog/>
                <ClearPersistedDataDialog @cleared="onCleared"/>
                <v-switch
                  :model-value="debugStore.game"
                  :label="t('settings.debugGame')"
                  hide-details
                  color="primary"
                  @update:model-value="debugStore.setGame"
                />
              </v-col>
            </v-sheet>
          </v-card-text>
        </v-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-root {
  min-height: 0;
}

.settings-scroll {
  min-height: 0;
}

.page-content {
  min-height: 0;
  padding: 24px 16px;
}

.settings-card {
  min-height: 0;
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 12px;
}

.settings-card-title {
  flex: 0 0 auto;
  padding: 20px 24px 12px;
}

.settings-card-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 24px 24px;
}
</style>
