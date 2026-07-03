<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import highPriorityImg from '@/assets/images/apex/high_priority.jpg';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.highPriority.title')">
    <div>
      {{ t('apexTips.highPriority.line1') }}<br/>
      {{ t('apexTips.highPriority.line2') }}
      <ApexImage :src="highPriorityImg"/>
    </div>
  </ApexTipCard>
</template>

<style scoped>

</style>
