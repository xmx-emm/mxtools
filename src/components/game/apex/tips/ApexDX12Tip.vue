<script setup lang="ts">
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import {useI18n} from 'vue-i18n';

const {t} = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.graphicsApi.title')">
    {{ t('apexTips.graphicsApi.line1') }}<br/>
    {{ t('apexTips.graphicsApi.line2') }}<br/>
    {{ t('apexTips.graphicsApi.line3') }}<br/>
    {{ t('apexTips.graphicsApi.recommend') }}
  </ApexTipCard>
</template>

<style scoped>

</style>
