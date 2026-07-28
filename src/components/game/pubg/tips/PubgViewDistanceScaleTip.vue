<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.viewDistance.title')">
    <p>{{ t('pubgTips.viewDistance.line1') }}</p>
    <p>{{ t('pubgTips.viewDistance.line2') }}</p>
    <p>{{ t('pubgTips.viewDistance.line3') }}</p>
  </PubgTipCard>
</template>
