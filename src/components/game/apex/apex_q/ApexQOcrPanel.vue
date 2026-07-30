<script setup lang="ts">
import type {ApexQDialogController} from '@/composables/apex_q/useApexQDialogController.ts';
import ApexQOcrEnginePanel from '@/components/game/apex/apex_q/ApexQOcrEnginePanel.vue';
const {controller} = defineProps<{controller: ApexQDialogController}>();
const {calibrateOpen, captureBusy, captureError, checkOcr, deleteOcrPack, downloadOcr, formatApexQError, formatOcrReadingMeta, lastResult, mainTab, ocrCheckFailed, ocrChecking, ocrDownloadFile, ocrDownloadMirror, ocrDownloadPercent, ocrDownloading, ocrStatus, onOcrEngineChange, openOcrSettings, persist, prefs, resetRois, t} = controller;
</script>

<template>
<div
              v-show="mainTab === 'ocr'"
              id="apex-q-panel-ocr"
              class="apex-q-tab-panel"
              role="tabpanel"
              aria-labelledby="apex-q-tab-ocr"
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
                {{ t('apex.apexQ.ocrCheckFailed') }}
              </v-alert>
              <ApexQOcrEnginePanel
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

              <section class="apex-q-section">
                <header class="apex-q-section-heading">
                  <div>
                    <span class="apex-q-section-icon"><v-icon icon="mdi-text-box-search-outline" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.apexQ.latestReading') }}</h2>
                      <p>{{ t('apex.apexQ.ocrLogHint') }}</p>
                    </div>
                  </div>
                </header>

                <div
                  v-if="captureBusy || captureError"
                  class="apex-q-empty-state"
                  :class="{'apex-q-empty-state--error': captureError}"
                >
                  <v-alert v-if="captureError" type="error" variant="tonal" density="compact">
                    {{ t('apex.apexQ.captureFailed') }}
                  </v-alert>
                  <template v-else>
                    <span><v-progress-circular indeterminate size="24" width="2" /></span>
                    <p>{{ t('apex.apexQ.ocrReading') }}</p>
                  </template>
                </div>
                <div v-else-if="!lastResult" class="apex-q-empty-state">
                  <span><v-icon icon="mdi-image-search-outline" size="26" /></span>
                  <p>{{ t('apex.apexQ.ocrLogEmpty') }}</p>
              </div>
              <template v-else>
                <v-alert
                  v-if="lastResult.error"
                  type="warning"
                  variant="tonal"
                  class="mb-3"
                >
                  {{ formatApexQError(lastResult.error) }}
                </v-alert>
                <div class="apex-q-ocr-grid mb-3">
                  <div class="apex-q-ocr-card">
                    <div class="text-subtitle-2 mb-1">{{ t('apex.apexQ.calibrateVerifyAlpha') }}</div>
                    <div class="apex-q-ocr-value">
                      {{ lastResult.alpha != null ? `${lastResult.alpha.toFixed(2)}°` : '—' }}
                    </div>
                    <div v-if="lastResult.showposEngine" class="apex-q-ocr-meta mb-2">
                      {{ formatOcrReadingMeta(lastResult.showposEngine, lastResult.showposConfidence) }}
                    </div>
                    <div class="text-caption text-medium-emphasis mb-1">
                      {{ t('apex.apexQ.angSplitHint') }}
                    </div>
                    <div class="apex-q-ang-split text-caption mb-2">
                      <span>{{ t('apex.apexQ.angPitch') }}:
                        <strong>{{ lastResult.alpha != null ? lastResult.alpha.toFixed(2) : '—' }}</strong>
                      </span>
                      <span>{{ t('apex.apexQ.angYaw') }}:
                        <strong>{{ lastResult.angYaw != null ? lastResult.angYaw.toFixed(2) : '—' }}</strong>
                      </span>
                      <span>{{ t('apex.apexQ.angRoll') }}:
                        <strong>{{ lastResult.angRoll != null ? lastResult.angRoll.toFixed(2) : '—' }}</strong>
                      </span>
                    </div>
                    <img
                      v-if="lastResult.showposPreview"
                      class="apex-q-ocr-crop"
                      :src="lastResult.showposPreview"
                      alt="showpos crop"
                    />
                    <pre class="apex-q-ocr-raw">{{ lastResult.showposText || '—' }}</pre>
                  </div>
                  <div class="apex-q-ocr-card">
                    <div class="text-subtitle-2 mb-1">{{ t('apex.apexQ.calibrateVerifyDistance') }}</div>
                    <div class="apex-q-ocr-value">
                      {{ lastResult.distanceM != null ? `${lastResult.distanceM.toFixed(1)} m` : '—' }}
                    </div>
                    <div v-if="lastResult.pingEngine" class="apex-q-ocr-meta mb-2">
                      {{ formatOcrReadingMeta(lastResult.pingEngine, lastResult.pingConfidence) }}
                    </div>
                    <img
                      v-if="lastResult.pingPreview"
                      class="apex-q-ocr-crop"
                      :src="lastResult.pingPreview"
                      alt="ping crop"
                    />
                    <pre class="apex-q-ocr-raw">{{ lastResult.pingText || '—' }}</pre>
                  </div>
                </div>
                  <div class="apex-q-ocr-path" :title="lastResult.screenshotPath">
                    <v-icon icon="mdi-file-image-outline" size="14" />
                  {{ t('apex.apexQ.ocrLogPath') }}: {{ lastResult.screenshotPath || '—' }}
                </div>
              </template>
              </section>

              <section class="apex-q-section">
                <header class="apex-q-section-heading apex-q-section-heading--actions">
                  <div>
                    <span class="apex-q-section-icon"><v-icon icon="mdi-crop-free" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.apexQ.roiTitle') }}</h2>
                      <p>{{ t('apex.apexQ.roiHint') }}</p>
                    </div>
                  </div>
                  <div class="apex-q-inline-actions">
                    <v-btn size="small" color="primary" prepend-icon="mdi-crop-free" @click="calibrateOpen = true">
                  {{ t('apex.apexQ.calibrateOpen') }}
                </v-btn>
                <v-btn size="small" variant="text" @click="resetRois">
                  {{ t('apex.apexQ.resetRoi') }}
                </v-btn>
              </div>
                </header>
              <v-expansion-panels class="apex-q-roi-advanced" variant="accordion">
                <v-expansion-panel elevation="0">
                  <v-expansion-panel-title>
                    {{ t('apex.apexQ.roiAdvanced') }}
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <div class="apex-q-roi-value-groups">
                      <div>
                        <div class="text-caption font-weight-medium mb-2">showpos</div>
                        <div class="apex-q-roi-values">
                          <v-text-field v-model.number="prefs.showposRoi.x" type="number" density="compact" label="x" hide-details @change="persist" />
                          <v-text-field v-model.number="prefs.showposRoi.y" type="number" density="compact" label="y" hide-details @change="persist" />
                          <v-text-field v-model.number="prefs.showposRoi.w" type="number" density="compact" label="w" hide-details @change="persist" />
                          <v-text-field v-model.number="prefs.showposRoi.h" type="number" density="compact" label="h" hide-details @change="persist" />
                        </div>
                      </div>
                      <div>
                        <div class="text-caption font-weight-medium mb-2">ping</div>
                        <div class="apex-q-roi-values">
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
