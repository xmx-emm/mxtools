<script setup lang="ts">
withDefaults(defineProps<{
  size?: number | string
}>(), {
  size: 24
});
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 614 614"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <circle cx="307" cy="307" r="307" fill="#255AF6" />
    <path
      fill="#FFFFFF"
      d="M395.5 190L292.5 357L166 357L195 313.5L267.5 313.5L292.5 274L127 274L105 313.5L147 313.5L88 400.5L314 400.5L395.5 274L425.5 313.5L395.5 313.5L371.5 357L453.5 357L480 400.5L533.5 400.5L395.5 190Z"
    />
    <path
      fill="#FFFFFF"
      d="M354 190L182 190L160 229L332 229L354 190Z"
    />
  </svg>
</template>
