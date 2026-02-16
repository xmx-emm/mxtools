<script setup lang="ts">

import {APEX_SHOW_POS_IMG_URL} from "@/data/imgloc.ts";
import ApexTipByImage from "@/components/game/apex/tips/template/ApexTipByImage.vue";
</script>
<template>
  <ApexTipByImage title="显示pos" subtitle="在左上角显示实时位置及视角移速等信息" :src="APEX_SHOW_POS_IMG_URL"/>
</template>

<style scoped>

</style>