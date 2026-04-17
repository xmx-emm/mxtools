<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.clipMouse.title')">
    {{ t('apexTips.clipMouse.line1') }}<br/>
    {{ t('apexTips.clipMouse.line2') }}<br/>
    {{ t('apexTips.clipMouse.line3') }}<br/>
  </ApexTipCard>
</template>

<style scoped>

</style>
