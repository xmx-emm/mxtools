<script setup lang="ts">
import {useI18n} from 'vue-i18n';

const props = defineProps(['registry_file']);
const emits = defineEmits(['openFolder']);
const {t} = useI18n();
</script>
<template>
  <div class="d-flex flex-column">
    <span>{{ t('explorer.backupSuccess') }}</span>
    <button
      type="button"
      class="backup-location text-left use_select"
      @click.stop="emits('openFolder',{file:props.registry_file})"
    >
      {{ props.registry_file }}
    </button>
  </div>
</template>

<style scoped>
.backup-location {
  width: fit-content;
  max-width: 100%;
  padding: 0;
  overflow-wrap: anywhere;
  color: rgb(var(--v-theme-primary));
  font: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.backup-location:hover {
  text-decoration: underline;
}

.backup-location:focus-visible {
  border-radius: 3px;
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
