<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ApexTipCard from '@/components/game/apex/common/tips/ApexTipCard.vue';
import ApexGammaBrightnessSlider from '@/components/game/apex/video_config/ApexGammaBrightnessSlider.vue';
import ApexGammaPreviewImage from '@/components/game/apex/video_config/ApexGammaPreviewImage.vue';
import gammaPreviewImg from '@/assets/images/apex/gamma_preview_50.jpg';
import apexStore from '@/stores/game/apex.ts';
import { APEX_GAMMA_REFERENCE, gammaToBrightness } from '@/utils/apex_gamma.ts';

const { t } = useI18n();
const apex_store = apexStore();

const previewBrightness = ref(
  gammaToBrightness(apex_store.get_video_config_number('setting.gamma', APEX_GAMMA_REFERENCE)),
);
</script>

<template>
  <ApexTipCard
    :title="t('apexVideoConfig.gamma.name')"
    :subtitle="t('apexVideoConfig.gamma.description')"
  >
    <ApexGammaBrightnessSlider
      v-model="previewBrightness"
      variant="full"
    />

    <ApexGammaPreviewImage
      :src="gammaPreviewImg"
      :alt="t('apexVideoTips.gamma.previewAlt')"
      :brightness="previewBrightness"
    />
    <p class="text-caption text-medium-emphasis mt-2">
      {{ t('apexVideoTips.gamma.previewCaption') }}
    </p>
    <p class="text-medium-emphasis mt-4 mb-0">
      {{ t('apexVideoTips.gamma.description') }}
    </p>
  </ApexTipCard>
</template>
