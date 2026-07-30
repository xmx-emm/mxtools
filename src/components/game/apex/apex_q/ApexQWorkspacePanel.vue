<script setup lang="ts">
import type {ApexQDialogController} from '@/composables/apex_q/useApexQDialogController.ts';
const {controller} = defineProps<{controller: ApexQDialogController}>();
const {busy, calibrateOpen, captureNow, mainTab, manualAlpha, manualInputsValid, manualR, pickScreenshotAndOcr, recompute, t, theta} = controller;
</script>

<template>
<div
              v-show="mainTab === 'workspace'"
              id="apex-q-panel-workspace"
              class="apex-q-tab-panel"
              role="tabpanel"
              aria-labelledby="apex-q-tab-workspace"
              tabindex="0"
            >
              <section class="apex-q-result">
                <header class="apex-q-section-heading apex-q-result-heading">
                  <div>
                    <span class="apex-q-section-icon"><v-icon icon="mdi-angle-acute" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.apexQ.resultTitle') }}</h2>
                      <p v-if="!theta">{{ t('apex.apexQ.resultEmpty') }}</p>
                      <p v-else>{{ t('apex.apexQ.resultHint') }}</p>
                    </div>
                  </div>
                  <v-btn
                    size="small"
                    variant="text"
                    prepend-icon="mdi-crop-free"
                    @click="calibrateOpen = true"
                  >
                    {{ t('apex.apexQ.calibrateOpen') }}
                  </v-btn>
                </header>
                <div class="apex-q-result-grid">
                  <div class="apex-q-result-main apex-q-result-main--preferred">
                    <div class="apex-q-result-label">
                      {{ t('apex.apexQ.recommendedLow') }}
                      <span>{{ t('apex.apexQ.preferred') }}</span>
                    </div>
                  <div class="apex-q-angle">
                    {{ theta ? theta.recommendedLow.toFixed(2) : '—' }}°
                  </div>
                </div>
                <div class="apex-q-result-main">
                    <div class="apex-q-result-label">{{ t('apex.apexQ.recommendedHigh') }}</div>
                  <div class="apex-q-angle">
                    {{ theta ? theta.recommendedHigh.toFixed(2) : '—' }}°
                  </div>
                </div>
              </div>
              </section>

              <div class="apex-q-calc-grid">
                <section class="apex-q-section">
                  <header class="apex-q-section-heading">
                    <div>
                      <span class="apex-q-section-icon"><v-icon icon="mdi-tune-variant" size="18" /></span>
                      <div>
                        <h2>{{ t('apex.apexQ.manualTitle') }}</h2>
                        <p>{{ t('apex.apexQ.manualHint') }}</p>
                      </div>
                    </div>
                  </header>
                  <div class="apex-q-manual-fields">
                <v-text-field
                  v-model.number="manualR"
                  type="number"
                  density="compact"
                  :label="t('apex.apexQ.distance')"
                  hide-details
                />
                <v-text-field
                  v-model.number="manualAlpha"
                  type="number"
                  density="compact"
                  :label="t('apex.apexQ.alpha')"
                  hide-details
                />
                  </div>
                  <v-btn block variant="tonal" :disabled="busy || !manualInputsValid" @click="recompute">
                  {{ t('apex.apexQ.recompute') }}
                </v-btn>
                </section>

                <section class="apex-q-section apex-q-capture-section">
                  <header class="apex-q-section-heading">
                    <div>
                      <span class="apex-q-section-icon"><v-icon icon="mdi-camera-outline" size="18" /></span>
                      <div>
                        <h2>{{ t('apex.apexQ.captureTitle') }}</h2>
                        <p>{{ t('apex.apexQ.captureHint') }}</p>
                      </div>
                    </div>
                  </header>
                  <div class="apex-q-capture-actions">
                    <v-btn color="primary" block :loading="busy" prepend-icon="mdi-lightning-bolt-outline" @click="captureNow">
                  {{ t('apex.apexQ.captureNow') }}
                </v-btn>
                    <v-btn block variant="text" :loading="busy" prepend-icon="mdi-image-outline" @click="pickScreenshotAndOcr">
                  {{ t('apex.apexQ.pickScreenshot') }}
                </v-btn>
                  </div>
                </section>
              </div>
            </div>
</template>
