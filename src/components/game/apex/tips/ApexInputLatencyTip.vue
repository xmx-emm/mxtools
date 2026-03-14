<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ApexTipCard from "@/components/game/apex/common/tips/ApexTipCard.vue";

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.inputLatency.title')">
    <div class="text-body-2 mx-6">
      {{ t('apexTips.inputLatency.line1') }}<br/>
      {{ t('apexTips.inputLatency.line2') }}<br/>
      <br/>
      {{ t('apexTips.inputLatency.line3') }}<br/>
      {{ t('apexTips.inputLatency.line4') }}<br/>
      {{ t('apexTips.inputLatency.line5') }}<br/>
      {{ t('apexTips.inputLatency.line6') }}<br/>
      {{ t('apexTips.inputLatency.line7') }}<br/>
      <br/>
      {{ t('apexTips.inputLatency.line8') }}<br/>
      {{ t('apexTips.inputLatency.line9') }}<br/>
      {{ t('apexTips.inputLatency.line10') }}<br/>
      <br/>
      {{ t('apexTips.inputLatency.line11') }}<br/>
      {{ t('apexTips.inputLatency.line12') }}<br/>
      {{ t('apexTips.inputLatency.line13') }}<br/>
      <br/>
      {{ t('apexTips.inputLatency.line14') }}<br/>
      {{ t('apexTips.inputLatency.line15') }}<br/>
      <p class="error_color">{{ t('apexTips.inputLatency.tip') }}</p>
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>