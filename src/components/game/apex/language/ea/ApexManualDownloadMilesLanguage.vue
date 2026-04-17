<script setup lang="ts">
// Apex(EA App / EA Desktop)手动下载语音包：暂不支持 Steam Depot 半自动流程
import apexStore from '@/stores/game/apex.ts';
import {invoke} from '@tauri-apps/api/core';
import {useToast} from 'vue-toastification';
import {APEX_EA_SELECT_LANGUAGE_IMG_URL} from '@/data/imgloc.ts';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';

const apex_store = apexStore();
const toast = useToast();


function open_audio_folder() {
  const acc = apex_store.active_apex_account;
  if (!acc || acc.kind !== 'ea') {
    toast.error('apex.noLauncherAccount');
    return;
  }
  invoke('open_apex_audio_folder_path', {
    platform: 'ea',
    eaUserId: acc.user.id,
  }).catch((e) => {
    toast.error(String(e));
  });
}
</script>

<template>
  <v-dialog class="not_select" v-model="apex_store.download_miles_language_manual_dialog_ea">
    <v-card title="手动下载语音包(EA)">
      <div class="mx-6" style="height: max-content;overflow-y:scroll;">
        <p class="error_color">EA 平台当前仅支持手动方式：请在 EA App 内切换 Apex 配音语言并等待下载完成.</p>
        <br/>
        1. 打开 EA App,将 Apex 的<strong>配音语言</strong>改为你需要的语言,并等待该语音包下载完成.<br/>
        <ApexImage :src="APEX_EA_SELECT_LANGUAGE_IMG_URL" class="apex_image_heigh"/>
        <br/>
        <br/>
        2. 下载完成后,再把语言改回之前的语言.
        <v-btn class="my-2" @click="open_audio_folder">打开 EA 端音频目录</v-btn>
        <br/>
        <br/>
        3. 在本工具中设置 <code>+miles_language</code> 启动项并应用即可.<br/>
        Tips:Ea端修改语言后，不会将之前下载的语音包删除,所以不需要额外移动文件夹
      </div>
      <template v-slot:actions>
        <v-btn @click="open_audio_folder">打开音频目录</v-btn>
        <v-spacer/>
        <v-btn @click="apex_store.download_miles_language_manual_dialog_ea = false">关闭</v-btn>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>

</style>
