<script setup lang="ts">
import {ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import mapDetailComparison1Img from '@/assets/images/apex/map_detail_comparison_1.jpg';
import mapDetailComparison2Img from '@/assets/images/apex/map_detail_comparison_2.jpg';
import mapDetailComparison3Img from '@/assets/images/apex/map_detail_comparison_3.jpg';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();

const previewItems = [
  {
    labelKey: 'apexVideoTips.mapDetailLevel.previewLabels.wallAndDecals',
    src: mapDetailComparison1Img,
    altKey: 'apexVideoTips.mapDetailLevel.wallAndDecals.imageAlt',
    captionKey: 'apexVideoTips.mapDetailLevel.wallAndDecals.imageCaption',
  },
  {
    labelKey: 'apexVideoTips.mapDetailLevel.previewLabels.pipesAndGround',
    src: mapDetailComparison2Img,
    altKey: 'apexVideoTips.mapDetailLevel.pipesAndGround.imageAlt',
    captionKey: 'apexVideoTips.mapDetailLevel.pipesAndGround.imageCaption',
  },
  {
    labelKey: 'apexVideoTips.mapDetailLevel.previewLabels.lightAndVent',
    src: mapDetailComparison3Img,
    altKey: 'apexVideoTips.mapDetailLevel.lightAndVent.imageAlt',
    captionKey: 'apexVideoTips.mapDetailLevel.lightAndVent.imageCaption',
  },
] as const;

const activeIndex = ref(0);
const scrollRoot = ref<HTMLElement | null>(null);

let ignoreScrollSpyUntil = 0;
let syncFromScroll = false;

function resolveVisibleIndex(): number {
  const root = scrollRoot.value;
  if (!root) return 0;
  const sections = root.querySelectorAll<HTMLElement>('.preview-section');
  if (!sections.length) return 0;
  const rootRect = root.getBoundingClientRect();
  let bestIdx = 0;
  let bestVisible = -1;
  sections.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const visTop = Math.max(r.top, rootRect.top);
    const visBottom = Math.min(r.bottom, rootRect.bottom);
    const visible = Math.max(0, visBottom - visTop);
    if (visible > bestVisible) {
      bestVisible = visible;
      bestIdx = i;
    }
  });
  return bestIdx;
}

function scrollToSection(i: number) {
  const root = scrollRoot.value;
  if (!root) return;
  const sections = root.querySelectorAll<HTMLElement>('.preview-section');
  const el = sections[i];
  if (!el) return;
  ignoreScrollSpyUntil = performance.now() + 500;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function onScrollSpy() {
  if (performance.now() < ignoreScrollSpyUntil) return;
  const idx = resolveVisibleIndex();
  if (idx !== activeIndex.value) {
    syncFromScroll = true;
    activeIndex.value = idx;
  }
}

watch(activeIndex, () => {
  if (syncFromScroll) {
    syncFromScroll = false;
    return;
  }
  scrollToSection(activeIndex.value);
});
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.mapDetailLevel.name')"
    :subtitle="t('apexVideoConfig.mapDetailLevel.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.mapDetailLevel.description') }}</p>
    <div class="map-detail-tip-body">
      <div class="preview-toolbar bg-surface">
        <v-btn-toggle
          v-model="activeIndex"
          class="preview-type-toggle"
          mandatory
          density="compact"
          variant="tonal"
          color="surface-variant"
          style="height: 25px;"
          divided
        >
          <v-btn
            v-for="(item, i) in previewItems"
            :key="i"
            :value="i"
            size="x-small"
          >
            {{ t(item.labelKey) }}
          </v-btn>
        </v-btn-toggle>
      </div>

      <div
        ref="scrollRoot"
        class="preview-scroll"
        @scroll.passive="onScrollSpy"
      >
        <div
          v-for="(item, i) in previewItems"
          :key="i"
          class="preview-section"
        >
          <div class="preview-frame">
            <ApexImage :src="item.src" :alt="t(item.altKey)" />
          </div>
          <p class="preview-caption text-caption text-medium-emphasis">
            {{ t(item.captionKey) }}
          </p>
        </div>
      </div>
    </div>
  </ApexTipCard>
</template>

<style scoped>
.map-detail-tip-body {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 280px);
  min-height: 240px;
  max-height: 72dvh;
}

.preview-toolbar {
  flex: 0 0 auto;
  padding: 8px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  z-index: 1;
  overflow-x: auto;
}

.preview-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 0;
  -webkit-overflow-scrolling: touch;
}

.preview-section + .preview-section {
  margin-top: 20px;
}

.preview-type-toggle {
  flex-wrap: nowrap;
  max-width: 100%;
}

.preview-type-toggle :deep(.v-btn) {
  flex: 0 0 auto;
  padding-inline: 8px !important;
  font-size: 0.6875rem !important;
  letter-spacing: 0.01em;
}

.preview-type-toggle :deep(.v-btn__content) {
  padding-inline: 2px;
}

.preview-frame {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  overflow: hidden;
}

.preview-frame :deep(.v-img) {
  max-width: 100%;
}

.preview-caption {
  margin-top: 6px;
  margin-bottom: 0;
}
</style>
