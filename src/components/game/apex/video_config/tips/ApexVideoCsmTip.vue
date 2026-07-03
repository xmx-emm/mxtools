<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import sunShadowsImg from '@/assets/images/apex/sun_shadows.jpg';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.csm.name')"
    :subtitle="t('apexVideoConfig.csm.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.csm.description') }}</p>
    <ApexImage
      :src="sunShadowsImg"
      :alt="t('apexVideoTips.csm.imageAlt')"
    />
    <p class="text-caption text-medium-emphasis mt-2">
      {{ t('apexVideoTips.csm.imageCaption') }}
    </p>
  </ApexTipCard>
</template>
