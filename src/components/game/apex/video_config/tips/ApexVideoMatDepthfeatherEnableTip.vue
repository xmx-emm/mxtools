<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexVideoConfig.matDepthfeatherEnable.name')">
    <p class="text-medium-emphasis">{{ t('apexVideoTips.placeholder') }}</p>
  </ApexTipCard>
</template>
