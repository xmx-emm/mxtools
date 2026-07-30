<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {computed} from 'vue';
import {routeFullPath} from '@/utils/router.ts';
import {useRoute} from 'vue-router';
import ToolCategoryHome from '@/components/navigation/ToolCategoryHome.vue';
import ApexLegendsIcon from '@/components/icons/ApexLegendsIcon.vue';
import PUBGIcon from '@/components/icons/PUBGIcon.vue';
import {useSettingsStore} from '@/stores/settings.ts';

const { t } = useI18n();
const route = useRoute();
const settingsStore = useSettingsStore();
const isGame = computed(() => routeFullPath(route) === '/tools/game');

const gameItems = computed(() => ([
  {
    path: '/game_optimizer',
    title: t('game.optimizerTitle'),
    description: t('game.optimizerDescription'),
    action: t('game.openTool'),
    badge: t('common.beta'),
    icon: 'mdi-speedometer',
    features: [
      t('game.optimizerFeatureScan'),
      t('game.optimizerFeatureFix'),
      t('game.optimizerFeatureNetwork'),
    ],
  },
  {
    path: '/apex',
    title: t('game.apexTitle'),
    description: t('game.apexDescription'),
    action: t('game.openTool'),
    badge: t('game.fullSupport'),
    iconComponent: ApexLegendsIcon,
    features: [
      t('game.featureLaunch'),
      t('game.featureVideo'),
      ...(settingsStore.betaFeaturesEnabled ? [t('game.featureApexQ')] : []),
    ],
  },
  {
    path: '/pubg',
    title: t('game.pubgTitle'),
    description: t('game.pubgDescription'),
    action: t('game.openTool'),
    badge: t('game.coreSupport'),
    iconComponent: PUBGIcon,
    features: [t('game.featureLaunch'), t('game.featurePerformance'), t('game.featurePreset')],
  },
]).filter(item => item.path !== '/game_optimizer' || settingsStore.betaFeaturesEnabled));

const gameGuides = computed(() => [
  {title: t('game.guideAccount'), description: t('game.guideAccountDesc'), icon: 'mdi-account-check'},
  {title: t('game.guidePreview'), description: t('game.guidePreviewDesc'), icon: 'mdi-eye'},
  {title: t('game.guideApply'), description: t('game.guideApplyDesc'), icon: 'mdi-check-circle'},
]);
</script>

<template>
  <ToolCategoryHome
    v-if="isGame"
    :eyebrow="t('game.eyebrow')"
    :title="t('game.home')"
    :subtitle="t('game.subtitle')"
    :summary="t('game.summary', {count: gameItems.length})"
    summary-icon="mdi-gamepad-variant-outline"
    :section-title="t('game.sectionTitle')"
    :section-subtitle="t('game.sectionSubtitle')"
    :guide-title="t('game.guideTitle')"
    :guide-subtitle="t('game.guideSubtitle')"
    :items="gameItems"
    :guides="gameGuides"
  />
  <div v-else class="page-host page-host--fill">
    <router-view/>
  </div>
</template>
