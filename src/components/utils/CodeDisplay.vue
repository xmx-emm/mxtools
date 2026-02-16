<script setup lang="ts">
import {ref} from "vue";

function copy_to_clipboard(text: string) {
  written_to_clipboard.value = true
  navigator.clipboard.writeText(text);
  setTimeout(() => {
    written_to_clipboard.value = false
  }, 800)
}

const written_to_clipboard = ref(false);

const props = defineProps(["title", "code"]);
</script>

<template>
  <div style="background: #121212FF;border-radius: 8px;width: 100%">
    <div class="d-flex flex-row title">
      <p>{{ props.title }}</p>
      <v-spacer></v-spacer>
      <div class="copy_button" v-if="props.code">
        <v-icon
            class="ma-2"
            :color="written_to_clipboard ? 'red-lighten-2' : 'orange-darken-2'"
            :icon="written_to_clipboard ? 'mdi-clipboard-check-outline' : 'mdi-clipboard-outline'"
            variant="text"
            size="x-small"
            @click="copy_to_clipboard(props.code)"
        ></v-icon>
      </div>
    </div>
    <v-divider></v-divider>
    <div style="font-size: 13px;padding: 6px;color: #888888">
      <slot/>
    </div>
  </div>
</template>
<style lang="scss">
.title {
  align-items: center;
  background: #585db6;
  padding: 5px;
  border-radius: 8px 8px 4px 4px;

  .copy_button {
    border-radius: 25px;
    background: rgb(97, 108, 248);
    height: 25px;
    width: 25px;
    display: flex;
    justify-content: center;
    cursor: pointer;
    align-items: center;
  }
}
</style>