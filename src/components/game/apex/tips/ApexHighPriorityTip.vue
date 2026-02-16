<script setup lang="ts">

import ApexImage from "@/components/game/apex/tips/template/ApexImage.vue";
import {APEX_HIGH_PRIORITY_IMG_URL} from "@/data/imgloc.ts";
</script>

<template>
  <v-card title="高优先级">
    <div class="mx-6">
      强制让系统优先把CPU算力分配给Apex<br/>
      使其运行更流畅、减少卡顿，尤其在后台有其他任务时
      <ApexImage :src="APEX_HIGH_PRIORITY_IMG_URL"/>
    </div>
  </v-card>
</template>

<style scoped>

</style>