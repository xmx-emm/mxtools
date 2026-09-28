import {computed} from 'vue';
import packageInfo from '../package.json';

export const version = computed(() => {
  return packageInfo.version;
});
