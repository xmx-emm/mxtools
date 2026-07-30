<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, reactive, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {openPath} from '@tauri-apps/plugin-opener';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import {useSettingsStore} from '@/stores/settings.ts';
import {useDebugStore} from '@/stores/debug.ts';
import {useUiStyleStore} from '@/stores/style.ts';
import {getLogFolderPath, setTrayBetaFeatures, setTrayLocale} from '@/ipc/commands.ts';
import {openAboutWindow} from '@/utils/windows.ts';
import FeedbackErrorDialog from '@/components/settings/FeedbackErrorDialog.vue';
import ClearPersistedDataDialog from '@/components/settings/ClearPersistedDataDialog.vue';
import ThemeColorPicker from '@/components/settings/ThemeColorPicker.vue';
import ShortcutInput from '@/components/settings/ShortcutInput.vue';
import type {LocaleCode} from '@/utils/locale.ts';
import {applyDocumentLocale, resolveLocale} from '@/utils/locale.ts';
import {setAppLocale} from '@/i18n/i18n.ts';
import {applyLocaleToggleShortcut, DEFAULT_TOGGLE_LOCALE_SHORTCUT} from '@/utils/global-shortcuts.ts';
import {
  APEX_Q_PREFS_CHANGED_EVENT,
  DEFAULT_APEX_Q_HOTKEY,
  loadApexQPrefs,
  type ApexQPrefs,
} from '@/types/apex_q.ts';
import {applyApexQPrefs, bootstrapApexQFromStorage, syncApexQHotkey} from '@/utils/apex_q.ts';

type SettingsTab = 'general' | 'shortcuts' | 'about';

const {t} = useI18n();
const settingsStore = useSettingsStore();
const debugStore = useDebugStore();
const uiStore = useUiStyleStore();
const toast = useToast();
const currentWindowLabel = getCurrentWindow().label;
let unlistenApexQPrefs: UnlistenFn | null = null;

const activeTab = ref<SettingsTab>('general');
const editTheme = ref(uiStore.theme);
const apexQPrefs = reactive<ApexQPrefs>(loadApexQPrefs());

const tabs = computed(() => [
  {id: 'general' as const, title: t('settings.tabGeneral'), icon: 'mdi-tune-variant'},
  {id: 'shortcuts' as const, title: t('settings.tabShortcuts'), icon: 'mdi-keyboard-outline'},
  {id: 'about' as const, title: t('settings.tabAbout'), icon: 'mdi-information-outline'},
]);
const themeItems = computed(() => [
  {value: 'system', title: t('settings.themeSystem')},
  {value: 'light', title: t('settings.themeLight')},
  {value: 'dark', title: t('settings.themeDark')},
]);
const localeItems = computed(() => [
  {value: 'system' as LocaleCode, title: t('settings.languageSystem')},
  {value: 'zh-CN' as LocaleCode, title: t('settings.languageZh')},
  {value: 'en-US' as LocaleCode, title: t('settings.languageEn')},
]);

async function applyLocale(locale: LocaleCode) {
  settingsStore.setLocale(locale);
  const resolved = resolveLocale(locale);
  const activated = await setAppLocale(resolved);
  if (!activated) return;
  applyDocumentLocale(locale);
  void setTrayLocale(resolved).catch((e) => console.warn('sync tray locale failed', e));
}

async function openLogFolder() {
  try {
    await openPath(await getLogFolderPath());
  } catch (e) {
    toast.error(String(e));
  }
}

function onCleared() {
  editTheme.value = uiStore.theme;
  Object.assign(apexQPrefs, loadApexQPrefs());
  void onBetaFeaturesEnabled(false);
}

function onThemeChange(value: string) {
  void uiStore.setTheme(value);
}

function onToggleLocaleShortcut(value: string) {
  settingsStore.setToggleLocaleShortcut(value || DEFAULT_TOGGLE_LOCALE_SHORTCUT);
  void applyLocaleToggleShortcut();
  if (!value) toast.info(t('settings.shortcutResetDefault'));
}

function onToggleLocaleEnabled(v: boolean | null) {
  settingsStore.setToggleLocaleShortcutEnabled(v);
}

async function onBetaFeaturesEnabled(v: boolean | null) {
  const enabled = v ?? false;
  settingsStore.setBetaFeaturesEnabled(enabled);
  await setTrayBetaFeatures(enabled).catch((error) => {
    console.warn('sync tray beta features failed', error);
  });
  try {
    if (enabled) {
      await bootstrapApexQFromStorage();
    } else {
      await syncApexQHotkey({...loadApexQPrefs(), enabled: false});
    }
  } catch (error) {
    console.warn('sync beta apex-q state failed', error);
  }
}

async function persistApexQ(changedKeys: readonly (keyof ApexQPrefs)[]) {
  try {
    await applyApexQPrefs(apexQPrefs, {changedKeys});
  } catch {
    toast.error(t('settings.shortcutRegisterFailed'));
  }
}

async function onApexQEnabled(v: boolean | null) {
  apexQPrefs.enabled = v ?? false;
  await persistApexQ(['enabled']);
  if (apexQPrefs.enabled && !apexQPrefs.setupDone) {
    toast.info(t('settings.shortcutApexQNeedSetup'));
  }
}

async function onApexQHotkey(value: string) {
  apexQPrefs.hotkey = value || DEFAULT_APEX_Q_HOTKEY;
  await persistApexQ(['hotkey']);
  if (!value) toast.info(t('settings.shortcutResetDefault'));
}

function onShortcutCaptureError(reason: 'invalid' | 'empty', scope: 'app' | 'apexQ' = 'app') {
  if (reason !== 'invalid') return;
  toast.warning(scope === 'apexQ'
    ? t('settings.shortcutApexQInvalid')
    : t('settings.shortcutNeedModifier'));
}

async function focusTabAt(index: number) {
  const tab = tabs.value[index];
  if (!tab) return;
  activeTab.value = tab.id;
  await nextTick();
  document.getElementById(`settings-tab-${tab.id}`)?.focus({preventScroll: true});
}

function onTabKeydown(event: KeyboardEvent, index: number) {
  let nextIndex: number | undefined;
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.value.length;
  if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.value.length) % tabs.value.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.value.length - 1;
  if (nextIndex == null) return;
  event.preventDefault();
  void focusTabAt(nextIndex);
}

watch(activeTab, (tab) => {
  if (tab === 'shortcuts') Object.assign(apexQPrefs, loadApexQPrefs());
});

onMounted(async () => {
  unlistenApexQPrefs = await listen<{source?: unknown}>(APEX_Q_PREFS_CHANGED_EVENT, (event) => {
    if (event.payload?.source !== currentWindowLabel) {
      Object.assign(apexQPrefs, loadApexQPrefs());
    }
  });
});
onUnmounted(() => {
  unlistenApexQPrefs?.();
  unlistenApexQPrefs = null;
});
</script>

<template>
  <div class="app-page settings-page">
    <header class="app-page__header settings-header">
      <div class="app-page__heading">
        <div class="app-page__eyebrow">MxTools</div>
        <h1 class="app-page__title">{{ t('settings.title') }}</h1>
        <p class="app-page__subtitle">{{ t('settings.subtitle') }}</p>
      </div>
      <nav class="settings-tabs" role="tablist">
        <button
          v-for="(tab, tabIndex) in tabs"
          :key="tab.id"
          :id="`settings-tab-${tab.id}`"
          type="button"
          role="tab"
          class="settings-tab"
          :class="{'settings-tab--active': activeTab === tab.id}"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`settings-panel-${tab.id}`"
          :tabindex="activeTab === tab.id ? 0 : -1"
          @click="activeTab = tab.id"
          @keydown="onTabKeydown($event, tabIndex)"
        >
          <v-icon :icon="tab.icon" size="16"/>
          <span>{{ tab.title }}</span>
        </button>
      </nav>
    </header>

    <div class="app-page__scroll">
      <main class="app-page__content settings-content">
        <div
          v-show="activeTab === 'general'"
          id="settings-panel-general"
          class="settings-panel settings-general-grid"
          role="tabpanel"
          aria-labelledby="settings-tab-general"
        >
          <section class="app-section settings-section">
            <header class="settings-section-header">
              <span class="settings-section-icon"><v-icon icon="mdi-rocket-launch-outline" size="18"/></span>
              <div>
                <h2>{{ t('settings.windowBehavior') }}</h2>
                <p>{{ t('settings.windowBehaviorHint') }}</p>
              </div>
            </header>
            <div class="settings-rows">
              <label class="setting-row">
                <span><strong>{{ t('settings.autostart') }}</strong></span>
                <v-switch
                  :model-value="settingsStore.autostart"
                  hide-details
                  color="primary"
                  @update:model-value="settingsStore.setAutostart"
                />
              </label>
              <label class="setting-row">
                <span>
                  <strong>{{ t('settings.startInTray') }}</strong>
                  <small>{{ t('settings.startInTrayHint') }}</small>
                </span>
                <v-switch
                  :model-value="settingsStore.startInTray"
                  hide-details
                  color="primary"
                  @update:model-value="settingsStore.setStartInTray"
                />
              </label>
              <label class="setting-row">
                <span>
                  <strong>{{ t('settings.closeToTray') }}</strong>
                  <small>{{ t('settings.closeToTrayHint') }}</small>
                </span>
                <v-switch
                  :model-value="settingsStore.closeToTray"
                  hide-details
                  color="primary"
                  @update:model-value="settingsStore.setCloseToTray"
                />
              </label>
            </div>
          </section>

          <section class="app-section settings-section">
            <header class="settings-section-header">
              <span class="settings-section-icon"><v-icon icon="mdi-cog-outline" size="18"/></span>
              <div>
                <h2>{{ t('settings.preferences') }}</h2>
                <p>{{ t('settings.preferencesHint') }}</p>
              </div>
            </header>
            <div class="settings-rows">
              <label class="setting-row">
                <span><strong>{{ t('settings.restoreLastPage') }}</strong></span>
                <v-switch
                  :model-value="settingsStore.restoreLastRoute"
                  hide-details
                  color="primary"
                  @update:model-value="settingsStore.setRestoreLastRoute"
                />
              </label>
              <label class="setting-row">
                <span>
                  <strong>{{ t('settings.debugMode') }}</strong>
                  <small>{{ t('settings.debugModeHint') }}</small>
                </span>
                <v-switch
                  :model-value="debugStore.enabled"
                  hide-details
                  color="primary"
                  @update:model-value="debugStore.setEnabled"
                />
              </label>
              <label class="setting-row">
                <span>
                  <strong>{{ t('settings.betaFeatures') }}</strong>
                  <small>{{ t('settings.betaFeaturesHint') }}</small>
                </span>
                <v-switch
                  :model-value="settingsStore.betaFeaturesEnabled"
                  hide-details
                  color="primary"
                  @update:model-value="onBetaFeaturesEnabled"
                />
              </label>
            </div>
          </section>

          <section class="app-section settings-section settings-appearance">
            <header class="settings-section-header">
              <span class="settings-section-icon"><v-icon icon="mdi-palette-outline" size="18"/></span>
              <div>
                <h2>{{ t('settings.appearance') }}</h2>
                <p>{{ t('settings.appearanceHint') }}</p>
              </div>
            </header>
            <div class="appearance-selects">
              <v-select
                :model-value="settingsStore.locale"
                :items="localeItems"
                :label="t('settings.language')"
                item-title="title"
                item-value="value"
                @update:model-value="applyLocale"
              />
              <v-select
                v-model="editTheme"
                :items="themeItems"
                :label="t('settings.theme')"
                item-title="title"
                item-value="value"
                @update:model-value="onThemeChange"
              />
            </div>
            <div class="appearance-picker"><ThemeColorPicker/></div>
          </section>
        </div>

        <div
          v-show="activeTab === 'shortcuts'"
          id="settings-panel-shortcuts"
          class="settings-panel settings-panel--shortcuts"
          role="tabpanel"
          aria-labelledby="settings-tab-shortcuts"
        >
          <section class="app-section settings-section">
            <header class="settings-section-header">
              <span class="settings-section-icon"><v-icon icon="mdi-keyboard-outline" size="18"/></span>
              <div>
                <h2>{{ t('settings.tabShortcuts') }}</h2>
                <p>{{ t('settings.shortcutTableHint') }}</p>
              </div>
            </header>
            <div class="shortcut-list">
              <article class="shortcut-row">
                <v-switch
                  :model-value="settingsStore.toggleLocaleShortcutEnabled"
                  hide-details
                  color="primary"
                  @update:model-value="onToggleLocaleEnabled"
                />
                <div class="shortcut-copy">
                  <strong>{{ t('settings.shortcutToggleLocale') }}</strong>
                  <span>{{ t('settings.shortcutAppOnlyHint') }}</span>
                </div>
                <span class="scope-badge">{{ t('settings.shortcutApp') }}</span>
                <ShortcutInput
                  scope="app"
                  :disabled="!settingsStore.toggleLocaleShortcutEnabled"
                  :model-value="settingsStore.resolvedToggleLocaleShortcut"
                  @update:model-value="onToggleLocaleShortcut"
                  @capture-error="onShortcutCaptureError($event, 'app')"
                />
              </article>
              <article v-if="settingsStore.betaFeaturesEnabled" class="shortcut-row">
                <v-switch
                  :model-value="apexQPrefs.enabled"
                  hide-details
                  color="primary"
                  @update:model-value="onApexQEnabled"
                />
                <div class="shortcut-copy">
                  <strong>
                    {{ t('settings.shortcutApexQ') }}
                    <span class="mx-beta-badge ml-1" :title="t('settings.betaFeaturesHint')">{{ t('common.beta') }}</span>
                  </strong>
                  <span>{{ t('settings.shortcutGlobalOnlyHint') }}</span>
                </div>
                <span class="scope-badge scope-badge--global">{{ t('settings.shortcutGlobal') }}</span>
                <ShortcutInput
                  scope="apexQ"
                  :disabled="!apexQPrefs.enabled"
                  :model-value="apexQPrefs.hotkey || DEFAULT_APEX_Q_HOTKEY"
                  @update:model-value="onApexQHotkey"
                  @capture-error="onShortcutCaptureError($event, 'apexQ')"
                />
              </article>
            </div>
          </section>
        </div>

        <div
          v-show="activeTab === 'about'"
          id="settings-panel-about"
          class="settings-panel"
          role="tabpanel"
          aria-labelledby="settings-tab-about"
        >
          <section class="app-section settings-section about-section">
            <header class="settings-section-header">
              <span class="settings-section-icon"><v-icon icon="mdi-lifebuoy" size="18"/></span>
              <div>
                <h2>{{ t('settings.supportAndData') }}</h2>
                <p>{{ t('settings.supportAndDataHint') }}</p>
              </div>
            </header>
            <div class="about-actions">
              <v-btn prepend-icon="mdi-information-outline" variant="tonal" rounded="lg" @click="openAboutWindow">
                {{ t('settings.about') }}
              </v-btn>
              <v-btn prepend-icon="mdi-text-box-search-outline" variant="tonal" rounded="lg" @click="openLogFolder">
                {{ t('settings.openLogFolder') }}
              </v-btn>
              <FeedbackErrorDialog/>
              <ClearPersistedDataDialog @cleared="onCleared"/>
            </div>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.settings-header { align-items: flex-end; }
.settings-content { --app-page-max-width: 960px; }
.settings-tabs {
  display: flex;
  flex: 0 0 auto;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--app-border);
  border-radius: 11px;
  background: var(--app-layer-muted);
}
.settings-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: var(--app-control-height-compact);
  gap: 6px;
  padding: 0 11px;
  border: 0;
  border-radius: 8px;
  color: rgba(var(--v-theme-on-surface), 0.54);
  background: transparent;
  font: inherit;
  font-size: 11px;
  font-weight: 610;
  cursor: pointer;
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-base) var(--app-ease-standard),
    box-shadow var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-fast) var(--app-ease-emphasized);
}
.settings-tab:hover {
  color: rgba(var(--v-theme-on-surface), 0.85);
  background: rgba(var(--v-theme-on-surface), 0.045);
}
.settings-tab:active { transform: scale(0.96); }
.settings-tab :deep(.v-icon) {
  transition: transform var(--app-motion-base) var(--app-ease-emphasized);
}
.settings-tab--active {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.settings-tab--active :deep(.v-icon) { transform: translateY(-1px) scale(1.08); }
.settings-panel {
  width: 100%;
  animation: settings-panel-in 320ms var(--app-ease-emphasized) both;
}
.settings-general-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 14px;
}
.settings-general-grid .app-section + .app-section { margin-top: 0; }
.settings-appearance { grid-column: 1 / -1; }
.settings-section { overflow: hidden; }
.settings-section-header {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 17px 18px 14px;
}
.settings-section-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 10px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.09);
}
.settings-section-header h2 { margin: 0; font-size: 13px; font-weight: 680; }
.settings-section-header p {
  margin: 3px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 10px;
  line-height: 1.5;
}
.settings-rows { border-top: 1px solid var(--app-border); }
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  gap: 20px;
  padding: 10px 18px;
}
.setting-row + .setting-row { border-top: 1px solid rgba(var(--v-border-color), 0.07); }
.setting-row > span { display: flex; flex-direction: column; min-width: 0; gap: 3px; }
.setting-row strong { font-size: 11px; font-weight: 620; }
.setting-row small { color: rgba(var(--v-theme-on-surface), 0.46); font-size: 9px; line-height: 1.4; }
.setting-row :deep(.v-switch) { flex: 0 0 auto; }
.appearance-selects {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 0 18px 16px;
}
.appearance-picker { padding: 16px 18px 18px; border-top: 1px solid var(--app-border); }
.shortcut-list { border-top: 1px solid var(--app-border); }
.shortcut-row {
  display: grid;
  grid-template-columns: 42px minmax(220px, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  min-height: 78px;
  padding: 12px 18px;
}
.shortcut-row + .shortcut-row { border-top: 1px solid rgba(var(--v-border-color), 0.075); }
.shortcut-copy { display: flex; flex-direction: column; min-width: 0; gap: 4px; }
.shortcut-copy strong { font-size: 12px; font-weight: 640; }
.shortcut-copy span { color: rgba(var(--v-theme-on-surface), 0.46); font-size: 9px; line-height: 1.45; }
.shortcut-copy strong .mx-beta-badge { color: rgb(var(--v-theme-warning)); font-size: 8px; line-height: 1; }
.scope-badge {
  padding: 3px 7px;
  border-radius: 999px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  background: var(--app-layer-muted);
  font-size: 8px;
  font-weight: 680;
}
.scope-badge--global { color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.09); }
.about-actions { display: flex; flex-wrap: wrap; gap: 9px; padding: 2px 18px 18px 63px; }
@keyframes settings-panel-in {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (max-width: 820px) {
  .settings-header { align-items: flex-start; flex-direction: column; }
  .settings-general-grid { grid-template-columns: 1fr; }
  .settings-appearance { grid-column: auto; }
  .shortcut-row { grid-template-columns: 42px minmax(0, 1fr) auto; }
  .shortcut-row > :last-child { grid-column: 2 / -1; justify-self: start; }
}
@media (max-width: 620px) {
  .settings-tab span { display: none; }
  .settings-tab { padding-inline: 10px; }
  .appearance-selects { grid-template-columns: 1fr; }
  .about-actions { padding-left: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .settings-panel { animation: none; }
  .settings-tab:active,
  .settings-tab--active :deep(.v-icon) { transform: none; }
}
</style>
