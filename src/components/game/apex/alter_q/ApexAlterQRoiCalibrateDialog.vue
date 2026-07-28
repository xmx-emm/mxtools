<script setup lang="ts">
import {
  useAlterQRoiEditor,
  type AlterQRoiEditorEmits,
  type AlterQRoiEditorProps,
} from '@/composables/alter_q/useAlterQRoiEditor.ts';
import ApexAlterQScreenshotPicker from './ApexAlterQScreenshotPicker.vue';
import ApexAlterQRoiStage from './ApexAlterQRoiStage.vue';

const props = defineProps<AlterQRoiEditorProps>();
const emit = defineEmits<AlterQRoiEditorEmits>();
const {MAX_ZOOM, MIN_ZOOM, activeRoi, allRegionsVerified, bumpZoom, confirm, focusActiveKind, imagePath, imgBox, imgRef, kind, loadLatest, loading, loupeDragging, loupeImgStyle, loupeShellStyle, loupeViewStyle, onLoupePointerDown, onPointerDown, onPointerMove, onPointerUp, onSelectRecent, onStagePointerDown, onWheel, openDialog, panDrag, pickImage, previewSrc, recentThumbs, resetActive, resetZoomToKindDefault, runOcrVerify, stageRef, t, updateImgBox, verifiedKinds, verifyFresh, verifyKind, verifyPassed, verifyResult, verifyStale, verifying, zoom, zoomPercent} = useAlterQRoiEditor(props, emit);
</script>

<template>
  <v-dialog v-model="openDialog" max-width="960" persistent>
    <v-card class="calibrate-card">
      <v-card-title class="calibrate-header">
        <div class="calibrate-header-icon">
          <v-icon icon="mdi-crop-free" size="20" />
        </div>
        <div class="calibrate-header-copy">
          <span class="calibrate-header-kicker">{{ t('apex.alterQ.tabOcr') }}</span>
          <span>{{ t('apex.alterQ.calibrateTitle') }}</span>
        </div>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          density="compact"
          :aria-label="t('common.close')"
          :title="t('common.close')"
          @click="openDialog = false"
        />
      </v-card-title>
      <v-divider />
      <v-card-text class="calibrate-body">
        <div class="calibrate-intro">
          <p class="text-medium-emphasis">{{ t('apex.alterQ.calibrateHint') }}</p>
          <div class="d-flex flex-wrap ga-2">
            <v-btn size="small" color="primary" :loading="loading" @click="loadLatest">
              {{ t('apex.alterQ.calibrateLoadLatest') }}
            </v-btn>
            <v-btn size="small" variant="tonal" @click="pickImage">
              {{ t('apex.alterQ.calibratePickImage') }}
            </v-btn>
          </div>
        </div>
        <ApexAlterQScreenshotPicker
          :items="recentThumbs"
          :selected-path="imagePath"
          @select="onSelectRecent"
        />

        <div class="d-flex flex-wrap align-center ga-2 mb-3">
          <v-btn-toggle v-model="kind" density="compact" divided mandatory color="primary">
            <v-btn value="showpos" size="small">{{ t('apex.alterQ.calibrateShowpos') }}</v-btn>
            <v-btn value="ping" size="small">{{ t('apex.alterQ.calibratePing') }}</v-btn>
          </v-btn-toggle>
          <v-btn
            size="small"
            color="primary"
            :loading="verifying"
            :disabled="!previewSrc || loading"
            @click="runOcrVerify"
          >
            {{ t('apex.alterQ.calibrateTryOcr') }}
          </v-btn>
          <v-spacer />
          <v-chip
            size="x-small"
            :color="verifiedKinds.showpos ? 'success' : undefined"
            :prepend-icon="verifiedKinds.showpos ? 'mdi-check-circle' : 'mdi-circle-outline'"
          >
            {{ t('apex.alterQ.calibrateShowpos') }}
          </v-chip>
          <v-chip
            size="x-small"
            :color="verifiedKinds.ping ? 'success' : undefined"
            :prepend-icon="verifiedKinds.ping ? 'mdi-check-circle' : 'mdi-circle-outline'"
          >
            {{ t('apex.alterQ.calibratePing') }}
          </v-chip>
          <div class="calibrate-zoom">
            <v-btn
              icon="mdi-minus"
              size="x-small"
              variant="tonal"
              :disabled="zoom <= MIN_ZOOM"
              :aria-label="t('apex.alterQ.calibrateZoomOut')"
              :title="t('apex.alterQ.calibrateZoomOut')"
              @click="bumpZoom(-0.25)"
            />
            <span class="calibrate-zoom-label">{{ zoomPercent }}%</span>
            <v-btn
              icon="mdi-plus"
              size="x-small"
              variant="tonal"
              :disabled="zoom >= MAX_ZOOM"
              :aria-label="t('apex.alterQ.calibrateZoomIn')"
              :title="t('apex.alterQ.calibrateZoomIn')"
              @click="bumpZoom(0.25)"
            />
            <v-btn size="x-small" variant="text" @click="resetZoomToKindDefault">
              {{ t('apex.alterQ.calibrateZoomReset') }}
            </v-btn>
          </div>
        </div>

        <ApexAlterQRoiStage
          class="calibrate-stage"
          :class="{ 'calibrate-stage--panning': !!panDrag }"
          @ready="stageRef = $event"
          @pointerdown="onStagePointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel="onWheel"
        >
          <div v-if="loading && !previewSrc" class="calibrate-empty">
            <v-progress-circular indeterminate size="36" width="3" color="primary" class="mb-3" />
            <div>{{ t('apex.alterQ.calibrateLoading') }}</div>
          </div>
          <div v-else-if="!previewSrc" class="calibrate-empty">
            {{ t('apex.alterQ.calibrateNoImage') }}
          </div>
          <template v-else>
            <img
              ref="imgRef"
              class="calibrate-img"
              :src="previewSrc"
              alt="screenshot"
              draggable="false"
              :style="{
                left: `${imgBox.left}px`,
                top: `${imgBox.top}px`,
                width: `${imgBox.width}px`,
                height: `${imgBox.height}px`,
              }"
              @load="() => { updateImgBox(); focusActiveKind(); }"
            />
            <div
              class="calibrate-roi"
              :style="{
                left: `${imgBox.left + activeRoi.x * imgBox.width}px`,
                top: `${imgBox.top + activeRoi.y * imgBox.height}px`,
                width: `${activeRoi.w * imgBox.width}px`,
                height: `${activeRoi.h * imgBox.height}px`,
              }"
              @pointerdown="onPointerDown($event, 'move')"
            >
              <i class="h nw" @pointerdown="onPointerDown($event, 'nw')" />
              <i class="h ne" @pointerdown="onPointerDown($event, 'ne')" />
              <i class="h sw" @pointerdown="onPointerDown($event, 'sw')" />
              <i class="h se" @pointerdown="onPointerDown($event, 'se')" />
              <i class="h n" @pointerdown="onPointerDown($event, 'n')" />
              <i class="h s" @pointerdown="onPointerDown($event, 's')" />
              <i class="h e" @pointerdown="onPointerDown($event, 'e')" />
              <i class="h w" @pointerdown="onPointerDown($event, 'w')" />
            </div>
            <div
              class="calibrate-loupe"
              :class="{ 'calibrate-loupe--dragging': loupeDragging }"
              :style="loupeShellStyle"
              @pointerdown="onLoupePointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
            >
              <div class="calibrate-loupe-label">{{ t('apex.alterQ.calibrateLoupe') }}</div>
              <div class="calibrate-loupe-view" :style="loupeViewStyle">
                <img class="calibrate-loupe-img" :src="previewSrc" alt="" draggable="false" :style="loupeImgStyle" />
              </div>
            </div>
          </template>
        </ApexAlterQRoiStage>

        <div class="calibrate-verify mt-2">
          <div
            v-if="verifyFresh && verifyResult"
            class="calibrate-verify-panel text-caption mb-2"
            :class="verifyPassed ? 'calibrate-verify-panel--ok' : 'calibrate-verify-panel--warn'"
          >
            <div class="d-flex flex-wrap align-center ga-2 mb-1">
              <strong>
                {{
                  verifyPassed
                    ? t('apex.alterQ.calibrateVerifyOkShort')
                    : kind === 'showpos'
                      ? t('apex.alterQ.calibrateVerifyPartialShowpos')
                      : t('apex.alterQ.calibrateVerifyPartialPing')
                }}
              </strong>
            </div>
            <div v-if="kind === 'showpos'">
              <div class="text-caption text-medium-emphasis mb-1">{{ t('apex.alterQ.angSplitHint') }}</div>
              <div class="d-flex flex-wrap ga-3 mb-1">
                <span>{{ t('apex.alterQ.angPitch') }}:
                  <strong>{{ verifyResult.alpha != null ? `${verifyResult.alpha.toFixed(2)}°` : '—' }}</strong>
                </span>
                <span>{{ t('apex.alterQ.angYaw') }}:
                  <strong>{{ verifyResult.angYaw != null ? verifyResult.angYaw.toFixed(2) : '—' }}</strong>
                </span>
                <span>{{ t('apex.alterQ.angRoll') }}:
                  <strong>{{ verifyResult.angRoll != null ? verifyResult.angRoll.toFixed(2) : '—' }}</strong>
                </span>
              </div>
              <img
                v-if="verifyResult.showposPreview"
                class="calibrate-verify-crop"
                :src="verifyResult.showposPreview"
                alt="showpos"
              />
              <span class="text-medium-emphasis ml-2">「{{ verifyResult.showposText || '—' }}」</span>
            </div>
            <div v-else>
              {{ t('apex.alterQ.calibrateVerifyDistance') }}:
              <strong>{{ verifyResult.distanceM != null ? `${verifyResult.distanceM.toFixed(1)} m` : '—' }}</strong>
              <img
                v-if="verifyResult.pingPreview"
                class="calibrate-verify-crop"
                :src="verifyResult.pingPreview"
                alt="ping"
              />
              <span class="text-medium-emphasis ml-2">「{{ verifyResult.pingText || '—' }}」</span>
            </div>
          </div>
          <div
            v-else-if="verifyStale && verifyResult && verifyKind === kind"
            class="text-caption text-medium-emphasis mb-2"
          >
            {{ t('apex.alterQ.calibrateVerifyStale') }}
          </div>
          <div class="text-caption">
            {{ t('apex.alterQ.calibrateRoiValues', {
              x: activeRoi.x.toFixed(3),
              y: activeRoi.y.toFixed(3),
              w: activeRoi.w.toFixed(3),
              h: activeRoi.h.toFixed(3),
            }) }}
          </div>
          <div v-if="!allRegionsVerified" class="text-caption text-medium-emphasis mt-1">
            {{ t('apex.alterQ.calibrateVerifyRequired') }}
          </div>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="calibrate-actions">
        <v-btn variant="text" @click="resetActive">{{ t('apex.alterQ.calibrateReset') }}</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="openDialog = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" :disabled="loading || verifying || !previewSrc || !allRegionsVerified" @click="confirm">
          {{ t('apex.alterQ.calibrateConfirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped src="./styles/ApexAlterQRoiCalibrateDialog.css"></style>
