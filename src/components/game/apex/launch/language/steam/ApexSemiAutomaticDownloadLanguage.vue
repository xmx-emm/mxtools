<script setup lang="ts">
/**
 * Steam：半自动下载语音包(Steam 控制台 + Depot)
 */
import {openUrl} from '@tauri-apps/plugin-opener';
import {invoke} from '@tauri-apps/api/core';
import {ref} from 'vue';
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import CodeDisplay from '@/components/utils/CodeDisplay.vue';
import steamConsoleImg from '@/assets/game/steam_console.png';
import {useToast} from 'vue-toastification';
import apexStore from '@/stores/game/apex.ts';

const apex_store = apexStore();
const written_to_clipboard = ref(false);
const is_apply_language = ref(false);
const toast = useToast();

const stepper_ref = ref();

const stepper = [
  '打开控制台',
  '下载Depot',
  '应用语音包',
  '注意事项',
];

function apply_miles_language() {
  is_apply_language.value = true;
  invoke('apply_apex_miles_language', {
    depot: Number(apex_store.language_depot),
    platform: 'steam',
    eaUserId: null,
  }).then(() => {
    toast.success('toast.applyMilesLanguageSuccess');
    is_apply_language.value = false;
    apex_store.update_download_language_button_color();
    stepper_ref.value.next();
  }).catch(err => {
    toast.error(String(err));
    is_apply_language.value = false;
    apex_store.update_download_language_button_color();
  });
}

function copy_code() {
  writeText(apex_store.download_language_depot_command);
  written_to_clipboard.value = true;
}

function open_console() {
  openUrl('steam://nav/console');
  stepper_ref.value.next();
}

function open_audio_folder() {
  invoke('open_apex_audio_folder_path', {
    platform: 'steam',
    eaUserId: null,
  }).catch((e) => {
    toast.error(String(e));
  });
}

function open_depot_download_folder() {
  invoke('open_apex_depot_download_folder_path', {
    depot: Number(apex_store.language_depot),
    platform: 'steam',
    eaUserId: null,
  }).catch((e) => {
    toast.error(String(e));
  });
}
</script>

<template>
  <v-dialog class="not_select" v-model="apex_store.download_miles_language_semi_automatic_dialog">
    <template v-slot:default="{  }">
      <v-card title="应用语音包步骤(Steam)">
        <v-stepper :items="stepper" ref="stepper_ref">
          <template v-slot:item.1>
            <v-card flat subtitle="通过Steam控制台下载所需的Apex语音包" title="打开Steam控制台">
              <v-row class="d-flex flex-row align-center" style="flex:1;width: 100%;padding: 30px"
                     align-content="space-between">
                <v-img
                  maxHeight="70px"
                  maxWidth="400px"
                  @click="open_console"
                  :src="steamConsoleImg"></v-img>
                <v-spacer/>
                <svg @click="openUrl('https://steamdb.info/app/1172470/depots/')" width="40" height="40"
                     style="cursor: pointer "
                     viewBox="0 0 128 128" aria-hidden="true">
                  <path fill-rule="evenodd"
                        d="M63.9 0C30.5 0 3.1 11.9.1 27.1l35.6 6.7c2.9-.9 6.2-1.3 9.6-1.3l16.7-10c-.2-2.5 1.3-5.1 4.7-7.2 4.8-3.1 12.3-4.8 19.9-4.8 5.2-.1 10.5.7 15 2.2 11.2 3.8 13.7 11.1 5.7 16.3-5.1 3.3-13.3 5-21.4 4.8l-22 7.9c-.2 1.6-1.3 3.1-3.4 4.5-5.9 3.8-17.4 4.7-25.6 1.9-3.6-1.2-6-3-7-4.8L2.5 38.4c2.3 3.6 6 6.9 10.8 9.8C5 53 0 59 0 65.5c0 6.4 4.8 12.3 12.9 17.1C4.8 87.3 0 93.2 0 99.6 0 115.3 28.6 128 64 128c35.3 0 64-12.7 64-28.4 0-6.4-4.8-12.3-12.9-17 8.1-4.8 12.9-10.7 12.9-17.1 0-6.5-5-12.6-13.4-17.4 8.3-5.1 13.3-11.4 13.3-18.2 0-16.5-28.7-29.9-64-29.9zm22.8 14.2c-5.2.1-10.2 1.2-13.4 3.3-5.5 3.6-3.8 8.5 3.8 11.1 7.6 2.6 18.1 1.8 23.6-1.8s3.8-8.5-3.8-11c-3.1-1-6.7-1.5-10.2-1.5zm.3 1.7c7.4 0 13.3 2.8 13.3 6.2 0 3.4-5.9 6.2-13.3 6.2s-13.3-2.8-13.3-6.2c0-3.4 5.9-6.2 13.3-6.2zM45.3 34.4c-1.6.1-3.1.2-4.6.4l9.1 1.7a10.8 5 0 1 1-8.1 9.3l-8.9-1.7c1 .9 2.4 1.7 4.3 2.4 6.4 2.2 15.4 1.5 20-1.5s3.2-7.2-3.2-9.3c-2.6-.9-5.7-1.3-8.6-1.3zM109 51v9.3c0 11-20.2 19.9-45 19.9-24.9 0-45-8.9-45-19.9v-9.2c11.5 5.3 27.4 8.6 44.9 8.6 17.6 0 33.6-3.3 45.2-8.7zm0 34.6v8.8c0 11-20.2 19.9-45 19.9-24.9 0-45-8.9-45-19.9v-8.8c11.6 5.1 27.4 8.2 45 8.2s33.5-3.1 45-8.2z"></path>
                </svg>
              </v-row>
              <div style="padding: 10px">

                <v-btn block @click="open_console"
                       prepend-icon="mdi-console" variant="tonal"
                >打开控制台
                </v-btn>
              </div>
            </v-card>
          </template>
          <template v-slot:item.2>
            <v-card title="下载Depot" flat>
              <v-col>
                <div class="d-flex align-center">
                  <v-icon
                    icon="mdi-steam"
                    size="30px"
                    @click="openUrl('steam://nav/console')"
                  />
                  输入代码
                  <p class="link" @click="copy_code"> {{ apex_store.download_language_depot_command }}</p>
                  <div v-if="written_to_clipboard">
                    <v-icon icon="mdi-check" color="green"></v-icon>
                    已复制
                  </div>
                  <div v-else> 点击复制</div>
                </div>
                <v-divider></v-divider>
                <v-layout>
                  <CodeDisplay
                    title="等待下载完成"
                    :code="apex_store.download_language_depot_command"
                  >
                    // 出现下列代码状态为下载中...<br/>
                    Downloading depot {{ apex_store.language_depot }} (2 files, xxxx MB) ...<br/>
                    // 语言文件大小约为~4GB,10MB/s下载时间大约为5分钟<br/>
                    // 出现下列代码状态为下载完成,点击下一步应用配音...<br/>
                    Depot download complete :
                    "Steam目录\steamapps\content\app_1172470\depot_{{ apex_store.language_depot }}"<br/>
                    (manifest xxxxxxxxxxxxxxxxxxx)
                  </CodeDisplay>
                </v-layout>
              </v-col>
            </v-card>
          </template>
          <template v-slot:item.3>
            <v-card title="应用语音包" flat>
              <div class="d-flex flex-row">将下载的
                <div @click="open_depot_download_folder" class="link">语音包</div>
                复制到
                <div @click="open_audio_folder" class="link">Apex目录</div>
                下
              </div>
              <div>再输入指定语音包的启动参数即可</div>
              <v-btn
                @click="apply_miles_language"
                :loading="is_apply_language"
                variant="tonal"
              >点我应用
              </v-btn>
            </v-card>
          </template>
          <template v-slot:item.4>
            <v-card title="注意!" flat class="error_color warning-red-text-edge-animate">
              <div>每次Apex大版本更新或修改语音包时需要重新下载并应用语音包</div>
              <div>不然将会导致无法启动Apex!!!!!</div>
            </v-card>
          </template>
        </v-stepper>
      </v-card>
    </template>
  </v-dialog>

</template>

<style scoped>
.link {
  color: #747bff;
  cursor: pointer;
  background: #151212;
  padding: 2px 5px;
  border-radius: 5px;
  line-height: 1.1;
}

</style>
