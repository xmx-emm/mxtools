<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.noJoy.title')">
    {{ t('apexTips.noJoy.line1') }}<br/>
    {{ t('apexTips.noJoy.line2') }}<br/>
    {{ t('apexTips.noJoy.line3') }}<br/>
    {{ t('apexTips.noJoy.line4') }}<br/>
  </ApexTipCard>
</template>

<style scoped>

</style>
