<script setup lang="ts">

import {APEX_SHOW_FPS_IMG_URL} from "@/data/imgloc.ts";
import ApexTipByImage from "@/components/game/apex/tips/template/ApexTipByImage.vue";
</script>

<template>
  <ApexTipByImage title="显示fps" subtitle="在右上角显示实时帧率及网络信息" :src="APEX_SHOW_FPS_IMG_URL"/>
</template>

<style scoped>

</style>