<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="-high">
    <p>作用：尝试让游戏进程以更高调度优先级运行，减少被后台程序抢占 CPU 时间。</p>
    <p>影响：在后台任务较多时，可能带来更平稳的帧时间；也可能基本无感。</p>
    <p>风险：可能导致其它程序响应变慢。属于社区经验项，建议结合你自己的系统实测。</p>
  </PubgTipCard>
</template>
