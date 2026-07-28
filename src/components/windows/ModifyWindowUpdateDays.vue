<script setup lang="ts">

import {computed, ref} from 'vue';
import {modifyWindowsUpdateTime} from '@/ipc/commands.ts';

const showModifyWindowUpdate = ref(false);

const toDateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const date = ref(toDateInputValue(new Date()));

const diffDays = computed(() => {
  const b = new Date().getTime();
  const a = new Date(date.value).getTime();
  const timeDiff = Math.abs(a - b);
  // 将毫秒差值转换为天数
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
});

async function modifyDay() {
  const days = diffDays.value;
  await modifyWindowsUpdateTime({ days: days });
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
