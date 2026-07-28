<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.noTextureStreaming.title')">
    <p>{{ t('pubgTips.noTextureStreaming.line1') }}</p>
    <p>{{ t('pubgTips.noTextureStreaming.line2') }}</p>
    <p>{{ t('pubgTips.noTextureStreaming.line3') }}</p>
  </PubgTipCard>
</template>
