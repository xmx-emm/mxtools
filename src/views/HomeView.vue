<script setup lang="ts">
import {useRoute} from 'vue-router';
import {routeFullPath} from '../utils/router.ts';
import Navigation from '@/components/Navigation.vue';
import AppTopBar from '@/components/AppTopBar.vue';

const route = useRoute();
</script>

<template>
  <v-main class="home-main">
    <AppTopBar/>
    <div class="home-body">
      <Navigation class="nav-root"/>
      <router-view class="home-content"/>
    </div>
    <div class="pa-2" v-if="false">
      {{ routeFullPath(route as any) }}
    </div>
  </v-main>
</template>

<style scoped>
.home-main {
  display: flex;
  flex-flow: column;
  height: 100vh;
  overflow: hidden;
}

.home-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  overflow: hidden;
}

.nav-root {
  height: 100%;
  align-self: stretch;
}

.home-content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}
</style>
