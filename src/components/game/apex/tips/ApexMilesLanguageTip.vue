<script setup lang="ts">
import {useI18n} from "vue-i18n";
import apexStore from "@/stores/game/apex.ts";
import {APEX_STEAM_LANGUAGE_IMG_URL} from "@/data/imgloc.ts";
import ApexImage from "@/components/game/apex/common/tips/ApexImage.vue";
import {APEX_MILES_LANGUAGE_VIDEO_URL} from "@/data/video.ts";
import BiliBiliIVideoIframeBox from "@/components/utils/BiliBiliIVideoIframeBox.vue";
import ApexTipCard from "@/components/game/apex/common/tips/ApexTipCard.vue";

const apex_store = apexStore();
const {t} = useI18n();

</script>

<template>
  <ApexTipCard
      :title="t('apexTips.milesLanguage.title')"
      :subtitle="t('apexTips.milesLanguage.subtitle')"
  >
    <div class="mx-6">
      {{ t('apexTips.milesLanguage.example') }}
      <v-col>
        <v-btn @click="apex_store.download_miles_language_semi_automatic_dialog = true;apex_store.closeTip();">
          {{ t('apexTips.milesLanguage.downloadButton') }}
        </v-btn>
        <v-btn @click="apex_store.download_miles_language_manual_dialog = true;apex_store.closeTip();">
          {{ t('apexTips.milesLanguage.manualButton') }}
        </v-btn>
      </v-col>
      <p class="error_color">{{ t('apexTips.milesLanguage.tip1') }}
        <br/>
        {{ t('apexTips.milesLanguage.tip2') }}
      </p>
      <div>
        <BiliBiliIVideoIframeBox :src="APEX_MILES_LANGUAGE_VIDEO_URL" style="width: 100%"/>
        <ApexImage :src="APEX_STEAM_LANGUAGE_IMG_URL"/>
      </div>
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>