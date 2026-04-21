<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import {useRouter} from 'vue-router';
import type {Component} from 'vue';
import {tools} from '@/router.ts';

const {t} = useI18n();
const router = useRouter();

interface ModuleItem {
  path: string;
  nameKey: string;
  groupKey?: string;
  icon?: string;
  iconComponent?: Component;
  descKey?: string;
}

/** 复用已有说明文案,避免为每个模块新增键 */
const MODULE_DESC_KEYS: Partial<Record<string, string>> = {
  '/explorer': 'explorer.commonFoldersSubtitle',
  '/port_forwarding': 'portForwarding.description',
};

const modules = computed<ModuleItem[]>(() => {
  const list: ModuleItem[] = [];
  for (const tool of tools) {
    for (const child of tool.children) {
      list.push({
        path: child.path,
        nameKey: child.nameKey,
        groupKey: tool.nameKey,
        icon: child.icon,
        iconComponent: child.iconComponent,
        descKey: MODULE_DESC_KEYS[child.path],
      });
    }
  }
  return list;
});

const extras: ModuleItem[] = [
  {path: '/settings', nameKey: 'settings.title', icon: 'mdi-cog-outline'},
];

const allItems = computed<ModuleItem[]>(() => [...modules.value, ...extras]);

function go(path: string) {
  router.push(path);
}
</script>

<template>
  <div class="dashboard-root d-flex flex-column h-100">
    <div class="dashboard-scroll flex-1 overflow-y-auto">
      <v-container fluid class="py-6 px-4 px-sm-6" max-width="1280">
        <h1 class="text-h5 font-weight-medium mb-5">{{ t('dashboard.title') }}</h1>

        <v-row dense>
          <!-- 左侧：工具简介 -->
          <v-col cols="12" md="7">
            <v-card class="panel-card pa-6" :ripple="false">
              <div class="intro-header d-flex align-center mb-4">
                <div class="intro-logo d-flex align-center justify-center rounded-lg me-3">
                  <v-icon size="28" icon="mdi-toolbox-outline"/>
                </div>
                <div class="min-w-0">
                  <div class="text-h6 font-weight-medium">{{ t('dashboard.introTitle') }}</div>
                  <div class="text-caption text-medium-emphasis">{{ t('dashboard.introTagline') }}</div>
                </div>
              </div>

              <p class="text-body-2 mb-4" style="line-height: 1.7;">
                {{ t('dashboard.introDescription') }}
              </p>

              <div class="intro-highlight d-flex align-start pa-3 rounded-lg mb-4">
                <v-icon size="20" icon="mdi-star-four-points" class="me-2 mt-1 intro-highlight-icon"/>
                <div class="min-w-0">
                  <div class="text-body-2 font-weight-medium mb-1">
                    {{ t('dashboard.introApexTitle') }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    {{ t('dashboard.introApexDesc') }}
                  </div>
                </div>
              </div>

              <div class="text-caption text-medium-emphasis mb-2">
                {{ t('dashboard.introFeatures') }}
              </div>
              <ul class="intro-list">
                <li>{{ t('dashboard.featureApex') }}</li>
                <li>{{ t('dashboard.featureExplorer') }}</li>
                <li>{{ t('dashboard.featurePortForward') }}</li>
              </ul>
            </v-card>
          </v-col>

          <!-- 右侧：实用程序列表 -->
          <v-col cols="12" md="5">
            <v-card class="panel-card pa-2 pa-sm-3" :ripple="false">
              <div class="panel-title px-3 pt-2 pb-3 d-flex align-center justify-space-between">
                <span>{{ t('dashboard.utilities') }}</span>
                <v-icon size="18" icon="mdi-tools" class="text-medium-emphasis"/>
              </div>
              <div class="util-list">
                <div
                  v-for="item in allItems"
                  :key="item.path"
                  class="util-row"
                  role="link"
                  tabindex="0"
                  @click="go(item.path)"
                  @keydown.enter.prevent="go(item.path)"
                  @keydown.space.prevent="go(item.path)"
                >
                  <div class="util-icon d-flex align-center justify-center">
                    <v-icon v-if="item.icon" size="20" :icon="item.icon"/>
                    <span v-else-if="item.iconComponent" class="util-icon-slot d-flex">
                      <component :is="item.iconComponent" :size="22"/>
                    </span>
                  </div>
                  <div class="util-text flex-1 min-w-0">
                    <div class="text-body-2 font-weight-medium text-truncate">
                      {{ t(item.nameKey) }}
                    </div>
                    <div
                      v-if="item.groupKey"
                      class="text-caption text-medium-emphasis text-truncate"
                    >
                      {{ t(item.groupKey) }}
                    </div>
                  </div>
                  <v-icon size="18" icon="mdi-chevron-right" class="text-medium-emphasis flex-shrink-0"/>
                </div>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dashboard-root {
  min-height: 0;
  background: rgb(var(--v-theme-surface-variant));
}

.dashboard-scroll {
  min-height: 0;
}

.panel-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 12px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

/* ---------- 左侧简介 ---------- */
.intro-logo {
  width: 52px;
  height: 52px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  flex-shrink: 0;
}

.intro-highlight {
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
}

.intro-highlight-icon {
  color: rgb(var(--v-theme-primary));
}

.intro-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.9;
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.intro-list li::marker {
  color: rgba(var(--v-theme-primary), 0.7);
}

/* ---------- 右侧列表 ---------- */
.util-list {
  display: flex;
  flex-direction: column;
}

.util-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.util-row + .util-row {
  margin-top: 2px;
}

.util-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.util-row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.util-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  flex-shrink: 0;
}

.util-icon-slot :deep(svg) {
  display: block;
}

.util-text {
  overflow: hidden;
}

.min-w-0 {
  min-width: 0;
}
</style>
