<script setup lang="ts">

import {computed, ref} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {format} from 'date-fns';

const showModifyWindowUpdate = ref(false);

const date = ref(format(new Date(), 'yyyy-MM-dd'));

const diffDays = computed(() => {
  const b = new Date().getTime();
  const a = new Date(date.value).getTime();
  console.log('a', a, b);
  const timeDiff = Math.abs(a - b);
  // 将毫秒差值转换为天数
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
});

async function modifyDay() {
  console.log('dayDiff', diffDays.value);
  const days = diffDays.value;
  await invoke('modify_windows_update_time', { days: days });
}
</script>

<template>
  <div>
    <v-btn @click="showModifyWindowUpdate=true">Modify Window update day</v-btn>
    <v-bottom-sheet v-model="showModifyWindowUpdate" inset>
      <v-card class="text-center" height="200">
        <v-card-text>
          <v-btn
            text="Close"
            variant="text"
            @click="showModifyWindowUpdate = !showModifyWindowUpdate"
          ></v-btn>
          <v-btn
            text="Confirm"
            variant="text"
            @click="modifyDay"
          >
          </v-btn>
          <br>
          <input type="date" name="trip-start" v-model="date">
          {{ date }}
        </v-card-text>
      </v-card>
    </v-bottom-sheet>
  </div>
</template>

<style scoped>

</style>
