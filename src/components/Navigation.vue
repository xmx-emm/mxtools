<script setup lang="ts">
import {useRoute, useRouter} from 'vue-router';
import {toolCategoryContainingPath, tools} from '../router.ts';
import appIconUrl from '../../src-tauri/icons/128x128.png';
import {includesRoute} from '../utils/router.ts';
import {computed, onMounted} from 'vue';
import AppVersion from '@/components/utils/AppVersion.vue';
import NavPanelResizeHandle from '@/components/navigation/NavPanelResizeHandle.vue';
import {useSettingsStore} from '@/stores/settings.ts';
import {
  isNavPanelCollapsed,
  NAV_MIN_WIDTH,
  NAV_PRIMARY_MAX,
  NAV_SECONDARY_MAX,
  snapNavPanelWidth,
} from '@/constants/nav_layout.ts';

const router = useRouter();
const route = useRoute();
const settingsStore = useSettingsStore();

const activeTool = computed(() => {
  const categoryPath = toolCategoryContainingPath(route.path);
  if (categoryPath == null) {
    return null;
  }
  return tools.find((tool) => tool.path === categoryPath) ?? null;
});

const showSecondary = computed(
  () => activeTool.value != null && activeTool.value.children.length !== 0,
);

const primaryWidth = computed({
  get: () => settingsStore.navPrimaryWidth,
  set: (v) => settingsStore.setNavPrimaryWidth(v),
});

const secondaryWidth = computed({
  get: () => settingsStore.navSecondaryWidth,
  set: (v) => settingsStore.setNavSecondaryWidth(v),
});

const primaryCollapsed = computed(() => isNavPanelCollapsed(primaryWidth.value));
const secondaryCollapsed = computed(() => isNavPanelCollapsed(secondaryWidth.value));

/** 停在大类页(如 /game),尚未进入子工具页 */
const onToolCategoryRoot = computed(
  () => activeTool.value != null && route.path === activeTool.value.path,
);

onMounted(() => {
  settingsStore.setNavPrimaryWidth(
    snapNavPanelWidth(settingsStore.navPrimaryWidth, NAV_PRIMARY_MAX),
  );
  settingsStore.setNavSecondaryWidth(
    snapNavPanelWidth(settingsStore.navSecondaryWidth, NAV_SECONDARY_MAX),
  );
});
</script>

<template>
  <div class="nav-layout">
    <aside
      class="nav-panel nav-panel--primary"
      :aria-label="$t('nav.toolCenter')"
      :class="{ 'nav-panel--collapsed': primaryCollapsed }"
      :style="{ width: `${primaryWidth}px` }"
    >
      <div class="nav-panel__scroll">
        <v-list density="compact" nav class="nav-list">
          <v-tooltip
            :text="$t('dashboard.title')"
            location="end"
            :disabled="!primaryCollapsed"
            open-delay="300"
          >
            <template #activator="{ props: tipProps }">
              <v-list-item
                v-bind="tipProps"
                :title="$t('about.appName')"
                :subtitle="$t('nav.toolCenter')"
                @click="router.push('/')"
                rounded="lg"
                class="mb-1 nav-brand-item"
              >
                <template #prepend>
                  <span class="nav-brand-mark">
                    <img :src="appIconUrl" alt="" draggable="false"/>
                  </span>
                </template>
              </v-list-item>
            </template>
          </v-tooltip>
          <v-divider class="my-2"/>
          <v-tooltip
            v-for="tool in tools"
            :key="tool.name"
            :text="$t(tool.nameKey)"
            location="end"
            :disabled="!primaryCollapsed"
            open-delay="300"
          >
            <template #activator="{ props: tipProps }">
              <v-list-item
                v-bind="tipProps"
                :title="$t(tool.nameKey)"
                @click="router.push(tool.path)"
                :active="includesRoute(tool.path, route)"
                rounded="lg"
                class="mb-1 nav-tool-item"
                active-class="nav-tool-item-active"
              >
                <template #prepend>
                  <v-icon>{{ tool.icon }}</v-icon>
                </template>
              </v-list-item>
            </template>
          </v-tooltip>
        </v-list>
      </div>

      <div class="nav-panel__append">
        <v-list density="compact" nav class="nav-list">
          <AppVersion class="nav-version"/>
          <v-tooltip
            :text="$t('settings.title')"
            location="end"
            :disabled="!primaryCollapsed"
            open-delay="300"
          >
            <template #activator="{ props: tipProps }">
              <v-list-item
                v-bind="tipProps"
                prepend-icon="mdi-cog"
                @click="router.push('/settings')"
                :title="$t('settings.title')"
                :active="includesRoute('/settings', route)"
                rounded="lg"
                class="mb-1 nav-tool-item"
                active-class="nav-tool-item-active"
                density="compact"
                nav
              />
            </template>
          </v-tooltip>
        </v-list>
      </div>
    </aside>

    <NavPanelResizeHandle
      v-model="primaryWidth"
      :min="NAV_MIN_WIDTH"
      :max="NAV_PRIMARY_MAX"
      :label="$t('nav.resizePanel')"
    />

    <template v-if="showSecondary && activeTool">
      <aside
        :key="activeTool.path"
        class="nav-panel nav-panel--secondary"
        :aria-label="$t(activeTool.nameKey)"
        :class="{ 'nav-panel--collapsed': secondaryCollapsed }"
        :style="{ width: `${secondaryWidth}px` }"
      >
        <div class="nav-panel__scroll nav-panel__scroll--fill">
          <v-list class="py-2 nav-list nav-list--secondary">
            <v-list-subheader
              class="nav-subheader text-uppercase text-caption font-weight-medium px-3 py-2"
              :class="{ 'nav-subheader--root': onToolCategoryRoot }"
            >
              <div
                class="nav-subheader__row d-flex align-center min-width-0"
                :class="{ 'nav-subheader__row--back-only': !onToolCategoryRoot && secondaryCollapsed }"
              >
                <div
                  class="nav-back-slot flex-shrink-0"
                  :class="{ 'nav-back-slot--hidden': onToolCategoryRoot }"
                >
                  <button
                    type="button"
                    class="nav-back-button"
                    :aria-label="$t('nav.backToCategory')"
                    :title="$t('nav.backToCategory')"
                    :tabindex="onToolCategoryRoot ? -1 : 0"
                    :aria-hidden="onToolCategoryRoot ? 'true' : undefined"
                    @click="router.push(activeTool.path)"
                  >
                    <v-icon icon="mdi-chevron-left" size="small" class="nav-back-icon" aria-hidden="true" />
                  </button>
                </div>
                <v-tooltip
                  :text="$t(activeTool.nameKey)"
                  location="end"
                  :disabled="!secondaryCollapsed || onToolCategoryRoot"
                  open-delay="300"
                >
                  <template #activator="{ props: tipProps }">
                    <button
                      type="button"
                      v-bind="tipProps"
                      class="cursor-pointer nav-subheader__title text-truncate"
                      :class="{ 'nav-subheader__title--hidden': !onToolCategoryRoot && secondaryCollapsed }"
                      :aria-label="$t(activeTool.nameKey)"
                      :title="$t(activeTool.nameKey)"
                      :tabindex="!onToolCategoryRoot && secondaryCollapsed ? -1 : 0"
                      :aria-hidden="!onToolCategoryRoot && secondaryCollapsed ? 'true' : undefined"
                      @click="router.push(activeTool.path)"
                    >
                      {{ $t(activeTool.nameKey) }}
                    </button>
                  </template>
                </v-tooltip>
              </div>
            </v-list-subheader>
            <v-tooltip
              v-for="item in activeTool.children"
              :key="item.path"
              :text="$t(item.nameKey)"
              location="end"
              :disabled="!secondaryCollapsed"
              open-delay="300"
            >
              <template #activator="{ props: tipProps }">
                <v-list-item
                  v-bind="tipProps"
                  :title="$t(item.nameKey)"
                  :value="item.path"
                  :prepend-icon="item?.iconComponent ? undefined : item.icon"
                  @click="router.push(item?.path ?? '/')"
                  :active="includesRoute(item.path, route)"
                  rounded="lg"
                  class="mb-1 nav-tool-item nav-child-item"
                  active-class="nav-tool-item-active"
                >
                  <template v-if="item?.iconComponent" #prepend>
                    <v-icon>
                      <component :is="item?.iconComponent"/>
                    </v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-tooltip>
          </v-list>
        </div>
      </aside>

      <NavPanelResizeHandle
        v-model="secondaryWidth"
        :min="NAV_MIN_WIDTH"
        :max="NAV_SECONDARY_MAX"
        :label="$t('nav.resizePanel')"
      />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.nav-layout {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  align-items: stretch;
  height: 100%;
  min-height: 0;
}

.nav-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  align-self: stretch;
  height: 100%;
  min-height: 0;
  background:
    linear-gradient(180deg, rgba(var(--v-theme-primary), 0.025), transparent 180px),
    rgb(var(--v-theme-surface));
  overflow: hidden;
  border-right: 1px solid var(--app-border);
  box-shadow: inset -1px 0 rgba(var(--v-theme-on-surface), 0.025);
}

.nav-panel--secondary {
  background:
    linear-gradient(180deg, rgba(var(--v-theme-primary), 0.035), transparent 32%),
    rgba(var(--v-theme-background), 0.94);
}

.nav-panel--secondary > .nav-panel__scroll {
  animation: nav-secondary-in var(--app-motion-base) var(--app-ease-emphasized) both;
}

.nav-list {
  padding-inline: 8px;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.nav-panel--collapsed .nav-list {
  padding-inline: 4px;
}

.nav-panel__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}

.nav-panel__scroll--fill {
  flex: 1 1 auto;
  min-height: 0;
  background: inherit;
}

.nav-panel__scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.nav-list :deep(.v-list) {
  overflow-x: hidden;
}

.nav-list--secondary {
  min-height: 100%;
}

.nav-panel__append {
  flex-shrink: 0;
  background: inherit;
}

.nav-tool-item {
  position: relative;
  min-height: 42px;
  transition:
    background-color var(--app-motion-fast) var(--app-ease-standard),
    color var(--app-motion-fast) var(--app-ease-standard);
}

.nav-brand-item {
  min-height: 54px;
  padding-inline: 6px 8px;
}

.nav-brand-item :deep(.v-list-item__prepend) {
  align-self: center;
}

.nav-brand-item :deep(.v-list-item-title) {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.nav-brand-item :deep(.v-list-item-subtitle) {
  margin-top: 1px;
  font-size: 10px;
  opacity: 0.5;
}

.nav-brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 8px;
  background: linear-gradient(145deg, rgba(var(--v-theme-primary), 0.16), rgba(var(--v-theme-primary), 0.055));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transition:
    border-color var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-fast) var(--app-ease-emphasized);
}

.nav-brand-mark img {
  display: block;
  width: 32px;
  height: 32px;
  object-fit: contain;
  user-select: none;
}

.nav-tool-item:hover:not(.nav-tool-item-active) {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.nav-tool-item :deep(.v-list-item__content) {
  font-weight: 500;
  letter-spacing: 0;
  min-width: 0;
  overflow: hidden;
}

.nav-tool-item :deep(.v-list-item-title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-tool-item-active {
  background:
    linear-gradient(90deg, rgba(var(--v-theme-primary), 0.14), rgba(var(--v-theme-primary), 0.055)) !important;
  color: rgb(var(--v-theme-primary));
  box-shadow: inset 0 1px 0 rgba(var(--v-theme-primary), 0.08), inset 0 -1px 0 rgba(var(--v-theme-primary), 0.05);
}

.nav-tool-item-active :deep(.v-list-item__overlay) {
  opacity: 0 !important;
}

.nav-tool-item-active::before {
  content: '';
  position: absolute;
  top: 11px;
  bottom: 11px;
  left: 2px;
  width: 3px;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 0 8px rgba(var(--v-theme-primary), 0.32);
  transform-origin: center;
  animation: nav-active-rail-in var(--app-motion-base) var(--app-ease-emphasized) both;
}

.nav-tool-item :deep(.v-icon) {
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    filter var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-fast) var(--app-ease-emphasized);
}

.nav-tool-item-active :deep(.v-icon) {
  filter: drop-shadow(0 0 4px rgba(var(--v-theme-primary), 0.24));
  transform: scale(1.04);
}

@media (hover: hover) and (pointer: fine) {
  .nav-tool-item:hover:not(.nav-tool-item-active) :deep(.v-icon) {
    transform: translateX(2px) scale(1.04);
  }

  .nav-panel--collapsed .nav-tool-item:hover:not(.nav-tool-item-active) :deep(.v-icon) {
    transform: scale(1.05);
  }

  .nav-brand-item:hover .nav-brand-mark {
    border-color: rgba(var(--v-theme-primary), 0.42);
    box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transform: scale(1.02);
  }
}

.nav-child-item :deep(.v-list-item__prepend > .v-icon) {
  font-size: 24px;
}

.nav-panel--collapsed :deep(.v-list-item__content) {
  display: none !important;
}

.nav-panel--collapsed :deep(.v-list-item-title) {
  display: none;
}

.nav-panel--collapsed .nav-version {
  display: block;
  font-size: 10px;
  line-height: 1.15;
  padding: 2px 2px 4px;
  word-break: break-all;
  letter-spacing: 0;
}

/* 折叠态: flex 居中,避免 Vuetify 三列网格把图标挤到左侧 */
.nav-panel--collapsed :deep(.v-list-item) {
  display: flex !important;
  flex-direction: row;
  justify-content: center !important;
  align-items: center !important;
  padding: 4px 0 !important;
  min-height: 48px;
  width: 100%;
}

.nav-panel--collapsed :deep(.v-list-item__prepend) {
  margin-inline: 0 !important;
  display: flex;
  justify-content: center;
  align-items: center;
}

.nav-panel--collapsed :deep(.v-list-item__content),
.nav-panel--collapsed :deep(.v-list-item__append),
.nav-panel--collapsed :deep(.v-list-item__spacer) {
  display: none !important;
  width: 0 !important;
  min-width: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
}

.nav-panel--collapsed .nav-subheader--root .nav-subheader__title {
  flex: 1 1 auto;
  font-size: 10px;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.nav-panel--collapsed .nav-subheader--root .nav-subheader__row {
  justify-content: center;
  width: 100%;
}

.nav-panel--collapsed .nav-subheader:not(.nav-subheader--root) .nav-subheader__row {
  justify-content: center;
}

.nav-panel--collapsed .nav-subheader:not(.nav-subheader--root) .nav-back-slot:not(.nav-back-slot--hidden) {
  width: auto;
}

.nav-panel--collapsed .nav-subheader--root {
  padding-inline: 2px !important;
}

.nav-panel--collapsed :deep(.v-list-item__prepend > .v-icon) {
  margin-inline: 0;
  font-size: 24px;
}

.nav-panel--collapsed .nav-brand-mark {
  width: 40px;
  height: 40px;
  flex-basis: 40px;
}

.nav-panel--collapsed .nav-brand-item :deep(.v-list-item__overlay) {
  border-radius: 8px;
}

.nav-panel--collapsed .nav-child-item {
  margin-inline: 0 !important;
}

.nav-panel--collapsed .nav-subheader {
  justify-content: center;
  padding-inline: 0 !important;
  min-height: 40px;
}

.nav-panel--collapsed .nav-subheader :deep(.v-list-subheader__text) {
  width: 100%;
  display: flex;
  justify-content: center;
}

.nav-subheader {
  opacity: 0.78;
  letter-spacing: 0.06em;
}

.nav-subheader__row {
  gap: 4px;
  width: 100%;
  min-width: 0;
  justify-content: flex-start;
}

.nav-subheader__row--back-only {
  justify-content: center;
}

.nav-back-slot {
  width: 24px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    width var(--app-motion-base) var(--app-ease-standard),
    opacity var(--app-motion-base) var(--app-ease-standard);
}

.nav-back-slot--hidden {
  width: 0;
  opacity: 0;
  pointer-events: none;
}

.nav-back-icon {
  flex-shrink: 0;
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized);
}

.nav-back-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  padding: 0;
  color: inherit;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-fast) var(--app-ease-emphasized);
}

.nav-back-button:hover {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.nav-back-button:active {
  transform: scale(0.92);
}

.nav-back-slot--hidden .nav-back-icon {
  opacity: 0;
  transform: translateX(-6px) scale(0.85);
}

.nav-subheader__title {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  color: inherit;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: start;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  max-width: 11rem;
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    max-width var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized);
}

.nav-subheader__title--hidden {
  opacity: 0;
  max-width: 0 !important;
  flex: 0 0 0;
  transform: translateX(-4px);
  pointer-events: none;
}

.cursor-pointer {
  cursor: pointer;
}

.min-width-0 {
  min-width: 0;
}

.nav-version {
  text-align: center;
  font-size: 11px;
  opacity: 0.45;
  padding: 4px 0 2px;
  color: rgb(var(--v-theme-on-surface));
}

@keyframes nav-active-rail-in {
  from { opacity: 0; transform: scaleY(0.35); }
  to { opacity: 1; transform: scaleY(1); }
}

@keyframes nav-secondary-in {
  from { opacity: 0; transform: translateX(-6px); }
  to { opacity: 1; transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  .nav-panel--secondary > .nav-panel__scroll,
  .nav-tool-item-active::before {
    animation: none !important;
  }
}
</style>
