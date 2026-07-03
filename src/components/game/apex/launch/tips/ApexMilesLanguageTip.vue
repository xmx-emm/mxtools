<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import apexStore from '@/stores/game/apex.ts';
import steamSelectLanguageImg from '@/assets/images/apex/steam_select_language.jpg';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import {APEX_MILES_LANGUAGE_VIDEO_URL} from '@/data/url_video.ts';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import ApexTipVideoBox from '@/components/game/apex/common/tips/ApexTipVideoBox.vue';

const apex_store = apexStore();
const { t } = useI18n();

</script>

<template>
  <ApexTipCard
    :title="t('apexTips.milesLanguage.title')"
    :subtitle="t('apexTips.milesLanguage.subtitle')"
  >
    <div>
      {{ t('apexTips.milesLanguage.example') }}
      <v-col>
        <template v-if="apex_store.active_account_is_ea">
          <v-btn @click="apex_store.download_miles_language_manual_dialog_ea = true;apex_store.closeTip();">
            {{ t('apexTips.milesLanguage.manualButton') }}
          </v-btn>
        </template>
        <template v-else>
          <v-btn @click="apex_store.download_miles_language_semi_automatic_dialog = true;apex_store.closeTip();">
            {{ t('apexTips.milesLanguage.downloadButton') }}
          </v-btn>
          <v-btn @click="apex_store.download_miles_language_manual_dialog = true;apex_store.closeTip();">
            {{ t('apexTips.milesLanguage.manualButton') }}
          </v-btn>
        </template>
      </v-col>
      <p class="error_color">{{ t('apexTips.milesLanguage.tip1') }}
        <br/>
        {{ t('apexTips.milesLanguage.tip2') }}
      </p>
      <div>
        <ApexTipVideoBox :src="APEX_MILES_LANGUAGE_VIDEO_URL"/>
        <ApexImage :src="steamSelectLanguageImg"/>
      </div>
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>
