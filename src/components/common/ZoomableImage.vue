<script setup lang="ts">
import { computed, onUnmounted, ref, useAttrs, watch } from 'vue';
import { useTheme } from 'vuetify';
import { useSettingsStore } from '@/stores/settings';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    lazySrc?: string;
    /** 是否允许点击打开预览并缩放 */
    previewable?: boolean;
  }>(),
  {
    alt: '',
    lazySrc: undefined,
    previewable: true,
  },
);

const attrs = useAttrs();

const passthroughAttrs = computed(() => {
  const { class: _cls, ...rest } = attrs as Record<string, unknown>;
  return rest;
});

const previewOpen = ref(false);
const scale = ref(1);
const pan = ref({ x: 0, y: 0 });
const theme = useTheme();
const settingsStore = useSettingsStore();
const RIGHT_CLICK_HINT_TAG = 'zoomable_image_right_click_close_hint';
const showRightClickHint = computed(
  () => !settingsStore.dismissedHintTags.includes(RIGHT_CLICK_HINT_TAG),
);

const drag = ref<{
  active: boolean;
  sx: number;
  sy: number;
  px: number;
  py: number;
} | null>(null);

const zoomPercent = computed({
  get: () => Math.round(scale.value * 100),
  set: (v: number) => {
    scale.value = Math.min(4, Math.max(0.25, v / 100));
  },
});

const isDarkTheme = computed(() => theme.global.current.value.dark);
const actionIconColor = computed(() => (isDarkTheme.value ? 'white' : 'black'));

const previewImageStyle = computed(() => ({
  transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${scale.value})`,
  transformOrigin: 'center center',
  cursor: drag.value?.active ? 'grabbing' : 'grab',
  maxWidth: '100%',
  maxHeight: 'min(78vh, 100%)',
  width: 'auto',
  height: 'auto',
  objectFit: 'contain' as const,
  userSelect: 'none' as const,
  pointerEvents: 'auto' as const,
}));

function zoomStep(delta: number) {
  scale.value = Math.min(4, Math.max(0.25, scale.value + delta));
}

function onWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  zoomStep(delta);
}

function resetView() {
  scale.value = 1;
  pan.value = { x: 0, y: 0 };
}

function onPanMove(e: MouseEvent) {
  if (!drag.value?.active) return;
  pan.value = {
    x: drag.value.px + (e.clientX - drag.value.sx),
    y: drag.value.py + (e.clientY - drag.value.sy),
  };
}

function onPanEnd() {
  if (drag.value?.active) {
    drag.value.active = false;
  }
  window.removeEventListener('mousemove', onPanMove);
  window.removeEventListener('mouseup', onPanEnd);
}

function onPanStart(e: MouseEvent) {
  if (!props.previewable || e.button !== 0) return;
  drag.value = {
    active: true,
    sx: e.clientX,
    sy: e.clientY,
    px: pan.value.x,
    py: pan.value.y,
  };
  window.addEventListener('mousemove', onPanMove);
  window.addEventListener('mouseup', onPanEnd);
}

function openPreview() {
  if (!props.previewable) return;
  previewOpen.value = true;
}

function onTriggerClickCapture(e: MouseEvent) {
  if (props.previewable && e.button === 0) {
    openPreview();
  }
}

function onThumbKeydown(e: KeyboardEvent) {
  if (!props.previewable) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openPreview();
  }
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    previewOpen.value = false;
  }
}

function closePreview() {
  previewOpen.value = false;
}

function dismissRightClickHint() {
  settingsStore.addDismissedHintTag(RIGHT_CLICK_HINT_TAG);
}

function onPreviewKeydown(_: KeyboardEvent) {
  // 预览打开后按任意键关闭(包含 ESC)
  closePreview();
}

function onPreviewMouseDown(e: MouseEvent) {
  // 除左键外均关闭：右键/中键等
  if (e.button !== 0) {
    e.preventDefault();
    closePreview();
  }
}

function onStageClick(e: MouseEvent) {
  if (e.target instanceof HTMLImageElement) return;
  closePreview();
}

watch(previewOpen, (open) => {
  if (open) {
    resetView();
    drag.value = null;
    window.addEventListener('keydown', onPreviewKeydown);
  } else {
    onPanEnd();
    window.removeEventListener('keydown', onPreviewKeydown);
  }
});

watch(
  () => props.previewable,
  (p) => {
    if (!p) previewOpen.value = false;
  },
);

onUnmounted(() => {
  onPanEnd();
  window.removeEventListener('keydown', onPreviewKeydown);
});
</script>

<template>
  <div
    class="zoomable-image-trigger"
    :class="{ 'zoomable-image-trigger--clickable': props.previewable }"
    :tabindex="props.previewable ? 0 : undefined"
    :role="props.previewable ? 'button' : undefined"
    :aria-label="props.previewable ? (props.alt || '查看大图') : props.alt"
    @click.capture="onTriggerClickCapture"
    @keydown="onThumbKeydown"
  >
    <v-img
      v-bind="passthroughAttrs"
      :src="props.src"
      :alt="props.alt"
      :lazy-src="props.lazySrc"
      :class="['zoomable-image-thumb', attrs.class]"
    >
      <template v-if="$slots.placeholder" #placeholder>
        <slot name="placeholder" />
      </template>
      <template v-else #placeholder>
        <div class="d-flex align-center justify-center fill-height">
          <v-progress-circular
            color="grey-lighten-4"
            indeterminate
          />
        </div>
      </template>
    </v-img>
  </div>

  <v-dialog
    v-if="props.previewable"
    v-model="previewOpen"
    fullscreen
    scrim="rgba(0,0,0,0.9)"
    content-class="zoomable-image-overlay"
  >
    <div
      class="zoomable-image-fullscreen"
      @click="onBackdropClick"
      @contextmenu.prevent="closePreview"
      @mousedown="onPreviewMouseDown"
    >
      <div
        class="zoomable-image-stage"
        @click="onStageClick"
        @wheel.prevent="onWheel"
        @mousedown="onPanStart"
      >
        <img
          :src="props.src"
          :alt="props.alt"
          :style="previewImageStyle"
          draggable="false"
        >
      </div>

      <div
        v-if="showRightClickHint"
        class="zoomable-image-right-click-hint"
        :class="{ 'zoomable-image-right-click-hint--dark': isDarkTheme, 'zoomable-image-right-click-hint--light': !isDarkTheme }"
        @click.stop="dismissRightClickHint"
      >
        右键关闭图片窗口
      </div>

      <div
        class="zoomable-image-controls"
        :class="{ 'zoomable-image-controls--dark': isDarkTheme, 'zoomable-image-controls--light': !isDarkTheme }"
        @click.stop
      >
        <span class="text-caption">{{ zoomPercent }}%</span>
        <v-btn icon="mdi-minus" variant="text" size="small" :color="actionIconColor" @click="zoomStep(-0.15)" />
        <v-slider
          v-model="zoomPercent"
          class="mx-2 zoomable-image-zoom-slider"
          :min="25"
          :max="400"
          :step="5"
          hide-details
          density="compact"
          :color="actionIconColor"
          :track-color="isDarkTheme ? 'grey-lighten-1' : 'grey-darken-2'"
        />
        <v-btn icon="mdi-plus" variant="text" size="small" :color="actionIconColor" @click="zoomStep(0.15)" />
        <v-btn
          icon="mdi-fit-to-page-outline"
          variant="text"
          size="small"
          title="重置视图"
          :color="actionIconColor"
          @click="resetView"
        />
        <v-btn icon="mdi-close" variant="text" size="small" :color="actionIconColor" @click="closePreview" />
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.zoomable-image-trigger {
  width: 100%;
}

.zoomable-image-trigger--clickable {
  cursor: zoom-in;
}

.zoomable-image-fullscreen {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.92);
}

.zoomable-image-stage {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}

.zoomable-image-controls {
  position: absolute;
  right: 16px;
  bottom: 16px;
  padding: 8px 10px;
  border-radius: 10px;
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  gap: 2px;
}

.zoomable-image-right-click-hint {
  position: absolute;
  left: 16px;
  bottom: 16px;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  user-select: none;
}

.zoomable-image-right-click-hint--dark {
  background: rgba(18, 18, 18, 0.58);
  color: #fff;
}

.zoomable-image-right-click-hint--light {
  background: rgba(255, 255, 255, 0.76);
  color: #000;
}

.zoomable-image-controls--dark {
  background: rgba(18, 18, 18, 0.58);
  color: #fff;
}

.zoomable-image-controls--light {
  background: rgba(255, 255, 255, 0.76);
  color: #000;
}

.zoomable-image-zoom-slider {
  width: 120px;
  max-width: 32vw;
}

:global(.zoomable-image-overlay) {
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
}
</style>
