<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed } from 'vue';
import { routeFullPath } from '@/utils/router.ts';
import { useRoute } from 'vue-router';

const { t } = useI18n();
const route = useRoute();
const isGame = computed(() => routeFullPath(route) === '/tools/game');
</script>

<template>
  <div v-if="isGame" class="page-content">
    {{ t('game.home') }}
  </div>
  <router-view style="flex: 1" v-else/>
</template>

<style scoped>

</style>
