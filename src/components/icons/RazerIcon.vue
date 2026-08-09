<script setup lang="ts">
import razerLogoIcon from '@/assets/images/brands/razer-logo-icon.png';

withDefaults(defineProps<{
  size?: number | string
}>(), {
  size: 24,
});
</script>

<template>
  <img
    class="razer-icon"
    :src="razerLogoIcon"
    :width="size"
    :height="size"
    alt=""
    aria-hidden="true"
  >
</template>

<style scoped>
.razer-icon {
  display: block;
  object-fit: contain;
}
</style>
