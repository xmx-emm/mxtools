<script setup lang="ts">
const props = defineProps<{
  src: string
}>();
import BiliBiliIVideoIframeBox from '@/components/utils/BiliBiliIVideoIframeBox.vue';
</script>

<template>
  <BiliBiliIVideoIframeBox :src="props.src" style="width: 100%"/>
</template>
