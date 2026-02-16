<script setup>
import TestView from '@/views/TestView.vue';
import {openUrl} from "@tauri-apps/plugin-opener";
import {openWebWindow} from "@/utils/windows.ts";
</script>
<template>
  <div>
    <router-link to="/welcome">welcome</router-link>
    <TestView/>
    <v-btn variant="text" @click="openUrl('steam://nav/console')">打开</v-btn>
    <v-tooltip text="Tooltip">
      <template v-slot:activator="{ props }">
        <v-btn v-bind="props">Hover Over Me</v-btn>
      </template>
    </v-tooltip>
    <v-btn @click="openWebWindow('about','关于页面')">waa</v-btn>
  </div>
</template>
<style>
</style>
