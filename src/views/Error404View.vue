<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <v-col class="page-content d-flex flex-column align-center justify-center">
    <p class="text-h6 mb-4">{{ t('error404.title') }}</p>
    <v-btn variant="tonal" rounded="lg" @click="router.push('/')">
      {{ t('error404.home') }}
    </v-btn>
  </v-col>
</template>
