<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ApexImage from "@/components/game/apex/common/tips/ApexImage.vue";
import {APEX_HIGH_PRIORITY_IMG_URL} from "@/data/imgloc.ts";
import ApexTipCard from "@/components/game/apex/common/tips/ApexTipCard.vue";

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.highPriority.title')">
    <div class="mx-6">
      {{ t('apexTips.highPriority.line1') }}<br/>
      {{ t('apexTips.highPriority.line2') }}
      <ApexImage :src="APEX_HIGH_PRIORITY_IMG_URL"/>
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>