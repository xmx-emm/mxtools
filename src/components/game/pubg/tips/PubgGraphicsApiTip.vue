<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="图形 API(DX)">
    <p>作用：切换图形后端(如 DX10/DX11/DX12)，在兼容性与性能之间做取舍。</p>
    <p>影响：低版本 API 往往更稳但画质/特性可能受限；高版本 API 可能带来更好利用率，也可能更挑驱动。</p>
    <p>建议：出现闪退、黑屏、卡顿峰值时，可切换 API 做 A/B 对比。</p>
  </PubgTipCard>
</template>
