<script setup lang="ts">
import type {AlterQDialogController} from '@/composables/alter_q/useAlterQDialogController.ts';
import ShortcutInput from '@/components/settings/ShortcutInput.vue';
import ApexAlterQOcrEnginePanel from '@/components/game/apex/alter_q/ApexAlterQOcrEnginePanel.vue';
const {controller} = defineProps<{controller: AlterQDialogController}>();
const {AUTHOR_GITHUB, AUTHOR_VIDEO, applySteamUser, calibrateOpen, checkOcr, deleteOcrPack, downloadOcr, flushScheduledPrefsPersist, folderMode, loadSteamDirs, ocrCheckFailed, ocrChecking, ocrDownloadFile, ocrDownloadMirror, ocrDownloadPercent, ocrDownloading, ocrStatus, onEnabledChange, onFolderModeChange, onFolderPathBlur, onOcrEngineChange, openOcrSettings, openUrl, persist, pickFolder, prefs, resetOverlayPosition, schedulePrefsPersist, selectedSteamUserId, settingsStore, steamSelectItems, t, wizardStep, wizardSteps} = controller;
</script>

<template>
          <div class="alter-q-setup-shell">
            <aside class="alter-q-setup-sidebar">
              <div class="alter-q-sidebar-brand">
                <span class="alter-q-sidebar-mark" aria-hidden="true">Q</span>
                <div>
                  <strong>Alter Q</strong>
                  <span>{{ t('apex.alterQ.setupLabel') }}</span>
                </div>
              </div>
              <ol class="alter-q-setup-steps">
                <li
                  v-for="step in wizardSteps"
                  :key="step.index"
                  :class="{
                    'alter-q-setup-step--active': wizardStep === step.index,
                    'alter-q-setup-step--done': wizardStep > step.index,
                  }"
                >
                  <span class="alter-q-setup-step-index">
                    <v-icon v-if="wizardStep > step.index" icon="mdi-check" size="13" />
                    <template v-else>{{ step.index + 1 }}</template>
                  </span>
                  <span>{{ step.title }}</span>
                </li>
              </ol>
            </aside>

            <section class="alter-q-setup-main">
              <header class="alter-q-setup-header">
                <div class="alter-q-setup-kicker">
                  <span>{{ t('apex.alterQ.setupLabel') }}</span>
                  <span>{{ t('apex.alterQ.stepProgress', {current: wizardStep + 1, total: 7}) }}</span>
                </div>
                <h1>{{ t(`apex.alterQ.steps.${wizardStep}.short`) }}</h1>
                <p>{{ t(`apex.alterQ.steps.${wizardStep}.body`) }}</p>
              </header>

              <div class="alter-q-setup-content">

          <div v-if="wizardStep === 0" class="alter-q-step">
                <div class="alter-q-setup-feature-list">
                  <span><v-icon icon="mdi-laptop" size="17" />{{ t('apex.alterQ.setupFeatureOffline') }}</span>
                  <span><v-icon icon="mdi-lock" size="17" />{{ t('apex.alterQ.setupFeaturePrivate') }}</span>
                  <span><v-icon icon="mdi-lightning-bolt-outline" size="17" />{{ t('apex.alterQ.setupFeatureFast') }}</span>
                </div>
                <div class="alter-q-context-note">
                  <v-icon icon="mdi-information-variant" size="17" />
                  <span>{{ t('apex.alterQ.disclaimer') }}</span>
                </div>
            <div class="d-flex flex-wrap ga-2 mt-3">
              <v-btn color="primary" variant="tonal" @click="openUrl(AUTHOR_VIDEO)">
                {{ t('apex.alterQ.openVideo') }}
              </v-btn>
              <v-btn variant="tonal" @click="openUrl(AUTHOR_GITHUB)">
                {{ t('apex.alterQ.openGithub') }}
              </v-btn>
            </div>
          </div>

          <div v-else-if="wizardStep === 1" class="alter-q-step">
            <ApexAlterQOcrEnginePanel
              :status="ocrStatus"
              :checking="ocrChecking"
              :downloading="ocrDownloading"
              :download-percent="ocrDownloadPercent"
              :download-file="ocrDownloadFile"
              :download-mirror="ocrDownloadMirror"
              :engine="prefs.ocrEngine"
              @update:engine="onOcrEngineChange"
              @download="downloadOcr"
              @recheck="checkOcr"
               @delete="deleteOcrPack"
               @open-win-settings="openOcrSettings"
             />
             <v-alert
               v-if="ocrCheckFailed"
               type="warning"
               variant="tonal"
               density="compact"
               class="mt-3"
               closable
               @click:close="ocrCheckFailed = false"
             >
               {{ t('apex.alterQ.ocrCheckFailed') }}
             </v-alert>
             <div class="d-flex flex-wrap ga-2 mt-3">
              <v-btn variant="tonal" prepend-icon="mdi-crop-free" @click="calibrateOpen = true">
                {{ t('apex.alterQ.calibrateOpen') }}
              </v-btn>
            </div>
            <p class="text-medium-emphasis mt-2">{{ t('apex.alterQ.calibrateWizardTip') }}</p>
            <template v-if="prefs.ocrEngine === 'win'">
              <p class="text-medium-emphasis mt-4 mb-2">{{ t('apex.alterQ.ocrGuideHint') }}</p>
              <ol class="alter-q-guide-list">
                <li>{{ t('apex.alterQ.ocrGuide1') }}</li>
                <li>{{ t('apex.alterQ.ocrGuide2') }}</li>
                <li>{{ t('apex.alterQ.ocrGuide3') }}</li>
              </ol>
              <div class="alter-q-guide-placeholder mt-3">
                <v-icon icon="mdi-microsoft-windows" size="22" aria-hidden="true" />
                <span>{{ t('apex.alterQ.ocrGuideImagePending') }}</span>
              </div>
            </template>
          </div>

          <div v-else-if="wizardStep === 2" class="alter-q-step">
            <v-alert type="info" variant="tonal" class="mt-3">
              <code>+cl_showpos 1</code>
              — name / pos / ang / vel
            </v-alert>
            <v-checkbox
              v-model="prefs.showposConfirmed"
              class="mt-2"
              :label="t('apex.alterQ.showposConfirm')"
              hide-details
              @update:model-value="persist"
            />
          </div>

          <div v-else-if="wizardStep === 3" class="alter-q-step">
              <v-btn-toggle
                :model-value="folderMode"
                class="mt-3"
              density="compact"
              divided
                mandatory
                color="primary"
                @update:model-value="onFolderModeChange"
              >
              <v-btn value="steam" size="small">{{ t('apex.alterQ.folderModeSteam') }}</v-btn>
              <v-btn value="manual" size="small">{{ t('apex.alterQ.folderModeManual') }}</v-btn>
            </v-btn-toggle>

            <v-select
              v-if="folderMode === 'steam'"
              class="mt-3"
              :items="steamSelectItems"
              :model-value="selectedSteamUserId"
              :label="t('apex.alterQ.steamAccount')"
              hide-details
              @update:model-value="applySteamUser"
            />

            <v-text-field
              v-model="prefs.screenshotFolder"
              class="mt-3"
              :readonly="folderMode === 'steam'"
              :label="t('apex.alterQ.folderLabel')"
              hide-details
              @blur="onFolderPathBlur"
            />
            <div class="d-flex flex-wrap ga-2 mt-2">
              <v-btn color="primary" @click="pickFolder">{{ t('apex.alterQ.pickFolder') }}</v-btn>
              <v-btn variant="tonal" @click="loadSteamDirs({reconcileMode: false})">{{ t('apex.alterQ.refreshSteamAccounts') }}</v-btn>
            </div>
          </div>

          <div v-else-if="wizardStep === 4" class="alter-q-step">
            <div class="mt-3" style="max-width: 280px">
              <div class="text-caption mb-1">{{ t('apex.alterQ.hotkey') }}</div>
              <ShortcutInput v-model="prefs.hotkey" scope="alterQ" />
            </div>
            <v-slider
              v-model="prefs.delayMs"
              class="mt-4"
              :min="200"
              :max="1500"
              :step="50"
              thumb-label
              :label="t('apex.alterQ.delayMs', {ms: prefs.delayMs})"
              @update:model-value="schedulePrefsPersist"
              @end="flushScheduledPrefsPersist"
            />
          </div>

          <div v-else-if="wizardStep === 5" class="alter-q-step">
            <ol class="alter-q-guide-list mt-3">
              <li>{{ t('apex.alterQ.usage1') }}</li>
              <li>{{ t('apex.alterQ.usage2') }}</li>
              <li>{{ t('apex.alterQ.usage3') }}</li>
              <li>{{ t('apex.alterQ.usage4') }}</li>
              <li>{{ t('apex.alterQ.usage5') }}</li>
            </ol>
            <v-checkbox
              v-model="prefs.usageConfirmed"
              class="mt-2"
              :label="t('apex.alterQ.usageConfirm')"
              hide-details
              @update:model-value="persist"
            />
          </div>

          <div v-else-if="wizardStep === 6" class="alter-q-step">
            <v-switch
              :model-value="prefs.enabled"
              class="mt-2"
              color="primary"
              :label="t('apex.alterQ.enable')"
              hide-details
              @update:model-value="onEnabledChange"
            />
            <div class="alter-q-bg-options mt-2">
              <div class="text-subtitle-2 mb-1">{{ t('apex.alterQ.backgroundSection') }}</div>
              <p class="text-medium-emphasis text-caption mb-1">{{ t('apex.alterQ.backgroundGlobalHint') }}</p>
              <v-checkbox
                :model-value="settingsStore.autostart"
                density="compact"
                :label="t('settings.autostart')"
                hide-details
                @update:model-value="settingsStore.setAutostart"
              />
              <v-checkbox
                :model-value="settingsStore.startInTray"
                density="compact"
                :label="t('settings.startInTray')"
                hide-details
                @update:model-value="settingsStore.setStartInTray"
              />
              <v-checkbox
                :model-value="settingsStore.closeToTray"
                density="compact"
                :label="t('settings.closeToTray')"
                hide-details
                @update:model-value="settingsStore.setCloseToTray"
              />
              <p class="text-medium-emphasis text-caption mt-1">{{ t('settings.closeToTrayHint') }}</p>
            </div>
            <div class="alter-q-bg-options mt-3">
              <div class="text-subtitle-2 mb-1">{{ t('apex.alterQ.overlaySection') }}</div>
              <p class="text-medium-emphasis text-caption mb-1">{{ t('apex.alterQ.overlaySectionHint') }}</p>
              <v-slider
                v-model="prefs.overlayHideSec"
                :min="0"
                :max="60"
                :step="1"
                thumb-label
                :label="t('apex.alterQ.overlayHideSec', {sec: prefs.overlayHideSec})"
                :hint="t('apex.alterQ.overlayHideSecHint')"
                persistent-hint
                @update:model-value="schedulePrefsPersist"
                @end="flushScheduledPrefsPersist"
              />
              <v-btn class="mt-3" size="small" variant="tonal" @click="resetOverlayPosition">
                {{ t('apex.alterQ.overlayResetPosition') }}
              </v-btn>
            </div>
          </div>
              </div>
            </section>
          </div>
</template>
