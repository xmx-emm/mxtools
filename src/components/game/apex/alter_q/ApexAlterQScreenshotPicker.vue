<script setup lang="ts">
export interface AlterQScreenshotThumbnail {
  path: string;
  title: string;
  src: string;
}

defineProps<{
  items: AlterQScreenshotThumbnail[];
  selectedPath: string;
}>();

defineEmits<{
  select: [path: string];
}>();
</script>

<template>
  <div v-if="items.length" class="alter-q-screenshot-picker mb-3">
    <div class="text-caption text-medium-emphasis mb-1">
      {{ $t('apex.alterQ.calibrateRecent') }}
    </div>
    <div class="alter-q-screenshot-picker__row">
      <button
        v-for="item in items"
        :key="item.path"
        type="button"
        class="alter-q-screenshot-picker__item"
        :class="{'alter-q-screenshot-picker__item--active': item.path === selectedPath}"
        :title="item.title"
        @click="$emit('select', item.path)"
      >
        <img :src="item.src" :alt="item.title" draggable="false" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.alter-q-screenshot-picker__row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 1px 6px;
}

.alter-q-screenshot-picker__item {
  width: 88px;
  height: 52px;
  flex: 0 0 auto;
  overflow: hidden;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 7px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  cursor: pointer;
}

.alter-q-screenshot-picker__item--active {
  border-color: rgb(var(--v-theme-primary));
}

.alter-q-screenshot-picker__item img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
</style>
