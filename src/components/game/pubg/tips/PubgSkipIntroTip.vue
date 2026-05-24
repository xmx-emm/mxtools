<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="跳过开场动画">
    <p>本项在本工具中通过重命名 `Movies` 目录实现，不依赖单一启动参数。</p>
    <p>作用：减少开场动画等待时间，缩短进入主菜单前的加载路径。</p>
    <p>风险：游戏更新/文件校验后目录可能被恢复，需重新检查状态。</p>
  </PubgTipCard>
</template>
