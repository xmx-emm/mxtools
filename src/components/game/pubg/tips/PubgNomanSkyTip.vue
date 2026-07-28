<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.nomanSky.title')">
    <p>{{ t('pubgTips.nomanSky.line1') }}</p>
    <p>{{ t('pubgTips.nomanSky.line2') }}</p>
    <p>{{ t('pubgTips.nomanSky.line3') }}</p>
  </PubgTipCard>
</template>
