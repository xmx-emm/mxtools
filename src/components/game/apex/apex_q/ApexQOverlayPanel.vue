<script setup lang="ts">
import type {ApexQDialogController} from '@/composables/apex_q/useApexQDialogController.ts';
const {controller} = defineProps<{controller: ApexQDialogController}>();
const {MAX_OVERLAY_OPACITY, MIN_OVERLAY_OPACITY, flushScheduledPrefsPersist, mainTab, onOverlayLockChange, onOverlayOpacityChange, overlayPlaceOpen, overlayPreviewMeta, overlayPreviewStyle, prefs, resetOverlayPosition, schedulePrefsPersist, t, theta} = controller;
</script>

<template>
<div
              v-show="mainTab === 'overlay'"
              id="apex-q-panel-overlay"
              class="apex-q-tab-panel apex-q-preferences-block apex-q-preferences-block--first"
              role="tabpanel"
              aria-labelledby="apex-q-tab-overlay"
              tabindex="0"
            >
              <div class="apex-q-overlay-grid">
                <section class="apex-q-section apex-q-overlay-preview-card">
                  <header class="apex-q-section-heading">
                    <div>
                      <span class="apex-q-section-icon"><v-icon icon="mdi-eye" size="18" /></span>
                      <div>
                        <h2>{{ t('apex.apexQ.overlayPreview') }}</h2>
                        <p>{{ t('apex.apexQ.overlaySectionHint') }}</p>
                      </div>
                    </div>
                  </header>
                  <div class="apex-q-overlay-preview-stage">
                    <div class="apex-q-overlay-preview" :style="overlayPreviewStyle">
                      <div class="apex-q-overlay-preview-meta">{{ overlayPreviewMeta }}</div>
                      <div>
                        <span>{{ t('apex.apexQ.recommendedLow') }}</span>
                        <strong>{{ theta ? theta.recommendedLow.toFixed(2) : '—' }}°</strong>
                      </div>
                      <div>
                        <span>{{ t('apex.apexQ.recommendedHigh') }}</span>
                        <strong>{{ theta ? theta.recommendedHigh.toFixed(2) : '—' }}°</strong>
                      </div>
                    </div>
                  </div>
                </section>

                <section class="apex-q-section">
                  <header class="apex-q-section-heading">
                    <div>
                      <span class="apex-q-section-icon"><v-icon icon="mdi-tune-variant" size="18" /></span>
                      <div>
                        <h2>{{ t('apex.apexQ.overlayDisplayTitle') }}</h2>
                        <p>{{ t('apex.apexQ.overlayOpacityHint') }}</p>
                      </div>
                    </div>
                  </header>
                  <div class="apex-q-overlay-lock-control">
                    <div>
                      <strong>{{ prefs.overlayLocked ? t('apex.apexQ.overlayLocked') : t('apex.apexQ.overlayAdjusting') }}</strong>
                      <span>{{ t('apex.apexQ.overlayLockHint') }}</span>
                    </div>
                    <v-switch
                      :model-value="prefs.overlayLocked"
                      color="primary"
                      density="compact"
                      inset
                      hide-details
                      @update:model-value="onOverlayLockChange"
                    />
                  </div>
                  <div class="apex-q-range-control">
                    <div class="apex-q-range-label">
                      <span>{{ t('apex.apexQ.overlayHideSec', {sec: prefs.overlayHideSec}) }}</span>
                    </div>
                    <v-slider
                      v-model="prefs.overlayHideSec"
                      :min="0"
                      :max="60"
                      :step="1"
                      thumb-label
                      hide-details
                      @update:model-value="schedulePrefsPersist"
                      @end="flushScheduledPrefsPersist"
                    />
                    <p>{{ t('apex.apexQ.overlayHideSecHint') }}</p>
                  </div>
                  <div class="apex-q-range-control">
                    <div class="apex-q-range-label">
                      <span>{{ t('apex.apexQ.overlayOpacity', {pct: Math.round(prefs.overlayOpacity * 100)}) }}</span>
                    </div>
                    <v-slider
                      v-model="prefs.overlayOpacity"
                      :min="MIN_OVERLAY_OPACITY"
                      :max="MAX_OVERLAY_OPACITY"
                      :step="0.01"
                      thumb-label
                      hide-details
                      @end="onOverlayOpacityChange"
                    />
                  </div>
                </section>
              </div>

              <section class="apex-q-section">
                <header class="apex-q-section-heading apex-q-section-heading--actions">
                  <div>
                    <span class="apex-q-section-icon"><v-icon icon="mdi-crop-free" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.apexQ.overlayGeometry') }}</h2>
                      <p>{{ t('apex.apexQ.overlayGeometryHint') }}</p>
                    </div>
                  </div>
                  <div class="apex-q-inline-actions">
                <v-btn
                  size="small"
                  color="primary"
                  prepend-icon="mdi-crop-free"
                  @click="overlayPlaceOpen = true"
                >
                  {{ t('apex.apexQ.overlayPlaceOpen') }}
                </v-btn>
                <v-btn size="small" variant="tonal" @click="resetOverlayPosition">
                  {{ t('apex.apexQ.overlayResetPosition') }}
                </v-btn>
              </div>
                </header>
              </section>
            </div>
</template>
