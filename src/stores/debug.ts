import {defineStore} from 'pinia';

export const useDebugStore = defineStore('debug', {
  state: () => ({
    /** 游戏相关调试日志开关 */
    game: false,
  }),
  actions: {
    setGame(value: boolean | null) {
      this.game = value ?? false;
    },
  },
  tauri: {autoStart: true},
});
