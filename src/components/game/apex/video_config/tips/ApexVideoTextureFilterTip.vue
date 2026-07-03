<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {openUrl} from '@tauri-apps/plugin-opener';
import {APEX_TEXTURE_FILTER_VIDEO_PAGE_URL} from '@/data/url_video.ts';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.textureFilter.name')"
    :subtitle="t('apexVideoConfig.textureFilter.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.textureFilter.description') }}</p>
    <v-btn
      class="mt-4"
      color="pink-lighten-1"
      variant="tonal"
      prepend-icon="mdi-play"
      @click="openUrl(APEX_TEXTURE_FILTER_VIDEO_PAGE_URL)"
    >
      {{ t('apexVideoTips.textureFilter.videoTitle') }}
    </v-btn>
  </ApexTipCard>
</template>
