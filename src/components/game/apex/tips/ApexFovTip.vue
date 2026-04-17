<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {APEX_FOV_110_IMG_URL, APEX_FOV_120_IMG_URL} from '@/data/imgloc.ts';
import ApexImage from '@/components/game/apex/common/tips/ApexImage.vue';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';

const { t } = useI18n();
</script>

<template>
  <ApexTipCard :title="t('apexTips.fov.title')" :subtitle="t('apexTips.fov.subtitle')">
    <template v-slot:text>
      <div class="font-italic" style="color:rgba(var('--v-theme-on-surface'));">
        {{ t('apexTips.fov.text1') }}
        <br>
        {{ t('apexTips.fov.text2') }}
      </div>
    </template>
    <template v-slot:default>
        <v-row>
          <v-col>
            <ApexImage :src="APEX_FOV_110_IMG_URL" alt="fov 110"/>
            {{ t('apexTips.fov.label110') }}
          </v-col>
          <v-col>
            <ApexImage :src="APEX_FOV_120_IMG_URL" alt="fov 120"/>
            {{ t('apexTips.fov.label120') }}
          </v-col>
        </v-row>
    </template>
  </ApexTipCard>
</template>

<style scoped>

</style>
