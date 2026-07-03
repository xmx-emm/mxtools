<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import ssaoImg from '@/assets/images/apex/ssao.jpg';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.ssaoQuality.name')"
    :subtitle="t('apexVideoConfig.ssaoQuality.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.ssaoQuality.description') }}</p>
    <ApexImage
      :src="ssaoImg"
      :alt="t('apexVideoTips.ssaoQuality.imageAlt')"
    />
    <p class="text-caption text-medium-emphasis mt-2">
      {{ t('apexVideoTips.ssaoQuality.imageCaption') }}
    </p>
  </ApexTipCard>
</template>
