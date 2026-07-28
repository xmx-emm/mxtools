<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.matAntialias.title')">
    <p>{{ t('pubgTips.matAntialias.line1') }}</p>
    <p>{{ t('pubgTips.matAntialias.line2') }}</p>
    <p>{{ t('pubgTips.matAntialias.line3') }}</p>
  </PubgTipCard>
</template>
