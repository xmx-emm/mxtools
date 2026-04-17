<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.ragdollCollide.title')">
    +cl_ragdoll_collide 0<br/>
    {{ t('apexTips.ragdollCollide.line1') }}<br/>
    {{ t('apexTips.ragdollCollide.line2') }}<br/>
    {{ t('apexTips.ragdollCollide.line3') }}<br/>
    {{ t('apexTips.ragdollCollide.line4') }}<br/>
  </ApexTipCard>
</template>

<style scoped>

</style>
