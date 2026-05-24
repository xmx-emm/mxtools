<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="-malloc=system">
    <p>作用：尝试使用系统内存分配策略，替代游戏默认分配行为。</p>
    <p>影响：部分玩家反馈可降低卡顿或内存异常，但并非所有机器都能复现。</p>
    <p>风险：收益高度依赖版本与系统环境，若出现异常帧波动可关闭该项回退。</p>
  </PubgTipCard>
</template>
