<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="鼠标输入优化（组合参数）">
    <p>参数：<code>-m_mousespeed 0</code>、<code>-m_mouseaccel1 0</code>、<code>-m_mouseaccel2 0</code>。</p>
    <p>作用：关闭加速曲线并固定鼠标速度，追求更线性的瞄准手感。</p>
    <p>风险：会改变原有肌肉记忆；若你依赖系统加速或习惯旧手感，可能觉得更“飘”或更“钝”。</p>
  </PubgTipCard>
</template>
