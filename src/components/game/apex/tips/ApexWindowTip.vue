<script setup lang="ts">

</script>

<template>
  <v-card title="窗口模式">
    <div class="mx-6">
      全屏：系统会为独占的全屏游戏开启一系列优化，并可能将更多CPU调度资源分配给前台游戏。<br/>
      <br/>
      无边框/窗口：在Win10/11中，系统对前台无边框游戏有部分优化（如“全屏优化”），但仍无法完全达到真全屏的性能水平(和全屏差个几帧)。<br/>
      <br/>
      建议使用 无边框/窗口 模式 可以避免切换应用出现的黑屏以及窗口切换时游戏卡顿
      <br/>
      <p class="error_color">tips: 如果需要锁定FPS需要无边框或是窗口模式</p>
    </div>
  </v-card>
</template>

<style scoped>

</style>