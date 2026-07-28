<script setup lang="ts">
import type {AlterQDialogController} from '@/composables/alter_q/useAlterQDialogController.ts';
import ShortcutInput from '@/components/settings/ShortcutInput.vue';
const {controller} = defineProps<{controller: AlterQDialogController}>();
const {AUTHOR_GITHUB, AUTHOR_HOME, applySteamUser, flushScheduledPrefsPersist, folderMode, loadSteamDirs, mainTab, onFolderModeChange, onFolderPathBlur, openUrl, pickFolder, prefs, schedulePrefsPersist, selectedSteamUserId, steamSelectItems, t} = controller;
</script>

<template>
<div
              v-show="mainTab === 'settings'"
              id="alter-q-panel-settings"
              role="tabpanel"
              aria-labelledby="alter-q-tab-settings"
              tabindex="0"
            >
            <div class="alter-q-tab-panel alter-q-preferences-block alter-q-preferences-block--first">
              <section class="alter-q-section">
                <header class="alter-q-section-heading">
                  <div>
                    <span class="alter-q-section-icon"><v-icon icon="mdi-folder-outline" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.alterQ.sourceTitle') }}</h2>
                      <p>{{ t('apex.alterQ.sourceHint') }}</p>
                    </div>
                  </div>
                </header>
              <v-btn-toggle
                :model-value="folderMode"
                  class="alter-q-segmented"
                density="compact"
                mandatory
                color="primary"
                variant="text"
                @update:model-value="onFolderModeChange"
              >
                <v-btn value="steam" size="small">{{ t('apex.alterQ.folderModeSteam') }}</v-btn>
                <v-btn value="manual" size="small">{{ t('apex.alterQ.folderModeManual') }}</v-btn>
              </v-btn-toggle>

                <div class="alter-q-source-fields">
                  <v-select
                v-if="folderMode === 'steam'"
                density="compact"
                :items="steamSelectItems"
                :model-value="selectedSteamUserId"
                :label="t('apex.alterQ.steamAccount')"
                hide-details
                @update:model-value="applySteamUser"
              />

              <v-text-field
                v-model="prefs.screenshotFolder"
                density="compact"
                :readonly="folderMode === 'steam'"
                :label="t('apex.alterQ.folderLabel')"
                hide-details
                @blur="onFolderPathBlur"
              />
                </div>
              <div class="alter-q-inline-actions">
                  <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-folder-outline" @click="pickFolder">
                    {{ t('apex.alterQ.pickFolder') }}
                  </v-btn>
                <v-btn size="small" variant="tonal" @click="loadSteamDirs({reconcileMode: false})">
                  {{ t('apex.alterQ.refreshSteamAccounts') }}
                </v-btn>
              </div>
              </section>

              <section class="alter-q-section">
                <header class="alter-q-section-heading">
                  <div>
                    <span class="alter-q-section-icon"><v-icon icon="mdi-keyboard-variant" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.alterQ.hotkeyTitle') }}</h2>
                      <p>{{ t('apex.alterQ.hotkeyHint') }}</p>
                    </div>
                  </div>
                </header>
                <div class="alter-q-trigger-grid">
                  <div>
                    <label>{{ t('apex.alterQ.hotkey') }}</label>
                    <ShortcutInput v-model="prefs.hotkey" scope="alterQ" />
                  </div>
                  <div class="alter-q-delay-control">
              <v-slider
                v-model="prefs.delayMs"
                :min="200"
                :max="1500"
                :step="50"
                thumb-label
                :label="t('apex.alterQ.delayMs', {ms: prefs.delayMs})"
                hide-details
                @update:model-value="schedulePrefsPersist"
                @end="flushScheduledPrefsPersist"
              />
                  </div>
                </div>
              </section>

            </div>
            <div class="alter-q-footer">
              <a href="#" @click.prevent="openUrl(AUTHOR_GITHUB)">{{ t('apex.alterQ.footerRepo') }}</a>
              <span class="alter-q-footer-sep">·</span>
              <a href="#" @click.prevent="openUrl(AUTHOR_HOME)">{{ t('apex.alterQ.footerAuthor') }}</a>
            </div>
            </div>
</template>
