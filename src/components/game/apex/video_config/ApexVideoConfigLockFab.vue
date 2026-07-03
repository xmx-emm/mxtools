<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, reactive, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import apexStore from '@/stores/game/apex.ts';
import ApexVideoConfigFabTooltip from '@/components/game/apex/video_config/ApexVideoConfigFabTooltip.vue';

const {t} = useI18n();
const toast = useToast();
const apex_store = apexStore();

const FAB_SIZE = 32;
const GAP = 4;
const MARGIN = 12;
const GROUP_W = FAB_SIZE;
const GROUP_H = FAB_SIZE * 2 + GAP;
const STORAGE_KEY = 'apex_video_fab_pos';

const root = ref<HTMLElement | null>(null);
const pos = reactive({x: 0, y: 0});
const snapping = ref(false);
const dragging = ref(false);

// 持久化：贴靠边(left/right)+ 纵向比例，适应窗口/导航尺寸变化
const persisted = reactive<{ side: 'left' | 'right'; topRatio: number }>({
  side: 'right',
  topRatio: 0.7,
});

let pointer_start = {x: 0, y: 0};
let pos_start = {x: 0, y: 0};
let moved = false;
let active_pointer_id: number | null = null;
let pending_action: 'individual' | 'lock' | null = null;

function containerRect(): {left: number; top: number; right: number; bottom: number} {
  const el = root.value?.parentElement;
  if (el) {
    const r = el.getBoundingClientRect();
    return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
  }
  return {left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight};
}

function clampPos() {
  const r = containerRect();
  const minX = r.left + MARGIN;
  const maxX = r.right - GROUP_W - MARGIN;
  const minY = r.top + MARGIN;
  const maxY = r.bottom - GROUP_H - MARGIN;
  pos.x = Math.min(Math.max(minX, pos.x), Math.max(minX, maxX));
  pos.y = Math.min(Math.max(minY, pos.y), Math.max(minY, maxY));
}

function applyPersisted() {
  const r = containerRect();
  pos.x = persisted.side === 'left' ? r.left + MARGIN : r.right - GROUP_W - MARGIN;
  const availH = Math.max(0, (r.bottom - r.top) - GROUP_H - MARGIN * 2);
  pos.y = r.top + MARGIN + availH * persisted.topRatio;
  clampPos();
}

function savePersisted() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch (e) {
    console.warn('save fab pos failed', e);
  }
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && (data.side === 'left' || data.side === 'right') && typeof data.topRatio === 'number') {
      persisted.side = data.side;
      persisted.topRatio = Math.min(Math.max(0, data.topRatio), 1);
    }
  } catch (e) {
    console.warn('load fab pos failed', e);
  }
}

function snapToEdge() {
  const r = containerRect();
  const center = pos.x + GROUP_W / 2;
  const mid = (r.left + r.right) / 2;
  snapping.value = true;
  persisted.side = center < mid ? 'left' : 'right';
  const availH = Math.max(1, (r.bottom - r.top) - GROUP_H - MARGIN * 2);
  persisted.topRatio = Math.min(Math.max(0, (pos.y - r.top - MARGIN) / availH), 1);
  applyPersisted();
  savePersisted();
  window.setTimeout(() => (snapping.value = false), 220);
}

function actionFromTarget(target: EventTarget | null): 'individual' | 'lock' | null {
  const el = (target as HTMLElement | null)?.closest?.('[data-fab-action]');
  const action = el?.getAttribute('data-fab-action');
  return action === 'individual' || action === 'lock' ? action : null;
}

function onPointerDown(e: PointerEvent) {
  active_pointer_id = e.pointerId;
  dragging.value = true;
  moved = false;
  snapping.value = false;
  pending_action = actionFromTarget(e.target);
  pointer_start = {x: e.clientX, y: e.clientY};
  pos_start = {x: pos.x, y: pos.y};
  root.value?.setPointerCapture?.(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== active_pointer_id) return;
  const dx = e.clientX - pointer_start.x;
  const dy = e.clientY - pointer_start.y;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
  pos.x = pos_start.x + dx;
  pos.y = pos_start.y + dy;
  clampPos();
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== active_pointer_id) return;
  dragging.value = false;
  active_pointer_id = null;
  if (moved) {
    snapToEdge();
  } else if (pending_action === 'individual') {
    apex_store.video_individual_input = !apex_store.video_individual_input;
  } else if (pending_action === 'lock') {
    void toggleLock();
  }
  pending_action = null;
}

async function toggleLock() {
  if (apex_store.is_videoconfig_readonly_busy) return;
  const next = !apex_store.is_videoconfig_readonly;
  if (!next && apex_store.has_out_of_preset_selection) {
    toast.warning(t('apex.outOfPresetUnlockWarning'));
  }
  await apex_store.set_videoconfig_readonly(next);
}

function onResize() {
  applyPersisted();
}

const lockColor = computed(() => {
  if (apex_store.is_videoconfig_readonly) {
    return 'success';
  }
  return apex_store.has_out_of_preset_selection ? 'warning' : 'grey-darken-1';
});

const lockIcon = computed(() =>
  apex_store.is_videoconfig_readonly ? 'mdi-lock' : 'mdi-lock-open-variant',
);

const lockTooltip = computed(() => {
  if (apex_store.is_videoconfig_readonly) return t('apex.unlockConfig');
  if (apex_store.has_out_of_preset_selection) return t('apex.outOfPresetBadge');
  return t('apex.lockConfig');
});

const individualIcon = computed(() =>
  apex_store.video_individual_input ? 'mdi-list-status' : 'mdi-format-list-bulleted-square',
);

const individualColor = computed(() =>
  apex_store.video_individual_input ? 'primary' : 'grey-darken-1',
);

onMounted(() => {
  loadPersisted();
  applyPersisted();
  void apex_store.load_videoconfig_readonly();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <div
    ref="root"
    class="apex-lock-fab"
    :class="{ 'is-snapping': snapping, 'is-dragging': dragging }"
    :style="{ left: pos.x + 'px', top: pos.y + 'px', width: GROUP_W + 'px' }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <ApexVideoConfigFabTooltip kind="individual" :disabled="dragging" :side="persisted.side">
      <div
        class="apex-fab-slot"
        data-fab-action="individual"
        :style="{ width: FAB_SIZE + 'px', height: FAB_SIZE + 'px' }"
      >
        <v-btn
          :icon="individualIcon"
          :color="individualColor"
          size="x-small"
          elevation="4"
          :aria-label="t('apex.individualInput')"
          class="apex-fab-btn"
          @click.stop.prevent=""
        />
      </div>
    </ApexVideoConfigFabTooltip>
    <ApexVideoConfigFabTooltip kind="lock" :disabled="dragging" :side="persisted.side">
      <div
        class="apex-fab-slot"
        data-fab-action="lock"
        :style="{ width: FAB_SIZE + 'px', height: FAB_SIZE + 'px', marginTop: GAP + 'px' }"
      >
        <v-btn
          :icon="lockIcon"
          :color="lockColor"
          :loading="apex_store.is_videoconfig_readonly_busy"
          size="x-small"
          elevation="4"
          :aria-label="lockTooltip"
          class="apex-fab-btn"
          @click.stop.prevent=""
        />
        <span v-if="apex_store.is_videoconfig_readonly" class="apex-lock-fab-dot"/>
      </div>
    </ApexVideoConfigFabTooltip>
  </div>
</template>

<style scoped>
.apex-lock-fab {
  position: fixed;
  z-index: 2000;
  touch-action: none;
  cursor: grab;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.apex-lock-fab.is-dragging {
  cursor: grabbing;
}

.apex-lock-fab.is-snapping {
  transition: left 0.2s ease, top 0.2s ease;
}

.apex-fab-slot {
  position: relative;
}

.apex-fab-btn {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  pointer-events: none;
}

:deep(.apex-fab-btn .v-icon) {
  font-size: 18px;
}

.apex-lock-fab-dot {
  position: absolute;
  top: 0;
  right: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
  border: 1.5px solid rgb(var(--v-theme-surface));
}
</style>
