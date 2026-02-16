<script setup lang="ts">
import {useRoute} from 'vue-router';
import {routeFullPath} from '../utils/router.ts';
import Navigation from '@/components/Navigation.vue';
import AppTopBar from '@/components/AppTopBar.vue';

const route = useRoute();

</script>

<template>
  <v-main style="display: flex; flex-flow: column; height: 100vh;overflow: hidden;">
    <AppTopBar/>
    <Navigation/>
    <router-view style="flex:1;overflow:hidden;height: 100%;"/>
    <div class="pa-2" v-if="false">
      {{ routeFullPath(route as any) }}
    </div>
  </v-main>
</template>

<style scoped>
</style>
