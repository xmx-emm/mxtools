<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="+mat_antialias 0">
    <p>作用：关闭或降低抗锯齿相关开销，优先换取帧数。</p>
    <p>影响：边缘会更锯齿、画面更“硬”，但在部分场景可减少 GPU 负担。</p>
    <p>风险：视觉质量下降明显；且不同版本对该参数的支持度可能不一致。</p>
  </PubgTipCard>
</template>
