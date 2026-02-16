import {computed} from 'vue';

export const version = computed(() => {
  return import.meta.env.VITE_APP_VERSION;
});
