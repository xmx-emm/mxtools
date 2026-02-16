<script setup lang="ts">
import {APEX_FOV_110_IMG_URL, APEX_FOV_120_IMG_URL} from "@/data/imgloc.ts";
import ApexImage from "@/components/game/apex/tips/template/ApexImage.vue";
</script>

<template>
  <v-card title="Apex Fov" subtitle="更广的视角,可以看到更多的信息"
  >
    <template v-slot:text>
      <div class="font-italic" style="color:rgba(var('--v-theme-on-surface'));">
        启用此选项将强制使用fov120模式
        <br>
        在apex设置中最高为fov110
      </div>
    </template>
    <template v-slot:default>
      <v-container>
        <v-row>
          <v-col>
            <ApexImage :src="APEX_FOV_110_IMG_URL" alt="fov 110"/>
            Fov 110
          </v-col>
          <v-col>
            <ApexImage :src="APEX_FOV_120_IMG_URL" alt="fov 120"/>
            Fov 120
          </v-col>
        </v-row>
      </v-container>
    </template>
  </v-card>
</template>

<style scoped>

</style>
