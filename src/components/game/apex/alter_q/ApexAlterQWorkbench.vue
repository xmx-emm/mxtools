<script setup lang="ts">
import type {AlterQDialogController} from '@/composables/alter_q/useAlterQDialogController.ts';
import ApexAlterQWorkspacePanel from './ApexAlterQWorkspacePanel.vue';
import ApexAlterQOcrPanel from './ApexAlterQOcrPanel.vue';
import ApexAlterQScreenshotSourcePanel from './ApexAlterQScreenshotSourcePanel.vue';
import ApexAlterQBackgroundPanel from './ApexAlterQBackgroundPanel.vue';
import ApexAlterQOverlayPanel from './ApexAlterQOverlayPanel.vue';
const {controller} = defineProps<{controller: AlterQDialogController}>();
const {activeMainTab, hotkeyOperational, hotkeyStatusHint, mainTab, mainTabs, onEnabledChange, onMainTabKeydown, pageScroll, prefs, restartWizard, selectMainTab, t} = controller;
</script>

<template>
          <div class="alter-q-workspace">
            <aside class="alter-q-sidebar">
              <div class="alter-q-sidebar-brand">
                <span class="alter-q-sidebar-mark" aria-hidden="true">Q</span>
                <div>
                  <strong>Alter Q</strong>
                  <span>{{ t('apex.alterQ.workspaceLabel') }}</span>
                </div>
              </div>
              <nav class="alter-q-tabs" role="tablist" aria-orientation="vertical">
              <button
                v-for="tab in mainTabs"
                :key="tab.id"
                type="button"
                role="tab"
                class="alter-q-tab"
                :class="{ 'alter-q-tab--active': mainTab === tab.id }"
                :id="`alter-q-tab-${tab.id}`"
                :aria-selected="mainTab === tab.id"
                :aria-controls="`alter-q-panel-${tab.id}`"
                :aria-label="tab.title"
                :title="tab.description"
                :tabindex="mainTab === tab.id ? 0 : -1"
                @click="selectMainTab(tab.id)"
                @keydown="onMainTabKeydown($event, tab.id)"
              >
                  <v-icon :icon="tab.icon" size="18" />
                  <span>{{ tab.title }}</span>
              </button>
            </nav>

              <div
                class="alter-q-sidebar-status"
                :class="{'alter-q-sidebar-status--ready': hotkeyOperational}"
              >
                <span class="alter-q-sidebar-status-dot" />
                <div>
                  <strong>{{ hotkeyOperational ? t('apex.alterQ.navReady') : t('apex.alterQ.navPaused') }}</strong>
                  <span>{{ hotkeyStatusHint }}</span>
                </div>
              </div>

              <button type="button" class="alter-q-guide-link" @click="restartWizard">
                <v-icon icon="mdi-book-open-outline" size="16" />
                {{ t('apex.alterQ.restartGuide') }}
              </button>
            </aside>

            <main class="alter-q-workspace-main">
              <header class="alter-q-page-header">
                <div>
                  <span class="alter-q-page-eyebrow">{{ t('apex.alterQ.workspaceLabel') }}</span>
                  <h1>{{ activeMainTab.title }}</h1>
                  <p>{{ activeMainTab.description }}</p>
                </div>
                <v-switch
                  :model-value="prefs.enabled"
                  class="alter-q-enable-switch"
                  color="primary"
                  density="compact"
                  inset
                  hide-details
                  :label="t('apex.alterQ.enable')"
                  :title="t('apex.alterQ.enable')"
                  :aria-label="t('apex.alterQ.enable')"
                  @update:model-value="onEnabledChange"
                />
              </header>

              <div ref="pageScroll" class="alter-q-page-scroll">
                <div class="alter-q-page-content">

            <!-- 计算 -->
            <ApexAlterQWorkspacePanel :controller="controller" />

            <!-- 识别 -->
            <ApexAlterQOcrPanel :controller="controller" />

            <!-- 设置 -->
            <ApexAlterQScreenshotSourcePanel :controller="controller" />

            <!-- 后台 -->
            <ApexAlterQBackgroundPanel :controller="controller" />

            <!-- 小窗口 -->
            <ApexAlterQOverlayPanel :controller="controller" />
                </div>
              </div>
            </main>
          </div>
</template>
