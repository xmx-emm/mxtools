<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.limitvsconst.title')">
    {{ t('apexTips.limitvsconst.line1') }}<br/>
    {{ t('apexTips.limitvsconst.line2') }}<br/>
    {{ t('apexTips.limitvsconst.line3') }}<br/>
    {{ t('apexTips.limitvsconst.line4') }}<br/>
    {{ t('apexTips.limitvsconst.line5') }}<br/>
    <br/>
    {{ t('apexTips.limitvsconst.line6') }}<br/>
  </ApexTipCard>
</template>

<style scoped>

</style>
