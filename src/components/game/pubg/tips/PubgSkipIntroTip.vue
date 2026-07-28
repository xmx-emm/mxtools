<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.skipIntro.title')">
    <p>{{ t('pubgTips.skipIntro.line1') }}</p>
    <p>{{ t('pubgTips.skipIntro.line2') }}</p>
    <p>{{ t('pubgTips.skipIntro.line3') }}</p>
  </PubgTipCard>
</template>
