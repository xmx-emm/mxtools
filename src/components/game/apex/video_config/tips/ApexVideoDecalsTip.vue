<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {APEX_DECALS_VIDEO_URL} from '@/data/url_video.ts';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import ApexTipVideoBox from '@/components/game/apex/common/tips/ApexTipVideoBox.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.decals.name')"
    :subtitle="t('apexVideoConfig.decals.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.decals.description') }}</p>
    <ApexTipVideoBox :src="APEX_DECALS_VIDEO_URL"/>
  </ApexTipCard>
</template>
