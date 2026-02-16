<script setup lang="ts">

import BiliBiliIVideoIframeBox from "@/components/utils/BiliBiliIVideoIframeBox.vue";
import {APEX_SOFTENED_RED_VIDEO_URL} from "@/data/video.ts";
</script>

<template>
  <v-card title="红光击倒">
    <BiliBiliIVideoIframeBox :src="APEX_SOFTENED_RED_VIDEO_URL"/>
  </v-card>
</template>

<style scoped>

</style>