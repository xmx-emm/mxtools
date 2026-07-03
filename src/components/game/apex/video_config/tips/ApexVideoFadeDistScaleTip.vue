<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {APEX_FADE_DIST_SCALE_VIDEO_URL} from '@/data/url_video.ts';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import ApexTipVideoBox from '@/components/game/apex/common/tips/ApexTipVideoBox.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.fadeDistScale.name')"
    :subtitle="t('apexVideoConfig.fadeDistScale.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.fadeDistScale.description') }}</p>
    <ApexTipVideoBox :src="APEX_FADE_DIST_SCALE_VIDEO_URL"/>
  </ApexTipCard>
</template>
