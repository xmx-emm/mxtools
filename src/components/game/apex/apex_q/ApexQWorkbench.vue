<script setup lang="ts">
import type {ApexQDialogController} from '@/composables/apex_q/useApexQDialogController.ts';
import ApexQWorkspacePanel from './ApexQWorkspacePanel.vue';
import ApexQOcrPanel from './ApexQOcrPanel.vue';
import ApexQScreenshotSourcePanel from './ApexQScreenshotSourcePanel.vue';
import ApexQBackgroundPanel from './ApexQBackgroundPanel.vue';
import ApexQOverlayPanel from './ApexQOverlayPanel.vue';
const {controller} = defineProps<{controller: ApexQDialogController}>();
const {activeMainTab, hotkeyOperational, hotkeyStatusHint, mainTab, mainTabs, onEnabledChange, onMainTabKeydown, pageScroll, prefs, restartWizard, selectMainTab, t} = controller;
</script>

<template>
          <div class="apex-q-workspace">
            <aside class="apex-q-sidebar">
              <div class="apex-q-sidebar-brand">
                <span class="apex-q-sidebar-mark" aria-hidden="true">Q</span>
                <div>
                  <strong>APEX Q</strong>
                  <span>{{ t('apex.apexQ.workspaceLabel') }}</span>
                </div>
              </div>
              <nav class="apex-q-tabs" role="tablist" aria-orientation="vertical">
              <button
                v-for="tab in mainTabs"
                :key="tab.id"
                type="button"
                role="tab"
                class="apex-q-tab"
                :class="{ 'apex-q-tab--active': mainTab === tab.id }"
                :id="`apex-q-tab-${tab.id}`"
                :aria-selected="mainTab === tab.id"
                :aria-controls="`apex-q-panel-${tab.id}`"
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
                class="apex-q-sidebar-status"
                :class="{'apex-q-sidebar-status--ready': hotkeyOperational}"
              >
                <span class="apex-q-sidebar-status-dot" />
                <div>
                  <strong>{{ hotkeyOperational ? t('apex.apexQ.navReady') : t('apex.apexQ.navPaused') }}</strong>
                  <span>{{ hotkeyStatusHint }}</span>
                </div>
              </div>

              <button type="button" class="apex-q-guide-link" @click="restartWizard">
                <v-icon icon="mdi-book-open-outline" size="16" />
                {{ t('apex.apexQ.restartGuide') }}
              </button>
            </aside>

            <main class="apex-q-workspace-main">
              <header class="apex-q-page-header">
                <div>
                  <span class="apex-q-page-eyebrow">{{ t('apex.apexQ.workspaceLabel') }}</span>
                  <h1>{{ activeMainTab.title }}</h1>
                  <p>{{ activeMainTab.description }}</p>
                </div>
                <v-switch
                  :model-value="prefs.enabled"
                  class="apex-q-enable-switch"
                  color="primary"
                  density="compact"
                  inset
                  hide-details
                  :label="t('apex.apexQ.enable')"
                  :title="t('apex.apexQ.enable')"
                  :aria-label="t('apex.apexQ.enable')"
                  @update:model-value="onEnabledChange"
                />
              </header>

              <div ref="pageScroll" class="apex-q-page-scroll">
                <div class="apex-q-page-content">

            <!-- 计算 -->
            <ApexQWorkspacePanel :controller="controller" />

            <!-- 识别 -->
            <ApexQOcrPanel :controller="controller" />

            <!-- 设置 -->
            <ApexQScreenshotSourcePanel :controller="controller" />

            <!-- 后台 -->
            <ApexQBackgroundPanel :controller="controller" />

            <!-- 小窗口 -->
            <ApexQOverlayPanel :controller="controller" />
                </div>
              </div>
            </main>
          </div>
</template>
