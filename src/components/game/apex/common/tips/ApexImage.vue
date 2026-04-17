<script setup lang="ts">
import { useAttrs } from 'vue';
import ZoomableImage from '@/components/common/ZoomableImage.vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  src: string;
  alt?: string;
  lazySrc?: string;
  previewable?: boolean;
}>(), {
  previewable: true,
});

const attrs = useAttrs();
</script>

<template>
  <ZoomableImage
    v-bind="attrs"
    :src="props.src"
    :alt="props.alt"
    :lazy-src="props.lazySrc"
    :previewable="props.previewable"
  >
    <template v-if="$slots.placeholder" #placeholder>
      <slot name="placeholder" />
    </template>
  </ZoomableImage>
</template>
