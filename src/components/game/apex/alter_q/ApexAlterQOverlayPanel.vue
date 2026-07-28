<script setup lang="ts">
import type {AlterQDialogController} from '@/composables/alter_q/useAlterQDialogController.ts';
const {controller} = defineProps<{controller: AlterQDialogController}>();
const {MAX_OVERLAY_OPACITY, MIN_OVERLAY_OPACITY, flushScheduledPrefsPersist, mainTab, onOverlayLockChange, onOverlayOpacityChange, overlayPlaceOpen, overlayPreviewMeta, overlayPreviewStyle, prefs, resetOverlayPosition, schedulePrefsPersist, t, theta} = controller;
</script>

<template>
<div
              v-show="mainTab === 'overlay'"
              id="alter-q-panel-overlay"
              class="alter-q-tab-panel alter-q-preferences-block alter-q-preferences-block--first"
              role="tabpanel"
              aria-labelledby="alter-q-tab-overlay"
              tabindex="0"
            >
              <div class="alter-q-overlay-grid">
                <section class="alter-q-section alter-q-overlay-preview-card">
                  <header class="alter-q-section-heading">
                    <div>
                      <span class="alter-q-section-icon"><v-icon icon="mdi-eye" size="18" /></span>
                      <div>
                        <h2>{{ t('apex.alterQ.overlayPreview') }}</h2>
                        <p>{{ t('apex.alterQ.overlaySectionHint') }}</p>
                      </div>
                    </div>
                  </header>
                  <div class="alter-q-overlay-preview-stage">
                    <div class="alter-q-overlay-preview" :style="overlayPreviewStyle">
                      <div class="alter-q-overlay-preview-meta">{{ overlayPreviewMeta }}</div>
                      <div>
                        <span>{{ t('apex.alterQ.recommendedLow') }}</span>
                        <strong>{{ theta ? theta.recommendedLow.toFixed(2) : '—' }}°</strong>
                      </div>
                      <div>
                        <span>{{ t('apex.alterQ.recommendedHigh') }}</span>
                        <strong>{{ theta ? theta.recommendedHigh.toFixed(2) : '—' }}°</strong>
                      </div>
                    </div>
                  </div>
                </section>

                <section class="alter-q-section">
                  <header class="alter-q-section-heading">
                    <div>
                      <span class="alter-q-section-icon"><v-icon icon="mdi-tune-variant" size="18" /></span>
                      <div>
                        <h2>{{ t('apex.alterQ.overlayDisplayTitle') }}</h2>
                        <p>{{ t('apex.alterQ.overlayOpacityHint') }}</p>
                      </div>
                    </div>
                  </header>
                  <div class="alter-q-overlay-lock-control">
                    <div>
                      <strong>{{ prefs.overlayLocked ? t('apex.alterQ.overlayLocked') : t('apex.alterQ.overlayAdjusting') }}</strong>
                      <span>{{ t('apex.alterQ.overlayLockHint') }}</span>
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
                  <div class="alter-q-range-control">
                    <div class="alter-q-range-label">
                      <span>{{ t('apex.alterQ.overlayHideSec', {sec: prefs.overlayHideSec}) }}</span>
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
                    <p>{{ t('apex.alterQ.overlayHideSecHint') }}</p>
                  </div>
                  <div class="alter-q-range-control">
                    <div class="alter-q-range-label">
                      <span>{{ t('apex.alterQ.overlayOpacity', {pct: Math.round(prefs.overlayOpacity * 100)}) }}</span>
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

              <section class="alter-q-section">
                <header class="alter-q-section-heading alter-q-section-heading--actions">
                  <div>
                    <span class="alter-q-section-icon"><v-icon icon="mdi-crop-free" size="18" /></span>
                    <div>
                      <h2>{{ t('apex.alterQ.overlayGeometry') }}</h2>
                      <p>{{ t('apex.alterQ.overlayGeometryHint') }}</p>
                    </div>
                  </div>
                  <div class="alter-q-inline-actions">
                <v-btn
                  size="small"
                  color="primary"
                  prepend-icon="mdi-crop-free"
                  @click="overlayPlaceOpen = true"
                >
                  {{ t('apex.alterQ.overlayPlaceOpen') }}
                </v-btn>
                <v-btn size="small" variant="tonal" @click="resetOverlayPosition">
                  {{ t('apex.alterQ.overlayResetPosition') }}
                </v-btn>
              </div>
                </header>
              </section>
            </div>
</template>
