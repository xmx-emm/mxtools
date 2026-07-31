<script setup lang="ts">

import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {TauriEvent} from '@tauri-apps/api/event';
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useRoute} from 'vue-router';
import {tools} from '@/router.ts';
import {useStateStore} from '@/stores/state.ts';
import {createRafScheduler} from '@/utils/raf.ts';
import appIconUrl from '../../src-tauri/icons/32x32.png';

const props = withDefaults(
  defineProps<{
    /** 左侧显示的窗口名称；主窗口可不传 */
    title?: string;
    /** 主工作区才提供命令面板入口；独立工具窗口保持原生标题栏密度。 */
    showCommandPalette?: boolean;
    /** Critical writes may temporarily prevent the window from being closed. */
    closeDisabled?: boolean;
  }>(),
  {title: '', showCommandPalette: false, closeDisabled: false},
);
const emit = defineEmits<{(event: 'open-command-palette'): void}>();

const is_maximized = ref(false);
const state = useStateStore();
const {t} = useI18n();
const appName = computed(() => t('about.appName'));
const route = useRoute();

const routeTitle = computed(() => {
  if (route.path === '/dashboard') return t('dashboard.title');
  if (route.path === '/settings') return t('settings.title');
  for (const category of tools) {
    if (route.path === category.path) return t(category.nameKey);
    const child = category.children.find((item) => item.path === route.path);
    if (child) return t(child.nameKey);
  }
  return '';
});

const resolvedTitle = computed(() => props.title || routeTitle.value);
const commandTitle = computed(() => `${t('commandPalette.title')} (Ctrl+K)`);

async function update_window_state() {
  try {
    is_maximized.value = await WebviewWindow.getCurrent().isMaximized();
  } catch (e) {
    console.warn('update_window_state failed', e);
  }
}

const resizeStateScheduler = createRafScheduler(() => {
  void update_window_state();
});

function close_window() {
  if (props.closeDisabled) return;
  const window = WebviewWindow.getCurrent();
  window.close();
}

function minimize_window() {
  const window = WebviewWindow.getCurrent();
  window.minimize();
  void update_window_state();
}

async function switch_window() {
  const window = WebviewWindow.getCurrent();
  await window.toggleMaximize();
  await update_window_state();
}


const icon = computed(() => {
  return is_maximized.value ? 'mdi-window-restore' : 'mdi-window-maximize';
});

let unlistenResize: (() => void) | null = null;

onMounted(async () => {
  void update_window_state();
  unlistenResize = await WebviewWindow.getCurrent().listen(TauriEvent.WINDOW_RESIZED, () => {
    // 拖拽改窗体尺寸时事件极密；合并到每帧最多一次 IPC
    resizeStateScheduler.schedule();
  });
});

onUnmounted(() => {
  resizeStateScheduler.cancel();
  unlistenResize?.();
});
</script>

<template>
  <v-system-bar window data-tauri-drag-region="true" class="app-title-bar">
    <div class="title-bar-brand" data-tauri-drag-region="true">
      <span class="title-bar-app-mark" data-tauri-drag-region="true">
        <img
          class="title-bar-app-icon"
          :src="appIconUrl"
          alt=""
          draggable="false"
          data-tauri-drag-region="true"
        />
      </span>
      <span class="title-bar-product" data-tauri-drag-region="true">{{ appName }}</span>
      <template v-if="resolvedTitle">
        <span class="title-bar-separator" data-tauri-drag-region="true">/</span>
        <span class="title-bar-label" data-tauri-drag-region="true">{{ resolvedTitle }}</span>
      </template>
    </div>
    <span class="title-bar-drag flex-grow-1" data-tauri-drag-region="true"></span>
    <button
      v-if="props.showCommandPalette"
      type="button"
      class="title-bar-command mx-search-trigger"
      :aria-label="commandTitle"
      :title="commandTitle"
      @click="emit('open-command-palette')"
    >
      <v-icon icon="mdi-magnify" />
      <span class="title-bar-command-label">{{ t('commandPalette.title') }}</span>
      <kbd>Ctrl K</kbd>
    </button>
    <span
      v-if="state.is_elevated"
      class="title-bar-icon"
      :title="t('common.administrator')"
      :aria-label="t('common.administrator')"
    >
      <v-icon icon="mdi-security" />
    </span>
    <div class="title-bar-actions">
      <button
        type="button"
        class="title-bar-btn"
        :aria-label="t('common.minimize')"
        :title="t('common.minimize')"
        @click="minimize_window"
      >
        <v-icon icon="mdi-window-minimize"/>
      </button>
      <button
        type="button"
        class="title-bar-btn"
        :aria-label="is_maximized ? t('common.restore') : t('common.maximize')"
        :title="is_maximized ? t('common.restore') : t('common.maximize')"
        @click="switch_window"
      >
        <v-icon :icon="icon"/>
      </button>
      <button
        type="button"
        class="title-bar-btn title-bar-btn-close"
        :aria-label="t('common.close')"
        :title="t('common.close')"
        :disabled="closeDisabled"
        @click="close_window"
      >
        <v-icon icon="mdi-window-close"/>
      </button>
    </div>
  </v-system-bar>
</template>

<style scoped>
.app-title-bar {
  --title-bar-height: 32px;
  --title-bar-icon-size: 20px;
  height: var(--title-bar-height) !important;
  min-height: var(--title-bar-height);
  flex: 0 0 var(--title-bar-height) !important;
  box-sizing: border-box;
  padding-inline: 0 !important;
  padding-inline-start: 6px !important;
  background: rgba(var(--v-theme-surface), 0.96);
  border-bottom: 1px solid var(--app-border);
  position: relative;
  z-index: 100;
  user-select: none;
}

.title-bar-brand {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
  gap: 6px;
  -webkit-app-region: drag;
  app-region: drag;
}

.title-bar-app-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 23px;
  height: 23px;
  flex: 0 0 23px;
  border-radius: 7px;
  background: rgba(var(--v-theme-primary), 0.08);
  pointer-events: none;
}

.title-bar-app-icon {
  width: 19px;
  height: 19px;
  flex: 0 0 19px;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.title-bar-product {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.86);
  font-size: 11px;
  font-weight: 680;
  line-height: var(--title-bar-height);
  letter-spacing: 0;
  user-select: none;
}

.title-bar-separator {
  color: rgba(var(--v-theme-on-surface), 0.24);
  font-size: 10px;
  user-select: none;
}

.title-bar-label {
  min-width: 0;
  max-width: 42vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 10px;
  font-weight: 560;
  line-height: var(--title-bar-height);
  -webkit-app-region: drag;
  app-region: drag;
  user-select: none;
}

.title-bar-drag {
  -webkit-app-region: drag;
  app-region: drag;
}

.title-bar-actions {
  display: flex;
  height: 100%;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.title-bar-command {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: var(--mx-search-height);
  max-width: min(210px, 24vw);
  margin-inline: 6px 8px;
  padding: 0 7px;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.58);
  border: 1px solid var(--mx-search-border);
  border-radius: var(--mx-search-radius);
  background: var(--mx-search-surface);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  app-region: no-drag;
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    border-color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard);
}

.title-bar-command:hover {
  color: rgb(var(--v-theme-primary));
  border-color: var(--mx-search-border-focus);
  background: var(--mx-search-surface-hover);
}

.title-bar-command:active {
  transform: scale(0.97);
}

.title-bar-command :deep(.v-icon) {
  font-size: 15px;
}

.title-bar-command-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-bar-command kbd {
  flex: 0 0 auto;
  padding: 1px 4px;
  color: currentColor;
  border: 1px solid currentColor;
  border-radius: 3px;
  opacity: 0.62;
  font-family: inherit;
  font-size: 9px;
  line-height: 1.1;
}

.title-bar-actions .title-bar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--title-bar-height);
  height: var(--title-bar-height);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  border-radius: 0;
  opacity: 0.8;
  cursor: pointer;
  -webkit-app-region: no-drag;
  app-region: no-drag;
  transition:
    background-color var(--app-motion-fast) var(--app-ease-standard),
    color var(--app-motion-fast) var(--app-ease-standard),
    opacity var(--app-motion-fast) var(--app-ease-standard);
}

.title-bar-actions .title-bar-btn :deep(.v-icon) {
  font-size: var(--title-bar-icon-size);
  width: 1em;
  height: 1em;
  min-width: 0;
  transition: transform var(--app-motion-fast) var(--app-ease-emphasized);
}

.title-bar-actions .title-bar-btn:hover:not(:disabled) {
  opacity: 1;
  background: rgba(128, 128, 128, 0.15);
}

.title-bar-actions .title-bar-btn:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.title-bar-actions .title-bar-btn:disabled:hover {
  color: inherit;
  background: transparent;
}

.title-bar-actions .title-bar-btn:hover:not(:disabled) :deep(.v-icon) {
  transform: scale(1.05);
}

.title-bar-actions .title-bar-btn:active:not(:disabled) :deep(.v-icon) {
  transform: scale(0.92);
}

.title-bar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  opacity: 0.8;
  border-radius: 6px;
  margin-inline-end: 4px;
  color: rgb(var(--v-theme-warning));
}

.title-bar-actions .title-bar-btn.title-bar-btn-close:hover:not(:disabled) {
  background-color: rgb(232, 17, 35);
  color: rgb(255, 255, 255);
}
</style>
