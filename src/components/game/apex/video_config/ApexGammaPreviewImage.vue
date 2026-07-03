<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useAttrs, watch } from 'vue';
import { brightnessToPreviewExponent } from '@/utils/apex_gamma.ts';
import { GammaImagePreview } from '@/utils/image_gamma.ts';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  src: string;
  alt?: string;
  brightness?: number;
  maxWidth?: number;
}>(), {
  alt: '',
  brightness: 50,
  maxWidth: 1080,
});

const attrs = useAttrs();
const canvasHost = ref<HTMLElement | null>(null);
const ready = ref(false);

const processor = new GammaImagePreview();
let renderToken = 0;
let rafId = 0;
let pendingBrightness: number | null = null;
let mounted = false;

function mountCanvas() {
  const host = canvasHost.value;
  const canvas = processor.getCanvas();
  if (!host || canvas.parentElement === host) return;
  host.replaceChildren(canvas);
  canvas.className = ['apex-gamma-preview-canvas', attrs.class].filter(Boolean).join(' ');
  canvas.setAttribute('role', 'img');
  if (props.alt) canvas.setAttribute('aria-label', props.alt);
}

function applyFrame(brightness: number) {
  if (!ready.value) return;
  processor.applyExponent(brightnessToPreviewExponent(brightness));
}

function scheduleRender(brightness: number) {
  pendingBrightness = brightness;
  if (rafId) return;

  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (pendingBrightness == null) return;
    const value = pendingBrightness;
    pendingBrightness = null;
    applyFrame(value);
  });
}

async function ensureLoaded() {
  const key = `${props.src}@${props.maxWidth}`;
  if (processor.getLoadedKey() === key && processor.isLoaded()) {
    if (!ready.value) {
      ready.value = true;
      await nextTick();
      mountCanvas();
    }
    scheduleRender(props.brightness);
    return;
  }

  const token = ++renderToken;
  try {
    await processor.loadFromSrc(props.src, props.maxWidth);
    if (token !== renderToken) return;
    ready.value = true;
    await nextTick();
    mountCanvas();
    applyFrame(props.brightness);
  } catch {
    if (token === renderToken) {
      ready.value = false;
    }
  }
}

onMounted(() => {
  mounted = true;
  void ensureLoaded();
});

watch(
  () => props.src,
  () => {
    processor.dispose();
    ready.value = false;
    if (mounted) void ensureLoaded();
  },
);

watch(
  () => props.brightness,
  (brightness) => {
    if (ready.value) {
      scheduleRender(brightness);
    }
  },
);

onUnmounted(() => {
  mounted = false;
  if (rafId) cancelAnimationFrame(rafId);
  processor.dispose();
});
</script>

<template>
  <div class="apex-gamma-preview" :class="attrs.class">
    <div ref="canvasHost" class="apex-gamma-preview-host">
      <div
        v-if="!ready"
        class="apex-gamma-preview-loading d-flex align-center justify-center"
      >
        <v-progress-circular color="grey-lighten-4" indeterminate />
      </div>
    </div>
  </div>
</template>

<style scoped>
.apex-gamma-preview {
  width: 100%;
}

.apex-gamma-preview-host {
  position: relative;
  width: 100%;
  min-height: 120px;
}

.apex-gamma-preview-loading {
  width: 100%;
  min-height: 120px;
}

:deep(.apex-gamma-preview-canvas) {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
}
</style>
