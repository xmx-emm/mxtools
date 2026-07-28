<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.koreanRating.title')">
    <p>{{ t('pubgTips.koreanRating.line1') }}</p>
    <p>{{ t('pubgTips.koreanRating.line2') }}</p>
    <p>{{ t('pubgTips.koreanRating.line3') }}</p>
  </PubgTipCard>
</template>
