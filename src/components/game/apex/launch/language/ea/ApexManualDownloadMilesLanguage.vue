<script setup lang="ts">
// Apex(EA App / EA Desktop)手动下载语音包：暂不支持 Steam Depot 半自动流程
import {useI18n} from 'vue-i18n';
import {useApexStore} from '@/stores/game/apex.ts';
import {openApexAudioFolderPath} from '@/ipc/commands.ts';
import {useToast} from 'vue-toastification';
import eaSelectLanguageImg from '@/assets/images/apex/ea_select_language.jpg';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';

const {t} = useI18n();
const apex_store = useApexStore();
const toast = useToast();

function open_audio_folder() {
  const acc = apex_store.active_apex_account;
  if (!acc || acc.kind !== 'ea') {
    toast.error('apex.noLauncherAccount');
    return;
  }
  openApexAudioFolderPath({
    platform: 'ea',
    eaUserId: acc.user.id,
  }).catch((e) => {
    toast.error(String(e));
  });
}
</script>

<template>
  <v-dialog class="not_select" v-model="apex_store.download_miles_language_manual_dialog_ea">
    <v-card :title="t('apex.milesDownload.manualEaTitle')">
      <div class="mx-6" style="height: max-content;overflow-y:scroll;">
        <p class="error_color">{{ t('apex.milesDownload.manualEaTip') }}</p>
        <br/>
        {{ t('apex.milesDownload.manualEaStep1') }}<br/>
        <ApexImage :src="eaSelectLanguageImg" class="apex_image_heigh"/>
        <br/>
        <br/>
        {{ t('apex.milesDownload.manualEaStep2') }}
        <v-btn class="my-2" @click="open_audio_folder">{{ t('apex.milesDownload.openEaAudioFolder') }}</v-btn>
        <br/>
        <br/>
        {{ t('apex.milesDownload.manualEaStep3') }}<br/>
        {{ t('apex.milesDownload.manualEaTipKeep') }}
      </div>
      <template v-slot:actions>
        <v-btn @click="open_audio_folder">{{ t('apex.milesDownload.openAudioFolder') }}</v-btn>
        <v-spacer/>
        <v-btn @click="apex_store.download_miles_language_manual_dialog_ea = false">
          {{ t('apex.milesDownload.close') }}
        </v-btn>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>

</style>
