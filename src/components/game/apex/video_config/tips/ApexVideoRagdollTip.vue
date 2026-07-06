<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.ragdoll.name')"
    :subtitle="t('apexVideoConfig.ragdoll.description')"
  >
    <p class="text-medium-emphasis mb-0">{{ t('apexVideoTips.ragdoll.description') }}</p>
  </ApexTipCard>
</template>
