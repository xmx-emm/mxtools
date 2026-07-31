<script setup lang="ts">
import type {ApexQDialogController} from '@/composables/apex_q/useApexQDialogController.ts';
import ShortcutInput from '@/components/settings/ShortcutInput.vue';
const {controller} = defineProps<{controller: ApexQDialogController}>();
const {AUTHOR_GITHUB, AUTHOR_HOME, applySteamUser, flushScheduledPrefsPersist, folderMode, loadSteamDirs, mainTab, onFolderModeChange, onFolderPathBlur, openUrl, pickFolder, prefs, schedulePrefsPersist, selectedSteamUserId, steamSelectItems, t} = controller;
</script>

<template>
<div
              v-show="mainTab === 'settings'"
              id="apex-q-panel-settings"
              role="tabpanel"
              aria-labelledby="apex-q-tab-settings"
              tabindex="0"
            >
            <div class="apex-q-tab-panel apex-q-preferences-block apex-q-preferences-block--first">
              <section class="apex-q-section">
                <header class="apex-q-section-heading">
                  <div>
                    <span class="apex-q-section-icon"><v-icon icon="mdi-folder-outline" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.apexQ.sourceTitle') }}</h2>
                      <p>{{ t('apex.apexQ.sourceHint') }}</p>
                    </div>
                  </div>
                </header>
              <v-btn-toggle
                :model-value="folderMode"
                class="game-page-segmented-toggle mb-3"
                density="compact"
                mandatory
                color="primary"
                variant="text"
                border
                divided
                @update:model-value="onFolderModeChange"
              >
                <v-btn value="steam" size="small">{{ t('apex.apexQ.folderModeSteam') }}</v-btn>
                <v-btn value="manual" size="small">{{ t('apex.apexQ.folderModeManual') }}</v-btn>
              </v-btn-toggle>

                <div class="apex-q-source-fields">
                  <v-select
                v-if="folderMode === 'steam'"
                density="compact"
                :items="steamSelectItems"
                :model-value="selectedSteamUserId"
                :label="t('apex.apexQ.steamAccount')"
                hide-details
                @update:model-value="applySteamUser"
              />

              <v-text-field
                v-model="prefs.screenshotFolder"
                density="compact"
                :readonly="folderMode === 'steam'"
                :label="t('apex.apexQ.folderLabel')"
                hide-details
                @blur="onFolderPathBlur"
              />
                </div>
              <div class="apex-q-inline-actions">
                  <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-folder-outline" @click="pickFolder">
                    {{ t('apex.apexQ.pickFolder') }}
                  </v-btn>
                <v-btn size="small" variant="tonal" @click="loadSteamDirs({reconcileMode: false})">
                  {{ t('apex.apexQ.refreshSteamAccounts') }}
                </v-btn>
              </div>
              </section>

              <section class="apex-q-section">
                <header class="apex-q-section-heading">
                  <div>
                    <span class="apex-q-section-icon"><v-icon icon="mdi-keyboard-variant" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.apexQ.hotkeyTitle') }}</h2>
                      <p>{{ t('apex.apexQ.hotkeyHint') }}</p>
                    </div>
                  </div>
                </header>
                <div class="apex-q-trigger-grid">
                  <div>
                    <label>{{ t('apex.apexQ.hotkey') }}</label>
                    <ShortcutInput v-model="prefs.hotkey" scope="apexQ" />
                  </div>
                  <div class="apex-q-delay-control">
              <v-slider
                v-model="prefs.delayMs"
                :min="200"
                :max="1500"
                :step="50"
                thumb-label
                :label="t('apex.apexQ.delayMs', {ms: prefs.delayMs})"
                hide-details
                @update:model-value="schedulePrefsPersist"
                @end="flushScheduledPrefsPersist"
              />
                  </div>
                </div>
              </section>

            </div>
            <div class="apex-q-footer">
              <a href="#" @click.prevent="openUrl(AUTHOR_GITHUB)">{{ t('apex.apexQ.footerRepo') }}</a>
              <span class="apex-q-footer-sep">·</span>
              <a href="#" @click.prevent="openUrl(AUTHOR_HOME)">{{ t('apex.apexQ.footerAuthor') }}</a>
            </div>
            </div>
</template>
