<script setup lang="ts">
import type {AlterQDialogController} from '@/composables/alter_q/useAlterQDialogController.ts';
const {controller} = defineProps<{controller: AlterQDialogController}>();
const {mainTab, settingsStore, t} = controller;
</script>

<template>
<div
              v-show="mainTab === 'background'"
              id="alter-q-panel-background"
              class="alter-q-tab-panel alter-q-preferences-block alter-q-preferences-block--first"
              role="tabpanel"
              aria-labelledby="alter-q-tab-background"
              tabindex="0"
            >
              <header class="alter-q-section-heading alter-q-preferences-heading">
                <div>
                  <span class="alter-q-section-icon"><v-icon icon="mdi-tray-full" size="18" /></span>
                  <div>
                    <h2>{{ t('apex.alterQ.backgroundSection') }}</h2>
                    <p>{{ t('apex.alterQ.backgroundGlobalHint') }}</p>
                  </div>
                </div>
              </header>
              <section class="alter-q-section alter-q-settings-list">
                <div class="alter-q-setting-row">
                  <div>
                    <strong>{{ t('settings.autostart') }}</strong>
                    <span>{{ t('apex.alterQ.autostartHint') }}</span>
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
                <div class="alter-q-setting-row">
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
                <div class="alter-q-setting-row">
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
