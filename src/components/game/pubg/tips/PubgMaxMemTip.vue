<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.maxMem.title')">
    <p>{{ t('pubgTips.maxMem.line1') }}</p>
    <p>{{ t('pubgTips.maxMem.line2') }}</p>
    <p>{{ t('pubgTips.maxMem.line3') }}</p>
  </PubgTipCard>
</template>
