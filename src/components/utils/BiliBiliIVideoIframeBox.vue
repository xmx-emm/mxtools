<script setup lang="ts">
//bilibili 视屏播放Iframe Box
const props = defineProps<{
  src: string
}>()
</script>

<template>
  <iframe
      style="min-height: 400px"
      sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      :src="props.src"
      scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>
</template>

<style scoped>

</style>