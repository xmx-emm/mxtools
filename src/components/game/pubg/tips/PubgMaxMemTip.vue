<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="-maxMem=X">
    <p>作用：设置可用内存上限（单位 MB），用于限制或引导游戏内存占用。</p>
    <p>影响：合适数值可能减少极端内存占用，过低会导致频繁换页与卡顿。</p>
    <p>建议：通常保留系统与后台余量，不要把总内存几乎全部分配给游戏。</p>
  </PubgTipCard>
</template>
