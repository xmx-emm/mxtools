<script setup lang="ts">
import { useI18n } from "vue-i18n";
import {APEX_SHOW_FPS_IMG_URL} from "@/data/imgloc.ts";
import ApexTipByImage from "@/components/game/apex/common/tips/ApexTipByImage.vue";

const { t } = useI18n();
</script>

<template>
  <ApexTipByImage
      :title="t('apexTips.showFps.title')"
      :subtitle="t('apexTips.showFps.subtitle')"
      :src="APEX_SHOW_FPS_IMG_URL"
  />
</template>

<style scoped>

</style>