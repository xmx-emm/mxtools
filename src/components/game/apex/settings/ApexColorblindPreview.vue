<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';

const props = defineProps<{value: string}>();
const {t} = useI18n();

const palettes: Record<string, string[]> = {
  '0': ['#FF2D0D', '#F5A523', '#7DAF0A', '#0AB4B4', '#C0C0C0', '#1E90FF', '#7D00FF', '#FFCD3C', '#FF4E1D'],
  '1': ['#E4C900', '#FFF31F', '#0B91FD', '#916F3E', '#484848', '#003E76', '#9D84F2', '#FAF34C', '#FF6DA4'],
  '2': ['#FFA0AD', '#E69F00', '#009E73', '#56B4E9', '#484848', '#004BBB', '#E2AFFF', '#FFAE40', '#FF3228'],
  '3': ['#D2BE11', '#FFEC36', '#31FCFF', '#916870', '#808080', '#28C4FF', '#A92DF8', '#FAD450', '#CF464A'],
};

const labels = [
  'enemy', 'squad1', 'squad2', 'squad3', 'lootCommon', 'lootRare', 'lootEpic', 'lootLegendary', 'lootMythic',
];
const colors = computed(() => palettes[props.value] ?? palettes['0']);
</script>

<template>
  <div class="colorblind-preview">
    <div v-for="(label, index) in labels" :key="label" class="colorblind-preview-row">
      <span class="colorblind-swatch" :style="{backgroundColor: colors[index]}" />
      <span>{{ t(`apexGameSettings.colorblindPreview.${label}`) }}</span>
    </div>
  </div>
</template>

<style scoped>
.colorblind-preview {
  display: grid;
  gap: 4px;
  margin-top: 18px;
}

.colorblind-preview-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  min-height: 32px;
  font-size: 15px;
}

.colorblind-swatch {
  width: 64px;
  height: 32px;
}
</style>
