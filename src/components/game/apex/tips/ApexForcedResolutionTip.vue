<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ApexImage from "@/components/game/apex/common/tips/ApexImage.vue";
import {APEX_FORCED_RESOLUTION_ERROR_IMG_URL} from "@/data/imgloc.ts";
import ApexTipCard from "@/components/game/apex/common/tips/ApexTipCard.vue";

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.forcedResolution.title')">
    <div class="mx-6">
      <div class="error_color">
        {{ t('apexTips.forcedResolution.conflict1') }}<br/>
        {{ t('apexTips.forcedResolution.conflict2') }}
      </div>
      {{ t('apexTips.forcedResolution.line1') }}<br/>
      <br/>
      {{ t('apexTips.forcedResolution.line2') }}<br/>
      {{ t('apexTips.forcedResolution.line3') }}<br/>
      {{ t('apexTips.forcedResolution.line4') }}<br/>
      {{ t('apexTips.forcedResolution.line5') }}<br/>
      <br/>
      <ApexImage :src="APEX_FORCED_RESOLUTION_ERROR_IMG_URL" height="200" :alt="t('apexTips.forcedResolution.imageAlt')"></ApexImage>
      <br/>
      <br/>

    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>
