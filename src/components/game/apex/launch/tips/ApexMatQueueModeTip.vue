<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.matQueueMode.title')">
    {{ t('apexTips.matQueueMode.line1') }}<br/>
    {{ t('apexTips.matQueueMode.line2') }}<br/>
    {{ t('apexTips.matQueueMode.line3') }}<br/>
    <p class="error_color">{{ t('apexTips.matQueueMode.warning') }}</p>
    <br/>
    {{ t('apexTips.matQueueMode.line4') }}<br/>
    {{ t('apexTips.matQueueMode.line5') }}<br/>
    {{ t('apexTips.matQueueMode.line6') }}<br/>
    {{ t('apexTips.matQueueMode.line7') }}<br/>
    {{ t('apexTips.matQueueMode.line8') }}<br/>
    {{ t('apexTips.matQueueMode.line9') }}<br/>
    {{ t('apexTips.matQueueMode.line10') }}<br/>
    {{ t('apexTips.matQueueMode.line11') }}<br/>
    {{ t('apexTips.matQueueMode.line12') }}<br/>
    {{ t('apexTips.matQueueMode.line13') }}<br/>
    {{ t('apexTips.matQueueMode.line14') }}<br/>
    {{ t('apexTips.matQueueMode.line15') }}<br/>
    <br/>
  </ApexTipCard>
</template>

<style scoped>

</style>
