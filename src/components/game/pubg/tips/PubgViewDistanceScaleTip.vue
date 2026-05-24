<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="+r.ViewDistanceScale=X">
    <p>作用：调整远景渲染比例，范围越低通常越省性能。</p>
    <p>影响：较低值可能提升帧率与帧稳定性，但远处细节会变差。</p>
    <p>建议：从 1.0 逐步下调到 0.8/0.7 进行对比，避免一次降得过低。</p>
  </PubgTipCard>
</template>
