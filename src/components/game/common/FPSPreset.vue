<script setup lang="ts">
import {computed} from 'vue';
import {
  common_refresh_rate_presets,
  sorted_refresh_rate_presets,
} from '@/data/presets/game_refresh_rate_presets.ts';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    unitLabel?: string;
  }>(),
  {
    unitLabel: 'FPS',
  },
);

const emit = defineEmits<{
  'update:modelValue': [v: number];
}>();

const sorted_values = computed(() => sorted_refresh_rate_presets(common_refresh_rate_presets));

function apply(value: number) {
  emit('update:modelValue', value);
}

const activator_title = computed(() => `${props.modelValue} ${props.unitLabel}`);
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
    <template #activator="{ props: menuProps }">
      <div class="preset_hover_box" v-bind="menuProps">
        <span class="preset_hover_text">{{ activator_title }}</span>
      </div>
    </template>
    <v-list>
      <v-list-item
        v-for="item in sorted_values"
        :key="item"
        :title="`${item} ${unitLabel}`"
        :active="item === modelValue"
        @click="apply(item)"
      />
    </v-list>
  </v-menu>
</template>
