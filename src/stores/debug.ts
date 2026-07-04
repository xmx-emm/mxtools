import {defineStore} from 'pinia';

export const useDebugStore = defineStore('debug', {
  state: () => ({
    /** 调试模式：控制前端 console 调试输出 */
    enabled: import.meta.env.DEV,
  }),
  getters: {
    isEnabled: (state) => state.enabled,
  },
  actions: {
    setEnabled(value: boolean | null) {
      this.enabled = value ?? false;
    },
  },
  tauri: {autoStart: true},
});
