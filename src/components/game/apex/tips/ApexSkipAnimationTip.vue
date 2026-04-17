<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {APEX_START_ANIMATION_VIDEO_URL} from '@/data/video.ts';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import ApexTipVideoBox from '@/components/game/apex/common/tips/ApexTipVideoBox.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.skipAnimation.title')">
    <div>
    {{ t('apexTips.skipAnimation.saveTime') }}
    <ApexTipVideoBox :src="APEX_START_ANIMATION_VIDEO_URL"/>
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>
