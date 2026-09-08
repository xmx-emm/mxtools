<script setup lang="ts">
//bilibili 视屏播放Iframe Box
const props = defineProps<{
  src: string
}>();
</script>

<template>
  <iframe
    class="bilibili-video-frame"
    sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    :src="props.src"
    scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>
</template>

<style scoped>
.bilibili-video-frame {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 0;
}
</style>
