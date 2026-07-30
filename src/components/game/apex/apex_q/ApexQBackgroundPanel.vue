<script setup lang="ts">
import type {ApexQDialogController} from '@/composables/apex_q/useApexQDialogController.ts';
const {controller} = defineProps<{controller: ApexQDialogController}>();
const {mainTab, settingsStore, t} = controller;
</script>

<template>
<div
              v-show="mainTab === 'background'"
              id="apex-q-panel-background"
              class="apex-q-tab-panel apex-q-preferences-block apex-q-preferences-block--first"
              role="tabpanel"
              aria-labelledby="apex-q-tab-background"
              tabindex="0"
            >
              <header class="apex-q-section-heading apex-q-preferences-heading">
                <div>
                  <span class="apex-q-section-icon"><v-icon icon="mdi-tray-full" size="18" /></span>
                  <div>
                    <h2>{{ t('apex.apexQ.backgroundSection') }}</h2>
                    <p>{{ t('apex.apexQ.backgroundGlobalHint') }}</p>
                  </div>
                </div>
              </header>
              <section class="apex-q-section apex-q-settings-list">
                <div class="apex-q-setting-row">
                  <div>
                    <strong>{{ t('settings.autostart') }}</strong>
                    <span>{{ t('apex.apexQ.autostartHint') }}</span>
                  </div>
                <v-switch
                  :model-value="settingsStore.autostart"
                    color="primary"
                  density="compact"
                    inset
                  hide-details
                  @update:model-value="settingsStore.setAutostart"
                />
                </div>
                <div class="apex-q-setting-row">
                  <div>
                    <strong>{{ t('settings.startInTray') }}</strong>
                    <span>{{ t('settings.startInTrayHint') }}</span>
                  </div>
                <v-switch
                  :model-value="settingsStore.startInTray"
                    color="primary"
                  density="compact"
                    inset
                  hide-details
                  @update:model-value="settingsStore.setStartInTray"
                />
                </div>
                <div class="apex-q-setting-row">
                  <div>
                    <strong>{{ t('settings.closeToTray') }}</strong>
                    <span>{{ t('settings.closeToTrayHint') }}</span>
                  </div>
                <v-switch
                  :model-value="settingsStore.closeToTray"
                    color="primary"
                  density="compact"
                    inset
                  hide-details
                  @update:model-value="settingsStore.setCloseToTray"
                />
                </div>
              </section>
            </div>
</template>
