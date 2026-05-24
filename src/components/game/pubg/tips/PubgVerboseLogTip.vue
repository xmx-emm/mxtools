<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="-log">
    <p>作用：输出更详细日志，便于排查闪退、报错或启动异常。</p>
    <p>影响：调试阶段很有用，能提供更完整上下文。</p>
    <p>风险：日志文件增长更快，长期常开会增加磁盘写入与占用。</p>
  </PubgTipCard>
</template>
