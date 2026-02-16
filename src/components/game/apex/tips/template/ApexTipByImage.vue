<script setup lang="ts">
//提示用的图片

import ApexImage from "@/components/game/apex/tips/template/ApexImage.vue";

const props = defineProps(["src", "alt", "title", "subtitle"])
</script>

<template>
  <v-card :title="props.title" :subtitle="props.subtitle" @click.stop.prevent="">
    <template v-slot:default>
      <ApexImage :src="props.src" :alt="props.alt" class="mx-6 mb-6"/>
    </template>
  </v-card>
</template>
<style scoped>

</style>