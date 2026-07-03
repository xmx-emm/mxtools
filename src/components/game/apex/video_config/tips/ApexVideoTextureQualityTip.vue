<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import textureQualityImg from '@/assets/images/apex/texture_quality.jpg';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoTips.textureQuality.title')"
    :subtitle="t('apexVideoConfig.textureQuality.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.textureQuality.description') }}</p>
    <ApexImage
      :src="textureQualityImg"
      :alt="t('apexVideoTips.textureQuality.comparisonAlt')"
    />
    <p class="text-caption text-medium-emphasis mt-2">
      {{ t('apexVideoTips.textureQuality.comparisonCaption') }}
    </p>
  </ApexTipCard>
</template>
