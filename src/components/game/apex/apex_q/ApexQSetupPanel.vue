<script setup lang="ts">
import type {ApexQDialogController} from '@/composables/apex_q/useApexQDialogController.ts';
import ShortcutInput from '@/components/settings/ShortcutInput.vue';
import ApexQOcrEnginePanel from '@/components/game/apex/apex_q/ApexQOcrEnginePanel.vue';
import BackgroundAutostartSwitch from '@/components/settings/BackgroundAutostartSwitch.vue';
const {controller} = defineProps<{controller: ApexQDialogController}>();
const {AUTHOR_GITHUB, AUTHOR_VIDEO, applySteamUser, calibrateOpen, checkOcr, deleteOcrPack, downloadOcr, flushScheduledPrefsPersist, folderMode, loadSteamDirs, ocrCheckFailed, ocrChecking, ocrDownloadFile, ocrDownloadMirror, ocrDownloadPercent, ocrDownloading, ocrStatus, onEnabledChange, onFolderModeChange, onFolderPathBlur, onOcrEngineChange, openOcrSettings, openUrl, persist, pickFolder, prefs, resetOverlayPosition, schedulePrefsPersist, selectedSteamUserId, settingsStore, steamSelectItems, t, wizardStep, wizardSteps} = controller;
</script>

<template>
          <div class="apex-q-setup-shell">
            <aside class="apex-q-setup-sidebar">
              <div class="apex-q-sidebar-brand">
                <span class="apex-q-sidebar-mark" aria-hidden="true">Q</span>
                <div>
                  <strong>APEX Q</strong>
                  <span>{{ t('apex.apexQ.setupLabel') }}</span>
                </div>
              </div>
              <ol class="apex-q-setup-steps">
                <li
                  v-for="step in wizardSteps"
                  :key="step.index"
                  :class="{
                    'apex-q-setup-step--active': wizardStep === step.index,
                    'apex-q-setup-step--done': wizardStep > step.index,
                  }"
                >
                  <span class="apex-q-setup-step-index">
                    <v-icon v-if="wizardStep > step.index" icon="mdi-check" size="13" />
                    <template v-else>{{ step.index + 1 }}</template>
                  </span>
                  <span>{{ step.title }}</span>
                </li>
              </ol>
            </aside>

            <section class="apex-q-setup-main">
              <header class="apex-q-setup-header">
                <div class="apex-q-setup-kicker">
                  <span>{{ t('apex.apexQ.setupLabel') }}</span>
                  <span>{{ t('apex.apexQ.stepProgress', {current: wizardStep + 1, total: 7}) }}</span>
                </div>
                <h1>{{ t(`apex.apexQ.steps.${wizardStep}.short`) }}</h1>
                <p>{{ t(`apex.apexQ.steps.${wizardStep}.body`) }}</p>
              </header>

              <div class="apex-q-setup-content">

          <div v-if="wizardStep === 0" class="apex-q-step">
                <div class="apex-q-setup-feature-list">
                  <span><v-icon icon="mdi-laptop" size="17" />{{ t('apex.apexQ.setupFeatureOffline') }}</span>
                  <span><v-icon icon="mdi-lock" size="17" />{{ t('apex.apexQ.setupFeaturePrivate') }}</span>
                  <span><v-icon icon="mdi-lightning-bolt-outline" size="17" />{{ t('apex.apexQ.setupFeatureFast') }}</span>
                </div>
                <div class="apex-q-context-note">
                  <v-icon icon="mdi-information-variant" size="17" />
                  <span>{{ t('apex.apexQ.disclaimer') }}</span>
                </div>
            <div class="d-flex flex-wrap ga-2 mt-3">
              <v-btn color="primary" variant="tonal" @click="openUrl(AUTHOR_VIDEO)">
                {{ t('apex.apexQ.openVideo') }}
              </v-btn>
              <v-btn variant="tonal" @click="openUrl(AUTHOR_GITHUB)">
                {{ t('apex.apexQ.openGithub') }}
              </v-btn>
            </div>
          </div>

          <div v-else-if="wizardStep === 1" class="apex-q-step">
            <ApexQOcrEnginePanel
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
               {{ t('apex.apexQ.ocrCheckFailed') }}
             </v-alert>
             <div class="d-flex flex-wrap ga-2 mt-3">
              <v-btn variant="tonal" prepend-icon="mdi-crop-free" @click="calibrateOpen = true">
                {{ t('apex.apexQ.calibrateOpen') }}
              </v-btn>
            </div>
            <p class="text-medium-emphasis mt-2">{{ t('apex.apexQ.calibrateWizardTip') }}</p>
            <template v-if="prefs.ocrEngine === 'win'">
              <p class="text-medium-emphasis mt-4 mb-2">{{ t('apex.apexQ.ocrGuideHint') }}</p>
              <ol class="apex-q-guide-list">
                <li>{{ t('apex.apexQ.ocrGuide1') }}</li>
                <li>{{ t('apex.apexQ.ocrGuide2') }}</li>
                <li>{{ t('apex.apexQ.ocrGuide3') }}</li>
              </ol>
              <div class="apex-q-guide-placeholder mt-3">
                <v-icon icon="mdi-microsoft-windows" size="22" aria-hidden="true" />
                <span>{{ t('apex.apexQ.ocrGuideImagePending') }}</span>
              </div>
            </template>
          </div>

          <div v-else-if="wizardStep === 2" class="apex-q-step">
            <v-alert type="info" variant="tonal" class="mt-3">
              <code>+cl_showpos 1</code>
              — name / pos / ang / vel
            </v-alert>
            <v-checkbox
              v-model="prefs.showposConfirmed"
              class="mt-2"
              :label="t('apex.apexQ.showposConfirm')"
              hide-details
              @update:model-value="persist"
            />
          </div>

          <div v-else-if="wizardStep === 3" class="apex-q-step">
              <v-btn-toggle
                :model-value="folderMode"
                class="mt-3 game-page-segmented-toggle"
                density="compact"
                divided
                mandatory
                color="primary"
                variant="text"
                border
                @update:model-value="onFolderModeChange"
              >
              <v-btn value="steam" size="small">{{ t('apex.apexQ.folderModeSteam') }}</v-btn>
              <v-btn value="manual" size="small">{{ t('apex.apexQ.folderModeManual') }}</v-btn>
            </v-btn-toggle>

            <v-select
              v-if="folderMode === 'steam'"
              class="mt-3"
              :items="steamSelectItems"
              :model-value="selectedSteamUserId"
              :label="t('apex.apexQ.steamAccount')"
              hide-details
              @update:model-value="applySteamUser"
            />

            <v-text-field
              v-model="prefs.screenshotFolder"
              class="mt-3"
              :readonly="folderMode === 'steam'"
              :label="t('apex.apexQ.folderLabel')"
              hide-details
              @blur="onFolderPathBlur"
            />
            <div class="d-flex flex-wrap ga-2 mt-2">
              <v-btn color="primary" @click="pickFolder">{{ t('apex.apexQ.pickFolder') }}</v-btn>
              <v-btn variant="tonal" @click="loadSteamDirs({reconcileMode: false})">{{ t('apex.apexQ.refreshSteamAccounts') }}</v-btn>
            </div>
          </div>

          <div v-else-if="wizardStep === 4" class="apex-q-step">
            <div class="mt-3" style="max-width: 280px">
              <div class="text-caption mb-1">{{ t('apex.apexQ.hotkey') }}</div>
              <ShortcutInput v-model="prefs.hotkey" scope="apexQ" />
            </div>
            <v-slider
              v-model="prefs.delayMs"
              class="mt-4"
              :min="200"
              :max="1500"
              :step="50"
              thumb-label
              :label="t('apex.apexQ.delayMs', {ms: prefs.delayMs})"
              @update:model-value="schedulePrefsPersist"
              @end="flushScheduledPrefsPersist"
            />
          </div>

          <div v-else-if="wizardStep === 5" class="apex-q-step">
            <ol class="apex-q-guide-list mt-3">
              <li>{{ t('apex.apexQ.usage1') }}</li>
              <li>{{ t('apex.apexQ.usage2') }}</li>
              <li>{{ t('apex.apexQ.usage3') }}</li>
              <li>{{ t('apex.apexQ.usage4') }}</li>
              <li>{{ t('apex.apexQ.usage5') }}</li>
            </ol>
            <v-checkbox
              v-model="prefs.usageConfirmed"
              class="mt-2"
              :label="t('apex.apexQ.usageConfirm')"
              hide-details
              @update:model-value="persist"
            />
          </div>

          <div v-else-if="wizardStep === 6" class="apex-q-step">
            <v-switch
              :model-value="prefs.enabled"
              class="mt-2"
              color="primary"
              :label="t('apex.apexQ.enable')"
              hide-details
              @update:model-value="onEnabledChange"
            />
            <div class="apex-q-bg-options mt-2">
              <div class="text-subtitle-2 mb-1">{{ t('apex.apexQ.backgroundSection') }}</div>
              <p class="text-medium-emphasis text-caption mb-1">{{ t('apex.apexQ.backgroundGlobalHint') }}</p>
              <BackgroundAutostartSwitch compact />
              <v-checkbox
                :model-value="settingsStore.closeToTray"
                density="compact"
                :label="t('settings.closeToTray')"
                hide-details
                @update:model-value="settingsStore.setCloseToTray"
              />
              <p class="text-medium-emphasis text-caption mt-1">{{ t('settings.closeToTrayHint') }}</p>
            </div>
            <div class="apex-q-bg-options mt-3">
              <div class="text-subtitle-2 mb-1">{{ t('apex.apexQ.overlaySection') }}</div>
              <p class="text-medium-emphasis text-caption mb-1">{{ t('apex.apexQ.overlaySectionHint') }}</p>
              <v-slider
                v-model="prefs.overlayHideSec"
                :min="0"
                :max="60"
                :step="1"
                thumb-label
                :label="t('apex.apexQ.overlayHideSec', {sec: prefs.overlayHideSec})"
                :hint="t('apex.apexQ.overlayHideSecHint')"
                persistent-hint
                @update:model-value="schedulePrefsPersist"
                @end="flushScheduledPrefsPersist"
              />
              <v-btn class="mt-3" size="small" variant="tonal" @click="resetOverlayPosition">
                {{ t('apex.apexQ.overlayResetPosition') }}
              </v-btn>
            </div>
          </div>
              </div>
            </section>
          </div>
</template>
