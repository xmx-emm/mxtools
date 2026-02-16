<script setup lang="ts">

import BiliBiliIVideoIframeBox from "@/components/utils/BiliBiliIVideoIframeBox.vue";
import {APEX_START_ANIMATION_VIDEO_URL} from "@/data/video.ts";

</script>

<template>
  <v-card title="跳过启动动画">
    <BiliBiliIVideoIframeBox :src="APEX_START_ANIMATION_VIDEO_URL"/>
  </v-card>
</template>

<style scoped>

</style>