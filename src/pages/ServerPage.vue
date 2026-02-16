<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { routeFullPath } from '../utils/router.ts';
import { useRoute } from 'vue-router';
import { computed } from 'vue';

const { t } = useI18n();
const route = useRoute();
const isServer = computed(() => routeFullPath(route) === '/tools/server');
</script>

<template>
  <div v-if="isServer" class="page-content">
    {{ t('server.home') }}
  </div>
  <router-view v-else/>
</template>
<style scoped>
</style>
