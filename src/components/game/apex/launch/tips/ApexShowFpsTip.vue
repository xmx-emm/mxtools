<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import showFpsImg from '@/assets/images/apex/show_fps.jpg';
import ApexTipByImage from '@/components/game/apex/common/tips/ApexTipByImage.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipByImage
    :title="t('apexTips.showFps.title')"
    :subtitle="t('apexTips.showFps.subtitle')"
    :src="showFpsImg"
  />
</template>

<style scoped>

</style>
