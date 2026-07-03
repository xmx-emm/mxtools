<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';

const props = defineProps<{
  kind: 'lock' | 'individual';
  disabled?: boolean;
  side?: 'left' | 'right';
}>();

const {t} = useI18n();

const hintKey = computed(() =>
  props.kind === 'lock' ? 'apex.fabHintLock' : 'apex.fabHintIndividual',
);

const location = computed(() => (props.side === 'left' ? 'end' : 'start'));
</script>

<template>
  <v-tooltip
    :text="t(hintKey)"
    :location="location"
    :open-delay="400"
    :disabled="disabled"
    max-width="280"
  >
    <template #activator="{ props: tipProps }">
      <div v-bind="tipProps" class="apex-fab-tooltip-activator">
        <slot />
      </div>
    </template>
  </v-tooltip>
</template>

<style scoped>
.apex-fab-tooltip-activator {
  position: relative;
}
</style>
