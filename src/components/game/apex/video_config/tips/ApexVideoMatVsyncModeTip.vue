<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {openUrl} from '@tauri-apps/plugin-opener';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import screenTearingImg from '@/assets/images/apex/screen_tearing.jpg';
import {APEX_VSYNC_VIDEO_PAGE_URL} from '@/data/url_video.ts';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.matVsyncMode.name')"
    :subtitle="t('apexVideoConfig.matVsyncMode.description')"
  >
    <p class="text-medium-emphasis mb-4">{{ t('apexVideoTips.matVsyncMode.description') }}</p>
    <v-btn
      class="mt-4"
      color="pink-lighten-1"
      variant="tonal"
      prepend-icon="mdi-play"
      @click="openUrl(APEX_VSYNC_VIDEO_PAGE_URL)"
    >
      {{ t('apexVideoTips.matVsyncMode.videoTitle') }}
    </v-btn>
    <ApexImage :src="screenTearingImg" :alt="t('apexVideoTips.matVsyncMode.imageAlt')"/>
    <p class="text-caption text-medium-emphasis mt-2">{{ t('apexVideoTips.matVsyncMode.imageCaption') }}</p>
  </ApexTipCard>
</template>
