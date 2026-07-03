<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.milesChannels.title')">
    +miles_channels 2<br/>
    {{ t('apexTips.milesChannels.line1') }}<br/>
    {{ t('apexTips.milesChannels.line2') }}<br/>
    {{ t('apexTips.milesChannels.line3') }}<br/>
    {{ t('apexTips.milesChannels.line4') }}<br/>
    {{ t('apexTips.milesChannels.line5') }}<br/>
  </ApexTipCard>
</template>

<style scoped>

</style>
