<script setup lang="ts">
import ApexImage from "@/components/game/apex/common/tips/ApexImage.vue";
import ApexTipCard from "@/components/game/apex/common/tips/ApexTipCard.vue";

const props = defineProps(["src", "alt", "title", "subtitle"])
</script>

<template>
  <ApexTipCard :title="props.title" :subtitle="props.subtitle">
    <ApexImage :src="props.src" :alt="props.alt" class="mx-6 mb-6"/>
  </ApexTipCard>
</template>

<style scoped>

</style>
