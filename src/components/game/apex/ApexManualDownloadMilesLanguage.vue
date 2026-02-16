<script setup lang="ts">
//Apex手动下载语音包指示器
import {apexStore} from "@/stores/game/apex.ts";
import {APEX_DOWNLOAD_IMG_URL, APEX_SELECT_LANGUAGE_IMG_URL} from "@/data/imgloc.ts";
import ApexImage from "@/components/game/apex/tips/template/ApexImage.vue";
import {invoke} from "@tauri-apps/api/core";
import {useToast} from "vue-toastification";

const apex_store = apexStore();
const toast = useToast();

const items = [
  {
    name: 'African Elephant',
    species: 'french',
    file_a: 'general_japanese.mstr',
    file_b: 'general_japanese_patch_1.mstr',
  },
]


function open_audio_folder() {
  invoke('open_apex_audio_folder_path', {}).catch((e) => {
    toast.error(String(e))
  })
}

function open_audio_download_dialog() {
  apex_store.manual_download_miles_language_dialog = false
  apex_store.download_miles_language_dialog = true
}
</script>

<template>
  <v-dialog class="not_select" v-model="apex_store.manual_download_miles_language_dialog">
    <v-card title="手动下载语音包">
      <div class="mx-6" style="height: max-content;overflow-y:scroll;">
        <p class="error_color">tips: 建议使用半自动下载方式,更方便耗时更短</p>><br/>
        1.打开Apex属性,将语言设置为想要的语音包<br/>
        <ApexImage :src="APEX_SELECT_LANGUAGE_IMG_URL"/>
        <br/>
        2.等待语音包下载完成<br/>
        <ApexImage :src="APEX_DOWNLOAD_IMG_URL"/>
        <br/>
        <br/>
        3.语音包下载完成后,打开语言包目录并复制一份下载的语音包
        <v-btn @click="open_audio_folder">打开音频目录</v-btn>
        <v-data-table :items="items" hide-default-footer/>

        <br/>
        <br/>
        4.恢复界面语言,并等待语音包下载完成<br/>
        <br/>
        5.应用语音包并修改启动项<br/>
      </div>
      <template v-slot:actions>
        <v-btn @click="open_audio_folder">打开音频目录</v-btn>
        <v-spacer/>
        <v-btn @click="open_audio_download_dialog">半自动下载</v-btn>
      </template>
    </v-card>
  </v-dialog>

</template>

<style scoped>

</style>