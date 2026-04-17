<script setup>
import TestView from '@/views/TestView.vue';
import {openUrl} from '@tauri-apps/plugin-opener';
import {openWebWindow} from '@/utils/windows.ts';
import ZoomableImage from '@/components/common/ZoomableImage.vue';
</script>
<template>
  <div>
    <TestView/>
    <v-btn variant="text" @click="openUrl('steam://nav/console')">打开</v-btn>
    <v-tooltip text="Tooltip">
      <template v-slot:activator="{ props }">
        <v-btn v-bind="props">Hover Over Me</v-btn>
      </template>
    </v-tooltip>
    <v-btn @click="openWebWindow('about','关于页面')">waa</v-btn>
    <ZoomableImage src="https://picsum.photos/seed/picsum/1024/512"/>
  </div>
</template>
<style>
</style>
