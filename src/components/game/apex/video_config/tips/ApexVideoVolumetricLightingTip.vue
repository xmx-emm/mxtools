<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import volumetricLightingImg from '@/assets/images/apex/volumetric_lighting.jpg';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.volumetricLighting.name')"
    :subtitle="t('apexVideoConfig.volumetricLighting.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.volumetricLighting.description') }}</p>
    <ApexImage
      :src="volumetricLightingImg"
      :alt="t('apexVideoTips.volumetricLighting.imageAlt')"
    />
    <p class="text-caption text-medium-emphasis mt-2">
      {{ t('apexVideoTips.volumetricLighting.imageCaption') }}
    </p>
  </ApexTipCard>
</template>
