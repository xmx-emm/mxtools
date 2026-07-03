<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import modelDetailR99Img from '@/assets/images/apex/r99.jpg';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.modelDetail.name')"
    :subtitle="t('apexVideoConfig.modelDetail.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.modelDetail.description') }}</p>
    <ApexImage
      :src="modelDetailR99Img"
      :alt="t('apexVideoTips.modelDetail.imageAlt')"
    />
    <p class="text-caption text-medium-emphasis mt-2">
      {{ t('apexVideoTips.modelDetail.imageCaption') }}
    </p>
  </ApexTipCard>
</template>
