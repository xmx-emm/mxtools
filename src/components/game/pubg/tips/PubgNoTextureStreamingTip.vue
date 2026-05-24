<script setup lang="ts">
import PubgTipCard from '@/components/game/pubg/tips/PubgTipCard.vue';
</script>

<template>
  <PubgTipCard title="-notexturestreaming">
    <p>作用：尽量禁用纹理流送，倾向一次性加载更多纹理资源。</p>
    <p>影响：可减少“贴图后加载”现象，但会提高显存/内存压力。</p>
    <p>风险：显存不足时可能引发卡顿或爆显存，低显存设备需谨慎开启。</p>
  </PubgTipCard>
</template>
