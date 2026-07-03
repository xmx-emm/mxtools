<script setup lang="ts">
import {useRoute, useRouter} from 'vue-router';
import {toolCategoryContainingPath, tools} from '../router.ts';
import profilePhoto from '@/assets/images/avatar.jpg';
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
                :prepend-avatar="profilePhoto"
                @click="router.push('/')"
                rounded="lg"
                class="mb-1 nav-avatar-item"
              />
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
    />

    <template v-if="showSecondary && activeTool">
      <aside
        class="nav-panel nav-panel--secondary"
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
                  <v-icon
                    icon="mdi-chevron-left"
                    size="small"
                    class="cursor-pointer nav-back-icon"
                    @click="router.push(activeTool.path)"
                  />
                </div>
                <v-tooltip
                  :text="$t(activeTool.nameKey)"
                  location="end"
                  :disabled="!secondaryCollapsed || onToolCategoryRoot"
                  open-delay="300"
                >
                  <template #activator="{ props: tipProps }">
                    <span
                      v-bind="tipProps"
                      class="cursor-pointer nav-subheader__title text-truncate"
                      :class="{ 'nav-subheader__title--hidden': !onToolCategoryRoot && secondaryCollapsed }"
                      @click="router.push(activeTool.path)"
                    >
                      {{ $t(activeTool.nameKey) }}
                    </span>
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
                  :title="secondaryCollapsed ? undefined : $t(item.nameKey)"
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
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
}

.nav-panel--secondary {
  background: rgb(var(--v-theme-background));
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
  transition: background 0.15s ease, color 0.15s ease;
}

.nav-tool-item :deep(.v-list-item__content) {
  font-weight: 500;
  letter-spacing: -0.01em;
  min-width: 0;
  overflow: hidden;
}

.nav-tool-item :deep(.v-list-item-title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-tool-item-active {
  background: rgba(var(--v-theme-primary), 0.1) !important;
  color: rgb(var(--v-theme-primary));
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
  font-size: 9px;
  line-height: 1.15;
  padding: 2px 2px 4px;
  word-break: break-all;
  letter-spacing: -0.02em;
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

.nav-panel--collapsed :deep(.v-list-item__prepend > .v-avatar) {
  width: 40px !important;
  height: 40px !important;
}

.nav-panel--collapsed .nav-avatar-item :deep(.v-list-item__overlay) {
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
  opacity: 0.7;
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
  width: 20px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-back-slot--hidden {
  width: 0;
  opacity: 0;
  pointer-events: none;
}

.nav-back-icon {
  flex-shrink: 0;
  transition:
    opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-back-slot--hidden .nav-back-icon {
  opacity: 0;
  transform: translateX(-6px) scale(0.85);
}

.nav-subheader__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  max-width: 11rem;
  transition:
    opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    max-width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    flex 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-subheader__title--hidden {
  opacity: 0;
  max-width: 0 !important;
  flex: 0 0 0;
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
  color: var(--grey-darken-3);
}
</style>
