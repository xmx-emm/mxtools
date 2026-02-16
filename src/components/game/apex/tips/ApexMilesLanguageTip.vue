<script setup lang="ts">
import {apexStore} from "@/stores/game/apex.ts";
import {APEX_STEAM_LANGUAGE_IMG_URL} from "@/data/imgloc.ts";
import ApexImage from "@/components/game/apex/tips/template/ApexImage.vue";
import {APEX_MILES_LANGUAGE_VIDEO_URL} from "@/data/video.ts";
import BiliBiliIVideoIframeBox from "@/components/utils/BiliBiliIVideoIframeBox.vue";

const apex_store = apexStore();

</script>

<template>
  <v-card title="设置游戏语音"
          subtitle="此选项可以将Apex的显示语言及游戏人物人语音单独设置">
    <div class="mx-6">
      如: 中文显示 ,日语配音
      <v-col>
        <v-btn @click="apex_store.download_miles_language_dialog = true">
          下载语音包
        </v-btn>
        <v-btn @click="apex_store.manual_download_miles_language_dialog = true">
          手动下载
        </v-btn>
      </v-col>
      <p class="error_color">tips:需要注意每次更新Apex之后需要重新下载语音包并应用文件
        <br/>
        不然会导致闪退报错
      </p>
      <div>
        <BiliBiliIVideoIframeBox :src="APEX_MILES_LANGUAGE_VIDEO_URL" style="width: 100%"/>
        <ApexImage :src="APEX_STEAM_LANGUAGE_IMG_URL"/>
      </div>
    </div>
  </v-card>
</template>

<style scoped>

</style>