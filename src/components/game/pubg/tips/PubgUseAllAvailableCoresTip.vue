<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="-USEALLAVAILABLECORES">
    <p>作用：请求引擎尽量使用全部可用 CPU 核心。</p>
    <p>影响：在旧平台或线程调度不理想场景，可能有帮助；新版本/新硬件上提升不稳定。</p>
    <p>风险：不是所有版本都明显生效，属于“可能有效”的兼容参数，建议开关对比测试。</p>
  </PubgTipCard>
</template>
