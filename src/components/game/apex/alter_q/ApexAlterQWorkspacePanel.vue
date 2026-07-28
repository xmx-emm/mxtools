<script setup lang="ts">
import type {AlterQDialogController} from '@/composables/alter_q/useAlterQDialogController.ts';
const {controller} = defineProps<{controller: AlterQDialogController}>();
const {busy, calibrateOpen, captureNow, mainTab, manualAlpha, manualInputsValid, manualR, pickScreenshotAndOcr, recompute, t, theta} = controller;
</script>

<template>
<div
              v-show="mainTab === 'workspace'"
              id="alter-q-panel-workspace"
              class="alter-q-tab-panel"
              role="tabpanel"
              aria-labelledby="alter-q-tab-workspace"
              tabindex="0"
            >
              <section class="alter-q-result">
                <header class="alter-q-section-heading alter-q-result-heading">
                  <div>
                    <span class="alter-q-section-icon"><v-icon icon="mdi-angle-acute" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.alterQ.resultTitle') }}</h2>
                      <p v-if="!theta">{{ t('apex.alterQ.resultEmpty') }}</p>
                      <p v-else>{{ t('apex.alterQ.resultHint') }}</p>
                    </div>
                  </div>
                  <v-btn
                    size="small"
                    variant="text"
                    prepend-icon="mdi-crop-free"
                    @click="calibrateOpen = true"
                  >
                    {{ t('apex.alterQ.calibrateOpen') }}
                  </v-btn>
                </header>
                <div class="alter-q-result-grid">
                  <div class="alter-q-result-main alter-q-result-main--preferred">
                    <div class="alter-q-result-label">
                      {{ t('apex.alterQ.recommendedLow') }}
                      <span>{{ t('apex.alterQ.preferred') }}</span>
                    </div>
                  <div class="alter-q-angle">
                    {{ theta ? theta.recommendedLow.toFixed(2) : '—' }}°
                  </div>
                </div>
                <div class="alter-q-result-main">
                    <div class="alter-q-result-label">{{ t('apex.alterQ.recommendedHigh') }}</div>
                  <div class="alter-q-angle">
                    {{ theta ? theta.recommendedHigh.toFixed(2) : '—' }}°
                  </div>
                </div>
              </div>
              </section>

              <div class="alter-q-calc-grid">
                <section class="alter-q-section">
                  <header class="alter-q-section-heading">
                    <div>
                      <span class="alter-q-section-icon"><v-icon icon="mdi-tune-variant" size="18" /></span>
                      <div>
                        <h2>{{ t('apex.alterQ.manualTitle') }}</h2>
                        <p>{{ t('apex.alterQ.manualHint') }}</p>
                      </div>
                    </div>
                  </header>
                  <div class="alter-q-manual-fields">
                <v-text-field
                  v-model.number="manualR"
                  type="number"
                  density="compact"
                  :label="t('apex.alterQ.distance')"
                  hide-details
                />
                <v-text-field
                  v-model.number="manualAlpha"
                  type="number"
                  density="compact"
                  :label="t('apex.alterQ.alpha')"
                  hide-details
                />
                  </div>
                  <v-btn block variant="tonal" :disabled="busy || !manualInputsValid" @click="recompute">
                  {{ t('apex.alterQ.recompute') }}
                </v-btn>
                </section>

                <section class="alter-q-section alter-q-capture-section">
                  <header class="alter-q-section-heading">
                    <div>
                      <span class="alter-q-section-icon"><v-icon icon="mdi-camera-outline" size="18" /></span>
                      <div>
                        <h2>{{ t('apex.alterQ.captureTitle') }}</h2>
                        <p>{{ t('apex.alterQ.captureHint') }}</p>
                      </div>
                    </div>
                  </header>
                  <div class="alter-q-capture-actions">
                    <v-btn color="primary" block :loading="busy" prepend-icon="mdi-lightning-bolt-outline" @click="captureNow">
                  {{ t('apex.alterQ.captureNow') }}
                </v-btn>
                    <v-btn block variant="text" :loading="busy" prepend-icon="mdi-image-outline" @click="pickScreenshotAndOcr">
                  {{ t('apex.alterQ.pickScreenshot') }}
                </v-btn>
                  </div>
                </section>
              </div>
            </div>
</template>
