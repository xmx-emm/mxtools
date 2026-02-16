<script setup lang="ts">
const props = defineProps(["src", "alt"])
</script>

<template>
  <v-img :src="props.src" :alt="props.alt" lazy-src="https://picsum.photos/100/60/?blur=2">
    <template v-slot:placeholder>
      <div class="d-flex align-center justify-center fill-height">
        <v-progress-circular
            color="grey-lighten-4"
            indeterminate
        ></v-progress-circular>
      </div>
    </template>
  </v-img>
</template>

<style scoped>

</style>