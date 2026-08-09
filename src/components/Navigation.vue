<script setup lang="ts">
import {useRoute, useRouter} from 'vue-router';
import {toolCategoryContainingPath, tools} from '../router.ts';
import appIconUrl from '../../src-tauri/icons/128x128.png';
import {includesRoute} from '../utils/router.ts';
import {computed, nextTick, onMounted, ref, watch, type CSSProperties} from 'vue';
import {useI18n} from 'vue-i18n';
import AppVersion from '@/components/utils/AppVersion.vue';
import NavPanelResizeHandle from '@/components/navigation/NavPanelResizeHandle.vue';
import {useSettingsStore} from '@/stores/settings.ts';
import {
  isNavPanelCollapsed,
  NAV_MIN_WIDTH,
  NAV_PRIMARY_EXPANDED_MIN,
  NAV_PRIMARY_MAX,
  NAV_SECONDARY_EXPANDED_MIN,
  NAV_SECONDARY_MAX,
  navPanelExpandedWidth,
  navPanelLabelProgress,
} from '@/constants/nav_layout.ts';

const router = useRouter();
const route = useRoute();
const settingsStore = useSettingsStore();
const {t, locale} = useI18n();
const visibleTools = computed(() => tools.map(tool => ({
  ...tool,
  children: tool.children.filter(child => !child.beta || settingsStore.betaFeaturesEnabled),
})));

const activeTool = computed(() => {
  const categoryPath = toolCategoryContainingPath(route.path);
  if (categoryPath == null) {
    return null;
  }
  return visibleTools.value.find((tool) => tool.path === categoryPath) ?? null;
});

const showSecondary = computed(
  () => activeTool.value != null && activeTool.value.children.length !== 0,
);

const primaryMaxWidth = ref(NAV_PRIMARY_MAX);
const secondaryMaxWidth = ref(NAV_SECONDARY_MAX);
const primaryPanelElement = ref<HTMLElement | null>(null);
const secondaryPanelElement = ref<HTMLElement | null>(null);

const primaryWidth = computed({
  get: () => settingsStore.navPrimaryWidth,
  set: (v) => settingsStore.setNavPrimaryWidth(v, primaryMaxWidth.value),
});

const secondaryWidth = computed({
  get: () => settingsStore.navSecondaryWidth,
  set: (v) => settingsStore.setNavSecondaryWidth(v, secondaryMaxWidth.value),
});

const primaryCollapsed = computed(
  () => isNavPanelCollapsed(primaryWidth.value, primaryMaxWidth.value),
);
const secondaryCollapsed = computed(
  () => isNavPanelCollapsed(secondaryWidth.value, secondaryMaxWidth.value),
);
const primaryLabelProgress = computed(
  () => navPanelLabelProgress(primaryWidth.value, primaryMaxWidth.value),
);
const secondaryLabelProgress = computed(
  () => navPanelLabelProgress(secondaryWidth.value, secondaryMaxWidth.value),
);
const primaryLabelsVisible = computed(() => primaryLabelProgress.value >= 0.75);
const secondaryLabelsVisible = computed(() => secondaryLabelProgress.value >= 0.75);
const primaryPanelStyle = computed(() => {
  const progress = primaryLabelProgress.value;
  return {
    width: `${primaryWidth.value}px`,
    '--nav-label-opacity': progress.toFixed(3),
    '--nav-brand-height': `${(40 + 14 * progress).toFixed(2)}px`,
  } as CSSProperties;
});
const secondaryPanelStyle = computed(() => {
  const progress = secondaryLabelProgress.value;
  const markerOpacity = Math.max(0, 1 - progress / 0.4);
  const headerOpacity = Math.max(0, (progress - 0.55) / 0.45);
  return {
    width: `${secondaryWidth.value}px`,
    '--nav-label-opacity': progress.toFixed(3),
    '--nav-root-marker-opacity': markerOpacity.toFixed(3),
    '--nav-header-label-opacity': headerOpacity.toFixed(3),
  } as CSSProperties;
});
const secondaryShellStyle = computed(() => ({
  '--nav-secondary-shell-width': `${secondaryWidth.value + 1}px`,
}) as CSSProperties);
const primaryDragging = ref(false);
const secondaryDragging = ref(false);

/** 停在大类页(如 /game),尚未进入子工具页 */
const onToolCategoryRoot = computed(
  () => activeTool.value != null && route.path === activeTool.value.path,
);

const primaryMeasurementKey = computed(() => [
  locale.value,
  t('about.appName'),
  t('nav.toolCenter'),
  t('settings.title'),
  ...visibleTools.value.map(tool => t(tool.nameKey)),
].join('\u0000'));
const secondaryMeasurementKey = computed(() => [
  locale.value,
  activeTool.value == null ? '' : t(activeTool.value.nameKey),
  ...(activeTool.value?.children.map(item => t(item.nameKey)) ?? []),
].join('\u0000'));

function renderedMaxLabelWidth(panel: HTMLElement): number {
  const labels = panel.querySelectorAll<HTMLElement>(
    '.v-list-item-title, .v-list-item-subtitle, .nav-subheader__title, .nav-root-marker',
  );
  return Array.from(labels).reduce((max, label) => Math.max(max, label.scrollWidth), 0);
}

function applyMeasuredMaxWidth(
  panel: HTMLElement | null,
  maxWidth: {value: number},
  currentWidth: number,
  minExpanded: number,
  hardMax: number,
  dragging: boolean,
  setWidth: (width: number, max: number) => void,
) {
  if (panel == null) return;
  const measuredMax = navPanelExpandedWidth(
    renderedMaxLabelWidth(panel),
    minExpanded,
    hardMax,
  );
  const wasCollapsed = isNavPanelCollapsed(currentWidth, maxWidth.value);
  maxWidth.value = measuredMax;
  if (dragging) {
    setWidth(Math.min(measuredMax, Math.max(NAV_MIN_WIDTH, currentWidth)), measuredMax);
    return;
  }
  setWidth(wasCollapsed ? NAV_MIN_WIDTH : measuredMax, measuredMax);
}

async function refreshMeasuredMaxWidths() {
  await nextTick();
  applyMeasuredMaxWidth(
    primaryPanelElement.value,
    primaryMaxWidth,
    primaryWidth.value,
    NAV_PRIMARY_EXPANDED_MIN,
    NAV_PRIMARY_MAX,
    primaryDragging.value,
    (width, max) => settingsStore.setNavPrimaryWidth(width, max),
  );
  applyMeasuredMaxWidth(
    secondaryPanelElement.value,
    secondaryMaxWidth,
    secondaryWidth.value,
    NAV_SECONDARY_EXPANDED_MIN,
    NAV_SECONDARY_MAX,
    secondaryDragging.value,
    (width, max) => settingsStore.setNavSecondaryWidth(width, max),
  );
}

watch(
  [primaryMeasurementKey, secondaryMeasurementKey],
  () => void refreshMeasuredMaxWidths(),
  {flush: 'post'},
);

onMounted(() => {
  void refreshMeasuredMaxWidths();
});
</script>

<template>
  <div class="nav-layout">
    <aside
      ref="primaryPanelElement"
      class="nav-panel nav-panel--primary"
      :aria-label="$t('nav.toolCenter')"
      :class="{
        'nav-panel--collapsed': primaryCollapsed,
        'nav-panel--dragging': primaryDragging,
      }"
      :style="primaryPanelStyle"
    >
      <div class="nav-panel__scroll">
        <v-list density="compact" nav class="nav-list">
          <v-tooltip
            :text="$t('dashboard.title')"
            location="end"
            :disabled="primaryLabelsVisible"
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
            v-for="tool in visibleTools"
            :key="tool.name"
            :text="$t(tool.nameKey)"
            location="end"
            :disabled="primaryLabelsVisible"
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
            :disabled="primaryLabelsVisible"
            open-delay="300"
          >
            <template #activator="{ props: tipProps }">
              <v-list-item
                v-bind="tipProps"
                prepend-icon="mdi-cog"
                to="/settings"
                :title="$t('settings.title')"
                :active="includesRoute('/settings', route)"
                rounded="lg"
                class="mb-1 nav-tool-item"
                active-class="nav-tool-item-active"
                density="compact"
              />
            </template>
          </v-tooltip>
        </v-list>
      </div>
    </aside>

    <NavPanelResizeHandle
      v-model="primaryWidth"
      :min="NAV_MIN_WIDTH"
      :max="primaryMaxWidth"
      :label="$t('nav.resizePanel')"
      @dragging-change="primaryDragging = $event"
    />

    <Transition name="nav-secondary-shell">
      <div
        v-if="showSecondary && activeTool"
        class="nav-secondary-shell"
        :class="{'nav-secondary-shell--dragging': secondaryDragging}"
        :style="secondaryShellStyle"
      >
        <aside
          ref="secondaryPanelElement"
          :key="activeTool.path"
          class="nav-panel nav-panel--secondary"
          :aria-label="$t(activeTool.nameKey)"
          :class="{
            'nav-panel--collapsed': secondaryCollapsed,
            'nav-panel--dragging': secondaryDragging,
          }"
          :style="secondaryPanelStyle"
        >
          <div class="nav-panel__scroll nav-panel__scroll--fill">
            <v-list density="compact" nav class="py-2 nav-list nav-list--secondary">
              <v-list-subheader
                class="nav-subheader text-uppercase text-caption font-weight-medium px-3 py-2"
                :class="{ 'nav-subheader--root': onToolCategoryRoot }"
              >
                <div
                  class="nav-subheader__row d-flex align-center min-width-0"
                >
                  <div
                    class="nav-leading-slot flex-shrink-0"
                  >
                    <button
                      type="button"
                      class="nav-back-button"
                      :class="{ 'nav-back-button--hidden': onToolCategoryRoot }"
                      :aria-label="$t('nav.backToCategory')"
                      :title="$t('nav.backToCategory')"
                      :tabindex="onToolCategoryRoot ? -1 : 0"
                      :aria-hidden="onToolCategoryRoot ? 'true' : undefined"
                      @click="router.push(activeTool.path)"
                    >
                      <v-icon icon="mdi-chevron-left" size="small" class="nav-back-icon" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="nav-root-marker"
                      :class="{
                        'nav-root-marker--hidden': !onToolCategoryRoot,
                        'nav-root-marker--interactive': onToolCategoryRoot && !secondaryLabelsVisible,
                      }"
                      :aria-label="$t(activeTool.nameKey)"
                      :title="$t(activeTool.nameKey)"
                      :tabindex="onToolCategoryRoot && !secondaryLabelsVisible ? 0 : -1"
                      :aria-hidden="onToolCategoryRoot && !secondaryLabelsVisible ? undefined : 'true'"
                      @click="router.push(activeTool.path)"
                    >
                      {{ $t(activeTool.nameKey) }}
                    </button>
                  </div>
                  <v-tooltip
                    :text="$t(activeTool.nameKey)"
                    location="end"
                    :disabled="secondaryLabelsVisible || onToolCategoryRoot"
                    open-delay="300"
                  >
                    <template #activator="{ props: tipProps }">
                      <button
                        type="button"
                        v-bind="tipProps"
                        class="cursor-pointer nav-subheader__title text-truncate"
                        :class="{ 'nav-subheader__title--interactive': secondaryLabelsVisible }"
                        :aria-label="$t(activeTool.nameKey)"
                        :title="$t(activeTool.nameKey)"
                        :tabindex="secondaryLabelsVisible ? 0 : -1"
                        :aria-hidden="secondaryLabelsVisible ? undefined : 'true'"
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
                :disabled="secondaryLabelsVisible"
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
                    :class="{'nav-child-item--beta': item.beta}"
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
          :max="secondaryMaxWidth"
          :label="$t('nav.resizePanel')"
          @dragging-change="secondaryDragging = $event"
        />
      </div>
    </Transition>
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

.nav-secondary-shell {
  display: flex;
  flex: 0 0 var(--nav-secondary-shell-width);
  width: var(--nav-secondary-shell-width);
  min-width: 0;
  height: 100%;
  overflow: hidden;
  opacity: 1;
  will-change: width, flex-basis, opacity;
  transition:
    width var(--app-motion-slow) var(--app-ease-standard),
    flex-basis var(--app-motion-slow) var(--app-ease-standard),
    opacity var(--app-motion-base) var(--app-ease-standard);
}

.nav-secondary-shell--dragging {
  transition: none;
}

.nav-secondary-shell-enter-from,
.nav-secondary-shell-leave-to {
  width: 0;
  flex-basis: 0;
  opacity: 0;
}

.nav-secondary-shell-leave-active {
  pointer-events: none;
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
  will-change: width;
  transition: width var(--app-motion-slow) var(--app-ease-standard);
}

.nav-panel--dragging {
  transition: none;
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
  --v-list-prepend-gap: 12px;
  min-height: 42px;
  padding: 4px 8px !important;
  transition:
    background-color var(--app-motion-fast) var(--app-ease-standard),
    color var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-base) var(--app-ease-standard);
}

.nav-brand-item {
  min-height: var(--nav-brand-height, 54px);
  height: var(--nav-brand-height, 54px);
  padding: 0 8px 0 0 !important;
  transition:
    min-height var(--app-motion-slow) var(--app-ease-standard),
    height var(--app-motion-slow) var(--app-ease-standard);
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
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  box-sizing: border-box;
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

.nav-tool-item :deep(.v-list-item__content),
.nav-brand-item :deep(.v-list-item__content) {
  font-weight: 500;
  letter-spacing: 0;
  min-width: 0;
  overflow: hidden;
  opacity: var(--nav-label-opacity, 1);
  transition: opacity var(--app-motion-base) var(--app-ease-standard);
}

.nav-panel--dragging .nav-tool-item :deep(.v-list-item__content),
.nav-panel--dragging .nav-brand-item :deep(.v-list-item__content),
.nav-panel--dragging .nav-subheader__title,
.nav-panel--dragging .nav-root-marker {
  transition: none;
}

.nav-panel--dragging .nav-brand-item {
  transition: none;
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

.nav-tool-item::before {
  content: '';
  position: absolute;
  top: 11px;
  bottom: 11px;
  left: 2px;
  width: 3px;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 rgba(var(--v-theme-primary), 0);
  opacity: 0;
  transform: scaleY(0.35);
  transform-origin: center;
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized),
    box-shadow var(--app-motion-base) var(--app-ease-standard);
}

.nav-tool-item-active::before {
  box-shadow: 0 0 8px rgba(var(--v-theme-primary), 0.32);
  opacity: 0.3;
  transform: scaleY(1);
}

.nav-tool-item :deep(.v-list-item__prepend > .v-icon) {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  font-size: 24px;
  transform-origin: center;
  transition:
    color var(--app-motion-base) var(--app-ease-standard),
    filter var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized);
}

.nav-tool-item-active :deep(.v-icon) {
  filter: drop-shadow(0 0 4px rgba(var(--v-theme-primary), 0.24));
  transform: scale(1.04);
}

@media (hover: hover) and (pointer: fine) {
  .nav-tool-item:hover:not(.nav-tool-item-active) :deep(.v-icon) {
    transform: scale(1.04);
    animation: nav-icon-hover-scale var(--app-motion-base) var(--app-ease-emphasized) both;
  }

  .nav-brand-item:hover .nav-brand-mark {
    border-color: rgba(var(--v-theme-primary), 0.42);
    box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transform: scale(1.02);
  }
}

.nav-child-item--beta::after {
  position: absolute;
  z-index: 3;
  top: 4px;
  left: 4px;
  width: 9px;
  height: 9px;
  border: 2px solid rgb(var(--v-theme-surface));
  border-radius: 50%;
  background: rgb(var(--v-theme-error));
  box-shadow: 0 0 0 1px rgba(var(--v-theme-error), 0.24), 0 1px 4px rgba(0, 0, 0, 0.24);
  box-sizing: border-box;
  content: '';
  pointer-events: none;
}

.nav-panel--collapsed :deep(.v-list-item__content) {
  pointer-events: none;
}

.nav-panel--collapsed .nav-version {
  display: block;
  font-size: 10px;
  line-height: 1.15;
  padding: 2px 2px 4px;
  word-break: break-all;
  letter-spacing: 0;
}

/* 折叠态保留与展开态相同的网格和图标锚点，避免吸附时重排跳闪。 */
.nav-panel--collapsed :deep(.v-list-item) {
  display: grid !important;
  grid-template-areas: 'prepend content append';
  grid-template-columns: max-content 1fr auto;
  padding: 4px 8px !important;
  width: 100%;
}

.nav-panel--collapsed :deep(.v-list-item__prepend) {
  margin-inline: 0 !important;
  display: flex;
  align-items: center;
}

.nav-panel--collapsed :deep(.v-list-item__append) {
  display: none !important;
  width: 0 !important;
  min-width: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
}

.nav-panel--collapsed :deep(.v-list-item__prepend > .v-icon) {
  margin-inline: 0;
}

.nav-panel--collapsed .nav-brand-item {
  padding: 0 8px 0 0 !important;
}

.nav-panel--collapsed .nav-brand-item :deep(.v-list-item__overlay) {
  border-radius: 8px;
}

.nav-panel--collapsed .nav-child-item {
  margin-inline: 0 !important;
}

.nav-panel--collapsed .nav-subheader {
  justify-content: center;
  min-height: 40px;
}

.nav-panel--collapsed .nav-subheader :deep(.v-list-subheader__text) {
  width: 100%;
  display: flex;
  justify-content: center;
}

.nav-subheader {
  padding-inline: 8px !important;
  opacity: 0.78;
  letter-spacing: 0.06em;
}

.nav-subheader__row {
  display: grid !important;
  grid-template-columns: 24px minmax(0, 1fr);
  column-gap: 0;
  width: 100%;
  min-width: 0;
}

.nav-leading-slot {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-back-icon {
  flex-shrink: 0;
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized);
}

.nav-back-button {
  position: absolute;
  inset: 0;
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
  transform-origin: center;
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized);
}

.nav-back-button--hidden {
  opacity: 0;
  transform: rotate(-90deg) scale(0.86);
  pointer-events: none;
}

.nav-back-button:hover {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.nav-back-button:active {
  transform: scale(0.92);
}

.nav-back-button--hidden .nav-back-icon {
  opacity: 0;
}

.nav-root-marker {
  position: absolute;
  inset: 0;
  display: block;
  width: 24px;
  height: 24px;
  padding: 0;
  overflow: hidden;
  color: inherit;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 10px;
  line-height: 24px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  opacity: var(--nav-root-marker-opacity, 0);
  pointer-events: none;
  transition:
    opacity var(--app-motion-base) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized);
}

.nav-root-marker--hidden {
  opacity: 0;
  transform: translateX(4px) scale(0.86);
  pointer-events: none;
}

.nav-root-marker--interactive {
  pointer-events: auto;
}

.nav-subheader__title {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0 0 0 4px;
  color: inherit;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: start;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  max-width: 11rem;
  opacity: var(--nav-header-label-opacity, var(--nav-label-opacity, 1));
  pointer-events: none;
  transition: opacity var(--app-motion-base) var(--app-ease-standard);
}

.nav-subheader__title--interactive {
  pointer-events: auto;
}

.cursor-pointer {
  cursor: pointer;
}

.min-width-0 {
  min-width: 0;
}

.nav-version {
  width: 40px;
  max-width: 40px;
  box-sizing: border-box;
  text-align: center;
  font-size: 11px;
  opacity: 0.45;
  padding: 4px 0 2px;
  color: rgb(var(--v-theme-on-surface));
}

@keyframes nav-secondary-in {
  from { opacity: 0; transform: translateX(-6px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes nav-icon-hover-scale {
  0% { transform: scale(1); }
  65% { transform: scale(1.07); }
  100% { transform: scale(1.04); }
}

@media (prefers-reduced-motion: reduce) {
  .nav-panel,
  .nav-brand-item,
  .nav-secondary-shell {
    transition: none;
  }

  .nav-panel--secondary > .nav-panel__scroll,
  .nav-tool-item::before {
    animation: none !important;
    transition: none !important;
  }

  .nav-tool-item:hover:not(.nav-tool-item-active) :deep(.v-icon) {
    animation: none !important;
  }
}
</style>
