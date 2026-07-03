<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.window.title')">
    <div>
      {{ t('apexTips.window.fullscreen') }}<br/>
      <br/>
      {{ t('apexTips.window.borderless') }}<br/>
      <br/>
      {{ t('apexTips.window.recommend') }}
      <br/>
      {{ t('apexTips.window.line2') }}
      <br/>
      <p class="error_color">{{ t('apexTips.window.fpsTip') }}</p>
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>
