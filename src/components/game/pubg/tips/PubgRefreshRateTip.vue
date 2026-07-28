<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.refresh.title')">
    <p>{{ t('pubgTips.refresh.line1') }}</p>
    <p>{{ t('pubgTips.refresh.line2') }}</p>
    <p>{{ t('pubgTips.refresh.line3') }}</p>
  </PubgTipCard>
</template>
