<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import {APEX_ALT_TAB_MINIMIZE_WINDOW_VIDEO_URL} from '@/data/video.ts';
import ApexTipVideoBox from '@/components/game/apex/common/tips/ApexTipVideoBox.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.altTabMinimize.title')">
    <div>
      {{ t('apexTips.altTabMinimize.line1') }}
      <br/>
      <p class="error_color">{{ t('apexTips.altTabMinimize.warning') }}</p>
      <ApexTipVideoBox :src="APEX_ALT_TAB_MINIMIZE_WINDOW_VIDEO_URL"/>
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>
