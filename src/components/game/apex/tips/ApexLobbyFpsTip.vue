<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ApexTipCard from "@/components/game/apex/common/tips/ApexTipCard.vue";

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.lobbyFps.title')">
    <div class="mx-6">
      {{ t('apexTips.lobbyFps.line1') }}<br/>
      <br/>
      {{ t('apexTips.lobbyFps.line2') }}<br/>
      {{ t('apexTips.lobbyFps.line3') }}<br/>
      {{ t('apexTips.lobbyFps.line4') }}
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>
