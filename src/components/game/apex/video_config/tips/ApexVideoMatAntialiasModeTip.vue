<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import antialiasImg from '@/assets/images/apex/anti_aliasing.jpg';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.matAntialiasMode.name')"
    :subtitle="t('apexVideoConfig.matAntialiasMode.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.matAntialiasMode.description') }}</p>
    <ApexImage :src="antialiasImg" :alt="t('apexVideoTips.matAntialiasMode.imageAlt')"/>
    <p class="text-caption text-medium-emphasis mt-2">{{ t('apexVideoTips.matAntialiasMode.imageCaption') }}</p>
  </ApexTipCard>
</template>
