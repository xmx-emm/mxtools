<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import spotShadowDetailImg from '@/assets/images/apex/spot_shadow_detail.jpg';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.shadowDetail.name')"
    :subtitle="t('apexVideoConfig.shadowDetail.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.shadowDetail.description') }}</p>
    <ApexImage
      :src="spotShadowDetailImg"
      :alt="t('apexVideoTips.shadowDetail.imageAlt')"
    />
    <p class="text-caption text-medium-emphasis mt-2">
      {{ t('apexVideoTips.shadowDetail.imageCaption') }}
    </p>
  </ApexTipCard>
</template>
