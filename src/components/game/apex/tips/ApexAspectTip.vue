<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ApexTipCard from "@/components/game/apex/common/tips/ApexTipCard.vue";

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.aspect.title')">
    <div class="mx-6">
      {{ t('apexTips.aspect.line1') }}<br/>
      <br/>
      {{ t('apexTips.aspect.line2') }}<br/>
      {{ t('apexTips.aspect.line3') }}<br/>
      - {{ t('apexTips.aspect.example1') }}<br/>
      - {{ t('apexTips.aspect.example2') }}<br/>
      - {{ t('apexTips.aspect.example3') }}<br/>
      <br/>
      {{ t('apexTips.aspect.line4') }}<br/>
      <br/>
      {{ t('apexTips.aspect.line5') }}
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>
