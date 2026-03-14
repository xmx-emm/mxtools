<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {useSettingsStore} from '@/stores/settings';
import {uiStyleStore} from '@/stores/style.ts';
import {computed, ref} from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { openAboutWindow } from '@/utils/windows.ts';
import FeedbackErrorDialog from '@/components/settings/FeedbackErrorDialog.vue';
import ClearPersistedDataDialog from '@/components/settings/ClearPersistedDataDialog.vue';
import ThemeColorPicker from '@/components/settings/ThemeColorPicker.vue';
import type {LocaleCode} from '@/utils/locale';
import {resolveLocale} from '@/utils/locale';
import {useToast} from 'vue-toastification';

const { t, locale: i18nLocale } = useI18n();
const settingsStore = useSettingsStore();
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
  <div class="page-content">
    <h2 class="text-h6 font-weight-medium mb-4" style="letter-spacing: -0.02em;">
      {{ t('settings.title') }}
    </h2>

    <!-- 外观设置 -->
    <v-card variant="flat" class="settings-card mb-4">
      <v-card-text class="d-flex flex-column" style="gap: 16px;">
        <v-select
          v-model="editTheme"
          :items="themeItems"
          :label="t('settings.theme')"
          item-title="title"
          item-value="value"
          @update:model-value="uiStore.setTheme(editTheme)"
        />

        <ThemeColorPicker />

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
          <v-btn color="primary" variant="tonal" rounded="lg" @click="openLogFolder">
            {{ t('settings.openLogFolder') }}
          </v-btn>
          <FeedbackErrorDialog />
          <ClearPersistedDataDialog @cleared="onCleared" />
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.settings-card {
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 12px;
}
</style>
