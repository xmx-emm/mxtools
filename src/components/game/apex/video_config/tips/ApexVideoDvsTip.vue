<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import ApexDvsFpsSlider from '@/components/game/apex/video_config/ApexDvsFpsSlider.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.dvs.name')"
    :subtitle="t('apexVideoConfig.dvs.description')"
  >
    <ApexDvsFpsSlider variant="full" />
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.dvs.description') }}</p>
    <p class="text-caption text-medium-emphasis">{{ t('apexVideoTips.dvs.tsaaHint') }}</p>
  </ApexTipCard>
</template>
