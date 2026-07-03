<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.forcePreload.title')">
    +cl_forcepreload 1<br/>
    {{ t('apexTips.forcePreload.line1') }}<br/>
    {{ t('apexTips.forcePreload.line2') }}<br/>
    {{ t('apexTips.forcePreload.line3') }}<br/>
    <br/>
    {{ t('apexTips.forcePreload.line4') }}<br/>
    {{ t('apexTips.forcePreload.line5') }}<br/>
    {{ t('apexTips.forcePreload.line6') }}<br/>
  </ApexTipCard>
</template>

<style scoped>

</style>
