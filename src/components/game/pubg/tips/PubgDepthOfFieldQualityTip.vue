<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.depthOfField.title')">
    <p>{{ t('pubgTips.depthOfField.line1') }}</p>
    <p>{{ t('pubgTips.depthOfField.line2') }}</p>
    <p>{{ t('pubgTips.depthOfField.line3') }}</p>
  </PubgTipCard>
</template>
