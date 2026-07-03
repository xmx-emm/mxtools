<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import showPosImg from '@/assets/images/apex/show_pos.jpg';
import ApexTipByImage from '@/components/game/apex/common/tips/ApexTipByImage.vue';

const { t } = useI18n();
</script>
<template>
  <ApexTipByImage
    :title="t('apexTips.showPos.title')"
    :subtitle="t('apexTips.showPos.subtitle')"
    :src="showPosImg"
  />
</template>

<style scoped>

</style>
