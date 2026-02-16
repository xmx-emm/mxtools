<script setup lang="ts">

const props = defineProps(['registry_file']);
const emits = defineEmits(['openFolder']);
</script>
<template>
  <div class="d-flex flex-column">
    <span>Backups explorer registry ok!</span>
    <span
      @click.stop="emits('openFolder',{file:props.registry_file})"
      style="color: rgb(var('--v-theme-error')); cursor: pointer;"
      class="text-orange use_select"
    >{{ props.registry_file }}</span>
  </div>
</template>

<style scoped>

</style>
