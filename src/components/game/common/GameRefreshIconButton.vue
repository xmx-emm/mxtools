<script setup lang="ts">
import {computed, onUnmounted, ref, watch} from 'vue';

const props = defineProps<{
  loading: boolean;
  title: string;
  disabled?: boolean;
}>();

defineEmits<{
  click: [];
  contextmenu: [e: MouseEvent];
}>();

type IconPhase = 'idle' | 'loading' | 'success';

const phase = ref<IconPhase>('idle');
let successTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.loading,
  (loading, prevLoading) => {
    if (loading) {
      if (successTimer) {
        clearTimeout(successTimer);
        successTimer = null;
      }
      phase.value = 'loading';
      return;
    }
    if (prevLoading) {
      phase.value = 'success';
      successTimer = setTimeout(() => {
        phase.value = 'idle';
        successTimer = null;
      }, 500);
    }
  },
);

onUnmounted(() => {
  if (successTimer) {
    clearTimeout(successTimer);
  }
});

const icon = computed(() => (phase.value === 'success' ? 'mdi-check' : 'mdi-refresh'));

const iconClass = computed(() => ({
  'game-refresh-icon--spin': phase.value === 'loading',
  'game-refresh-icon--success': phase.value === 'success',
}));
</script>

<template>
  <v-btn
    icon
    size="small"
    :title="title"
    :disabled="disabled || loading"
    @click="$emit('click')"
    @contextmenu.prevent="$emit('contextmenu', $event)"
  >
    <v-icon :icon="icon" :class="iconClass" />
  </v-btn>
</template>

<style scoped>
.game-refresh-icon--spin {
  animation: game-refresh-spin 0.8s linear infinite;
}

.game-refresh-icon--success {
  color: rgb(var(--v-theme-success));
}

@keyframes game-refresh-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
