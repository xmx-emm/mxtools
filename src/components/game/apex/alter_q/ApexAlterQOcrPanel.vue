<script setup lang="ts">
import type {AlterQDialogController} from '@/composables/alter_q/useAlterQDialogController.ts';
import ApexAlterQOcrEnginePanel from '@/components/game/apex/alter_q/ApexAlterQOcrEnginePanel.vue';
const {controller} = defineProps<{controller: AlterQDialogController}>();
const {calibrateOpen, captureBusy, captureError, checkOcr, deleteOcrPack, downloadOcr, formatAlterQError, formatOcrReadingMeta, lastResult, mainTab, ocrCheckFailed, ocrChecking, ocrDownloadFile, ocrDownloadMirror, ocrDownloadPercent, ocrDownloading, ocrStatus, onOcrEngineChange, openOcrSettings, persist, prefs, resetRois, t} = controller;
</script>

<template>
<div
              v-show="mainTab === 'ocr'"
              id="alter-q-panel-ocr"
              class="alter-q-tab-panel"
              role="tabpanel"
              aria-labelledby="alter-q-tab-ocr"
              tabindex="0"
            >
              <v-alert
                v-if="ocrCheckFailed"
                type="warning"
                variant="tonal"
                density="compact"
                class="mb-3"
                closable
                @click:close="ocrCheckFailed = false"
              >
                {{ t('apex.alterQ.ocrCheckFailed') }}
              </v-alert>
              <ApexAlterQOcrEnginePanel
                compact
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

              <section class="alter-q-section">
                <header class="alter-q-section-heading">
                  <div>
                    <span class="alter-q-section-icon"><v-icon icon="mdi-text-box-search-outline" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.alterQ.latestReading') }}</h2>
                      <p>{{ t('apex.alterQ.ocrLogHint') }}</p>
                    </div>
                  </div>
                </header>

                <div
                  v-if="captureBusy || captureError"
                  class="alter-q-empty-state"
                  :class="{'alter-q-empty-state--error': captureError}"
                >
                  <v-alert v-if="captureError" type="error" variant="tonal" density="compact">
                    {{ t('apex.alterQ.captureFailed') }}
                  </v-alert>
                  <template v-else>
                    <span><v-progress-circular indeterminate size="24" width="2" /></span>
                    <p>{{ t('apex.alterQ.ocrReading') }}</p>
                  </template>
                </div>
                <div v-else-if="!lastResult" class="alter-q-empty-state">
                  <span><v-icon icon="mdi-image-search-outline" size="26" /></span>
                  <p>{{ t('apex.alterQ.ocrLogEmpty') }}</p>
              </div>
              <template v-else>
                <v-alert
                  v-if="lastResult.error"
                  type="warning"
                  variant="tonal"
                  class="mb-3"
                >
                  {{ formatAlterQError(lastResult.error) }}
                </v-alert>
                <div class="alter-q-ocr-grid mb-3">
                  <div class="alter-q-ocr-card">
                    <div class="text-subtitle-2 mb-1">{{ t('apex.alterQ.calibrateVerifyAlpha') }}</div>
                    <div class="alter-q-ocr-value">
                      {{ lastResult.alpha != null ? `${lastResult.alpha.toFixed(2)}°` : '—' }}
                    </div>
                    <div v-if="lastResult.showposEngine" class="alter-q-ocr-meta mb-2">
                      {{ formatOcrReadingMeta(lastResult.showposEngine, lastResult.showposConfidence) }}
                    </div>
                    <div class="text-caption text-medium-emphasis mb-1">
                      {{ t('apex.alterQ.angSplitHint') }}
                    </div>
                    <div class="alter-q-ang-split text-caption mb-2">
                      <span>{{ t('apex.alterQ.angPitch') }}:
                        <strong>{{ lastResult.alpha != null ? lastResult.alpha.toFixed(2) : '—' }}</strong>
                      </span>
                      <span>{{ t('apex.alterQ.angYaw') }}:
                        <strong>{{ lastResult.angYaw != null ? lastResult.angYaw.toFixed(2) : '—' }}</strong>
                      </span>
                      <span>{{ t('apex.alterQ.angRoll') }}:
                        <strong>{{ lastResult.angRoll != null ? lastResult.angRoll.toFixed(2) : '—' }}</strong>
                      </span>
                    </div>
                    <img
                      v-if="lastResult.showposPreview"
                      class="alter-q-ocr-crop"
                      :src="lastResult.showposPreview"
                      alt="showpos crop"
                    />
                    <pre class="alter-q-ocr-raw">{{ lastResult.showposText || '—' }}</pre>
                  </div>
                  <div class="alter-q-ocr-card">
                    <div class="text-subtitle-2 mb-1">{{ t('apex.alterQ.calibrateVerifyDistance') }}</div>
                    <div class="alter-q-ocr-value">
                      {{ lastResult.distanceM != null ? `${lastResult.distanceM.toFixed(1)} m` : '—' }}
                    </div>
                    <div v-if="lastResult.pingEngine" class="alter-q-ocr-meta mb-2">
                      {{ formatOcrReadingMeta(lastResult.pingEngine, lastResult.pingConfidence) }}
                    </div>
                    <img
                      v-if="lastResult.pingPreview"
                      class="alter-q-ocr-crop"
                      :src="lastResult.pingPreview"
                      alt="ping crop"
                    />
                    <pre class="alter-q-ocr-raw">{{ lastResult.pingText || '—' }}</pre>
                  </div>
                </div>
                  <div class="alter-q-ocr-path" :title="lastResult.screenshotPath">
                    <v-icon icon="mdi-file-image-outline" size="14" />
                  {{ t('apex.alterQ.ocrLogPath') }}: {{ lastResult.screenshotPath || '—' }}
                </div>
              </template>
              </section>

              <section class="alter-q-section">
                <header class="alter-q-section-heading alter-q-section-heading--actions">
                  <div>
                    <span class="alter-q-section-icon"><v-icon icon="mdi-crop-free" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.alterQ.roiTitle') }}</h2>
                      <p>{{ t('apex.alterQ.roiHint') }}</p>
                    </div>
                  </div>
                  <div class="alter-q-inline-actions">
                    <v-btn size="small" color="primary" prepend-icon="mdi-crop-free" @click="calibrateOpen = true">
                  {{ t('apex.alterQ.calibrateOpen') }}
                </v-btn>
                <v-btn size="small" variant="text" @click="resetRois">
                  {{ t('apex.alterQ.resetRoi') }}
                </v-btn>
              </div>
                </header>
              <v-expansion-panels class="alter-q-roi-advanced" variant="accordion">
                <v-expansion-panel elevation="0">
                  <v-expansion-panel-title>
                    {{ t('apex.alterQ.roiAdvanced') }}
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <div class="alter-q-roi-value-groups">
                      <div>
                        <div class="text-caption font-weight-medium mb-2">showpos</div>
                        <div class="alter-q-roi-values">
                          <v-text-field v-model.number="prefs.showposRoi.x" type="number" density="compact" label="x" hide-details @change="persist" />
                          <v-text-field v-model.number="prefs.showposRoi.y" type="number" density="compact" label="y" hide-details @change="persist" />
                          <v-text-field v-model.number="prefs.showposRoi.w" type="number" density="compact" label="w" hide-details @change="persist" />
                          <v-text-field v-model.number="prefs.showposRoi.h" type="number" density="compact" label="h" hide-details @change="persist" />
                        </div>
                      </div>
                      <div>
                        <div class="text-caption font-weight-medium mb-2">ping</div>
                        <div class="alter-q-roi-values">
                          <v-text-field v-model.number="prefs.pingRoi.x" type="number" density="compact" label="x" hide-details @change="persist" />
                          <v-text-field v-model.number="prefs.pingRoi.y" type="number" density="compact" label="y" hide-details @change="persist" />
                          <v-text-field v-model.number="prefs.pingRoi.w" type="number" density="compact" label="w" hide-details @change="persist" />
                          <v-text-field v-model.number="prefs.pingRoi.h" type="number" density="compact" label="h" hide-details @change="persist" />
                        </div>
                      </div>
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
              </section>
            </div>
</template>
