<script setup lang="ts">
import {
  useApexQOverlayPlacementEditor,
  type ApexQOverlayPlacementEditorEmits,
  type ApexQOverlayPlacementEditorProps,
} from '@/composables/apex_q/useApexQOverlayPlacementEditor.ts';
import ApexQScreenshotPicker from './ApexQScreenshotPicker.vue';
import ApexQRoiStage from './ApexQRoiStage.vue';

const props = defineProps<ApexQOverlayPlacementEditorProps>();
const emit = defineEmits<ApexQOverlayPlacementEditorEmits>();
const {aspectMismatchText, bumpZoom, confirm, draft, imagePath, imgRef, imgStyle, loadLatest, loading, monitorItems, monitorLoading, onImageLoad, onMonitorChange, onPointerDown, onSelectRecent, onStagePointerDown, onWheel, openDialog, pickImage, previewAspectMismatch, previewSrc, recentThumbs, resetRect, roiStyle, screenH, screenW, selectedMonitorDisplayText, selectedMonitorIndex, setZoom, stageRef, t, zoomPercent} = useApexQOverlayPlacementEditor(props, emit);
</script>

<template>
  <v-dialog v-model="openDialog" fullscreen persistent scrim="black" class="place-dialog">
    <v-card class="place-card d-flex flex-column">
      <v-card-title class="place-header">
        <div class="place-header-icon">
          <v-icon icon="mdi-picture-in-picture-bottom-right" size="20" />
        </div>
        <div class="place-header-copy">
          <span class="place-header-kicker">{{ t('apex.apexQ.tabOverlay') }}</span>
          <span>{{ t('apex.apexQ.overlayPlaceTitle') }}</span>
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
      <v-card-text class="place-body flex-grow-1">
        <div class="place-intro">
          <p class="text-medium-emphasis">{{ t('apex.apexQ.overlayPlaceHint') }}</p>
          <div class="d-flex flex-wrap ga-2">
            <v-btn size="small" color="primary" :loading="loading" @click="loadLatest">
              {{ t('apex.apexQ.calibrateLoadLatest') }}
            </v-btn>
            <v-btn size="small" variant="tonal" @click="pickImage">
              {{ t('apex.apexQ.calibratePickImage') }}
            </v-btn>
          </div>
        </div>

        <div class="place-monitor-row mb-3">
          <v-select
            v-if="monitorItems.length"
            :model-value="selectedMonitorIndex"
            :items="monitorItems"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
            class="place-monitor-select"
            :label="t('apex.apexQ.overlayMonitor')"
            :title="selectedMonitorDisplayText"
            @update:model-value="onMonitorChange"
          >
            <template #item="{props: itemProps, item}">
              <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" />
            </template>
          </v-select>
          <div class="place-monitor-status text-caption text-medium-emphasis">
            <v-icon icon="mdi-monitor" size="16" />
            <span :title="selectedMonitorDisplayText">{{ selectedMonitorDisplayText }}</span>
          </div>
        </div>

        <div
          v-if="previewSrc && previewAspectMismatch"
          class="place-aspect-note mb-3"
          role="status"
          :title="aspectMismatchText"
        >
          <v-icon icon="mdi-alert-outline" size="16" />
          <span>
            {{ aspectMismatchText }}
          </span>
        </div>

        <ApexQScreenshotPicker
          :items="recentThumbs"
          :selected-path="imagePath"
          @select="onSelectRecent"
        />

        <div class="d-flex flex-wrap align-center ga-2 mb-2">
          <v-btn
            icon="mdi-minus"
            size="small"
            variant="text"
            :aria-label="t('apex.apexQ.calibrateZoomOut')"
            :title="t('apex.apexQ.calibrateZoomOut')"
            @click="bumpZoom(-0.25)"
          />
          <span class="text-caption">{{ zoomPercent }}%</span>
          <v-btn
            icon="mdi-plus"
            size="small"
            variant="text"
            :aria-label="t('apex.apexQ.calibrateZoomIn')"
            :title="t('apex.apexQ.calibrateZoomIn')"
            @click="bumpZoom(0.25)"
          />
          <v-btn size="small" variant="text" @click="setZoom(1)">{{ t('apex.apexQ.calibrateZoomReset') }}</v-btn>
        </div>

        <ApexQRoiStage
          class="place-stage"
          @ready="stageRef = $event"
          @pointerdown="onStagePointerDown"
          @wheel="onWheel"
        >
          <div v-if="loading" class="place-stage-empty">{{ t('apex.apexQ.calibrateLoading') }}</div>
          <div v-else-if="!previewSrc" class="place-stage-empty">{{ t('apex.apexQ.calibrateNoImage') }}</div>
          <template v-else>
            <img
              ref="imgRef"
              class="place-img"
              :src="previewSrc"
              :style="imgStyle"
              alt="screenshot"
              draggable="false"
              @load="onImageLoad"
            />
            <div class="place-roi" :style="roiStyle" @pointerdown="onPointerDown($event, 'move')">
              <div class="place-roi-label">{{ t('apex.apexQ.tabOverlay') }}</div>
              <i class="h nw" @pointerdown="onPointerDown($event, 'nw')" />
              <i class="h ne" @pointerdown="onPointerDown($event, 'ne')" />
              <i class="h sw" @pointerdown="onPointerDown($event, 'sw')" />
              <i class="h se" @pointerdown="onPointerDown($event, 'se')" />
              <i class="h n" @pointerdown="onPointerDown($event, 'n')" />
              <i class="h s" @pointerdown="onPointerDown($event, 's')" />
              <i class="h e" @pointerdown="onPointerDown($event, 'e')" />
              <i class="h w" @pointerdown="onPointerDown($event, 'w')" />
            </div>
          </template>
        </ApexQRoiStage>

        <div class="text-caption text-medium-emphasis mt-2">
          {{
            t('apex.apexQ.calibrateRoiValues', {
              x: draft.x.toFixed(3),
              y: draft.y.toFixed(3),
              w: draft.w.toFixed(3),
              h: draft.h.toFixed(3),
            })
          }}
          · {{ screenW }}×{{ screenH }}
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="place-actions">
        <v-btn variant="text" @click="resetRect">{{ t('apex.apexQ.overlayPlaceReset') }}</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="openDialog = false">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          :disabled="loading || monitorLoading || !previewSrc || previewAspectMismatch"
          :title="previewAspectMismatch ? aspectMismatchText : undefined"
          @click="confirm"
        >
          {{ t('apex.apexQ.overlayPlaceConfirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped src="./styles/ApexQOverlayPlaceDialog.css"></style>
