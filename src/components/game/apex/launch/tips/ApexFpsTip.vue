<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.fps.title')">
    <div>
      {{ t('apexTips.fps.line1') }}<br/>
      <br/>
      {{ t('apexTips.fps.line2') }}<br/>
      <br/>
      <p class="error_color">{{ t('apexTips.fps.tip') }}</p>
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>
