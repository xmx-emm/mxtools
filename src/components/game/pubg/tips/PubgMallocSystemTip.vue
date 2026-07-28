<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
const {t} = useI18n();
</script>

<template>
  <PubgTipCard :title="t('pubgTips.malloc.title')">
    <p>{{ t('pubgTips.malloc.line1') }}</p>
    <p>{{ t('pubgTips.malloc.line2') }}</p>
    <p>{{ t('pubgTips.malloc.line3') }}</p>
  </PubgTipCard>
</template>
