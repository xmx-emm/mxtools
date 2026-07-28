<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.highPriority.title')">
    <p>{{ t('pubgTips.highPriority.line1') }}</p>
    <p>{{ t('pubgTips.highPriority.line2') }}</p>
    <p>{{ t('pubgTips.highPriority.line3') }}</p>
  </PubgTipCard>
</template>
