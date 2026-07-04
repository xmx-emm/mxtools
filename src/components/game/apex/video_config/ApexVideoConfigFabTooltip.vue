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
</script>

<template>
  <div
    class="apex-fab-tooltip-activator"
    :title="disabled ? undefined : t(hintKey)"
  >
    <slot />
  </div>
</template>

<style scoped>
.apex-fab-tooltip-activator {
  position: relative;
}
</style>
