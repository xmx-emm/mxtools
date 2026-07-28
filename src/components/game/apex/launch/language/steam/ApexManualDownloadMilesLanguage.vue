<script setup lang="ts">
// Apex(Steam)手动下载语音包指示器
import {useI18n} from 'vue-i18n';
import {useApexStore} from '@/stores/game/apex.ts';
import steamDownloadImg from '@/assets/images/apex/steam_download.jpg';
import steamSelectLanguageImg from '@/assets/images/apex/steam_select_language.jpg';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import {ApexMilesLanguagesDepot} from '@/data/apex_launch_options_config.ts';
import {openApexAudioFolderPath} from '@/ipc/commands.ts';
import {useToast} from 'vue-toastification';

const {t} = useI18n();
const apex_store = useApexStore();
const toast = useToast();

function normalizeMilesLanguage(language: string): string {
  const normalized = language.replace(/"/g, '').trim().toLowerCase();
  const languageMap: Record<string, string> = {
    mandarin: 'schinese',
    korean: 'koreana',
  };
  return languageMap[normalized] ?? normalized;
}

const items = Object.entries(ApexMilesLanguagesDepot).map(([language, depot]) => ({
  language,
  depot,
  file_a: `general_${normalizeMilesLanguage(language)}.mstr`,
  file_b: `general_${normalizeMilesLanguage(language)}_patch_1.mstr`,
}));

function open_audio_folder() {
  openApexAudioFolderPath({
    platform: 'steam',
    eaUserId: null,
  }).catch((e) => {
    toast.error(String(e));
  });
}

function open_audio_download_dialog() {
  apex_store.download_miles_language_manual_dialog = false;
  apex_store.download_miles_language_semi_automatic_dialog = true;
}
</script>

<template>
  <v-dialog class="not_select" v-model="apex_store.download_miles_language_manual_dialog">
    <v-card :title="t('apex.milesDownload.manualSteamTitle')">
      <div class="mx-6" style="height: max-content;overflow-y:scroll;">
        <p class="error_color">{{ t('apex.milesDownload.manualSteamTip') }}</p><br/>
        {{ t('apex.milesDownload.manualSteamStep1') }}<br/>
        <ApexImage :src="steamSelectLanguageImg" class="apex_image_heigh"/>
        <br/>
        {{ t('apex.milesDownload.manualSteamStep2') }}<br/>
        <ApexImage :src="steamDownloadImg" class="apex_image_heigh"/>
        <br/>
        <br/>
        {{ t('apex.milesDownload.manualSteamStep3') }}
        <v-btn @click="open_audio_folder">{{ t('apex.milesDownload.openAudioFolder') }}</v-btn>
        <v-data-table :items="items" hide-default-footer/>

        <br/>
        <br/>
        {{ t('apex.milesDownload.manualSteamStep4') }}<br/>
        <br/>
        {{ t('apex.milesDownload.manualSteamStep5') }}<br/>
      </div>
      <template v-slot:actions>
        <v-btn @click="open_audio_folder">{{ t('apex.milesDownload.openAudioFolder') }}</v-btn>
        <v-spacer/>
        <v-btn @click="open_audio_download_dialog">{{ t('apex.milesDownload.semiAutoDownload') }}</v-btn>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>

</style>
