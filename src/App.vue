<script setup lang="ts">
import {uiStyleStore} from '@/stores/style.ts';
import {onMounted} from 'vue';
import {useStateStore} from '@/stores/state.ts';
import {DisableRightClick} from "@/utils/event.ts";

const ui = uiStyleStore();

onMounted(() => {
  useStateStore().updateState();
});
DisableRightClick()
</script>

<template>
  <v-app :theme="ui.themeStyle" class="not_select">
    <router-view class="not_scrollbar not_select"/>
  </v-app>
</template>

<style scoped>
</style>
<style>

</style>
