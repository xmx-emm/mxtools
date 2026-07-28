<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.useAllCores.title')">
    <p>{{ t('pubgTips.useAllCores.line1') }}</p>
    <p>{{ t('pubgTips.useAllCores.line2') }}</p>
    <p>{{ t('pubgTips.useAllCores.line3') }}</p>
  </PubgTipCard>
</template>
