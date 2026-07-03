<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.forceNoVSync.title')">
    <div>
      {{ t('apexTips.forceNoVSync.line1') }}
      <br/>
      <p class="error_color">{{ t('apexTips.forceNoVSync.warning') }}</p>
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>
