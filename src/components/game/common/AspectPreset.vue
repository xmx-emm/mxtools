<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import {
  findAspectPresetByValue,
  sortedAspectPresets,
} from '@/data/presets/apex_quick_preset.ts';

const props = defineProps<{
  min: number;
  goal: number;
}>();

const emit = defineEmits<{
  apply: [aspectValue: number];
}>();

const { t } = useI18n();

const sorted = computed(() => sortedAspectPresets());

const selected_title = computed(() => {
  if (props.min !== props.goal) {
    return t('apexQuickPreset.aspectPreset');
  }
  const preset = findAspectPresetByValue(props.min);
  return preset ? t(preset.label) : t('apexQuickPreset.aspectPreset');
});

function is_active(value: number) {
  return props.min === value && props.goal === value;
}
</script>

<template>
  <v-menu
    closeOnBack
    :open-on-click="false"
    openOnHover
    openDelay="150"
    closeDelay="100"
    content-class="compact-menu preset-compact-menu"
  >
    <template v-slot:activator="{ props: menuProps }">
      <div class="preset_hover_box" v-bind="menuProps">
        <span class="preset_hover_text">{{ selected_title }}</span>
      </div>
    </template>
    <v-list>
      <v-list-item
        v-for="item in sorted"
        :key="item.aspectValue"
        :title="t(item.label)"
        :active="is_active(item.aspectValue)"
        @click="emit('apply', item.aspectValue)"
      />
    </v-list>
  </v-menu>
</template>
