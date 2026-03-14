<script setup lang="ts">
import { useI18n } from "vue-i18n";
import BiliBiliIVideoIframeBox from "@/components/utils/BiliBiliIVideoIframeBox.vue";
import {APEX_START_ANIMATION_VIDEO_URL} from "@/data/video.ts";
import ApexTipCard from "@/components/game/apex/common/tips/ApexTipCard.vue";

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.skipAnimation.title')">
    {{ t('apexTips.skipAnimation.saveTime') }}
    <BiliBiliIVideoIframeBox :src="APEX_START_ANIMATION_VIDEO_URL"/>
  </ApexTipCard>
</template>

<style scoped>

</style>