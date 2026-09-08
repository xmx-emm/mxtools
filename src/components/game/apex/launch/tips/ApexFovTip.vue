<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import fov110Img from '@/assets/images/apex/fov_110.jpg';
import fov120Img from '@/assets/images/apex/fov_120.jpg';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.fov.title')" :subtitle="t('apexTips.fov.subtitle')">
    <template v-slot:text>
      <div class="font-italic text-medium-emphasis">
        {{ t('apexTips.fov.text1') }}
        <br>
        {{ t('apexTips.fov.text2') }}
      </div>
    </template>
    <template v-slot:default>
        <v-row>
          <v-col cols="12" sm="6">
            <ApexImage :src="fov110Img" alt="fov 110"/>
            {{ t('apexTips.fov.label110') }}
          </v-col>
          <v-col cols="12" sm="6">
            <ApexImage :src="fov120Img" alt="fov 120"/>
            {{ t('apexTips.fov.label120') }}
          </v-col>
        </v-row>
    </template>
  </ApexTipCard>
</template>

<style scoped>

</style>
