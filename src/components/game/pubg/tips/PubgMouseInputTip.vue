<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.mouseInput.title')">
    <p>{{ t('pubgTips.mouseInput.line1') }}</p>
    <p>{{ t('pubgTips.mouseInput.line2') }}</p>
    <p>{{ t('pubgTips.mouseInput.line3') }}</p>
  </PubgTipCard>
</template>
