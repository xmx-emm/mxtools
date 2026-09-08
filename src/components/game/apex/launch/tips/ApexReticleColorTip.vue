<script setup lang="ts">
import {ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import aimImg from '@/assets/images/apex/crosshair/aim.jpg';
import lightRoundsImg from '@/assets/images/apex/crosshair/light_rounds.jpg';
import heavyRoundsImg from '@/assets/images/apex/crosshair/heavy_rounds.jpg';
import energyAmmoImg from '@/assets/images/apex/crosshair/energy_ammo.jpg';
import shotgunImg from '@/assets/images/apex/crosshair/shotgun.jpg';
import sniperRifleImg from '@/assets/images/apex/crosshair/sniper_rifle.jpg';
import lootBinWeaponImg from '@/assets/images/apex/crosshair/loot_bin_weapon.jpg';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import {openUrl} from '@tauri-apps/plugin-opener';
import {
  MICROSOFT_STORE_MURBONG_CROSSHAIR_URL,
  MICROSOFT_STORE_MYCROSSHAIR_URL,
  STEAM_CROSSHAIR_V2_URL
} from '@/data/url_other.ts';

const { t } = useI18n();

// Reserve the bundled images' dimensions before lazy loading so anchors stay put.
const aimPreviewItems = [
  { labelKey: 'apexTips.reticleColor.previewLabels.aim', src: aimImg, aspectRatio: 1080 / 1455 },
  { labelKey: 'apexTips.reticleColor.previewLabels.lightRounds', src: lightRoundsImg, aspectRatio: 1080 / 1319 },
  { labelKey: 'apexTips.reticleColor.previewLabels.heavyRounds', src: heavyRoundsImg, aspectRatio: 1080 / 1068 },
  { labelKey: 'apexTips.reticleColor.previewLabels.energyAmmo', src: energyAmmoImg, aspectRatio: 1080 / 1867 },
  { labelKey: 'apexTips.reticleColor.previewLabels.shotgun', src: shotgunImg, aspectRatio: 1080 / 998 },
  { labelKey: 'apexTips.reticleColor.previewLabels.sniper', src: sniperRifleImg, aspectRatio: 1080 / 1582 },
  { labelKey: 'apexTips.reticleColor.previewLabels.carePackageWeapon', src: lootBinWeaponImg, aspectRatio: 1080 / 748 },
] as const;

const activeIndex = ref(0);
const scrollRoot = ref<HTMLElement | null>(null);

/** 程序化滚动期间不根据 scroll 反写 activeIndex,避免与 smooth 动画打架 */
let ignoreScrollSpyUntil = 0;

/** 由滚动侦测更新的索引：不再触发 scrollToSection,避免循环 */
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
  <ApexTipCard :title="t('apexTips.reticleColor.title')" :subtitle="t('apexTips.reticleColor.subtitle')">
    <template #text>
      <p class="text-body-2 text-medium-emphasis">
        {{ t('apexTips.reticleColor.line1') }}<br/>
        {{ t('apexTips.reticleColor.line2') }}
      </p>
      <div class="game-tip-actions mt-3">
        <v-btn size="small"
               :title="t('apexTips.reticleColor.gameBarTips')"
               @click="openUrl(MICROSOFT_STORE_MURBONG_CROSSHAIR_URL)"
               prepend-icon="mdi-microsoft-xbox">Murbong Crosshair</v-btn>
        <v-btn size="small"
               :title="t('apexTips.reticleColor.gameBarTips')"
               @click="openUrl(MICROSOFT_STORE_MYCROSSHAIR_URL)"
               prepend-icon="mdi-microsoft-xbox">My Crosshair</v-btn>
        <v-btn
          size="small"
          :title="t('apexTips.reticleColor.steamTips')"
          @click="openUrl(STEAM_CROSSHAIR_V2_URL)"
          prepend-icon="mdi-steam" text="Crosshair V2"></v-btn>
      </div>
    </template>
    <div class="reticle-tip-body">
      <div class="preview-toolbar bg-surface">
        <v-btn-toggle
          v-model="activeIndex"
          class="preview-type-toggle game-page-segmented-toggle"
          mandatory
          density="compact"
          variant="text"
          color="primary"
          border
          divided
        >
          <v-btn
            v-for="(item, i) in aimPreviewItems"
            :key="i"
            :value="i"
            size="small"
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
          v-for="(item, i) in aimPreviewItems"
          :key="i"
          class="preview-section"
        >
          <div class="preview-frame">
            <ApexImage :src="item.src" :alt="t(item.labelKey)" :aspect-ratio="item.aspectRatio" />
          </div>
          <p class="preview-caption text-caption text-medium-emphasis">
            {{ t(item.labelKey) }}
          </p>
        </div>
      </div>
    </div>
  </ApexTipCard>
</template>

<style scoped>
.reticle-tip-body {
  display: flex;
  flex-direction: column;
  height: min(480px, 50dvh);
  min-height: 0;
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
  max-width: none;
}

.preview-type-toggle :deep(.v-btn) {
  flex: 0 0 auto;
  padding-inline: 8px !important;
  font-size: 0.6875rem !important;
  letter-spacing: 0;
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
