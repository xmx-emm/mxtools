import {defineStore} from 'pinia';
import type {InstalledGameScanReport} from '@/types/game_scan.ts';

export const useRazerGameScanStore = defineStore('razer-game-scan', {
  state: () => ({
    scanReport: null as InstalledGameScanReport | null,
    showOtherGames: false,
    otherSearch: '',
    scanning: false,
  }),
  tauri: {
    autoStart: true,
    filterKeysStrategy: 'pick',
    filterKeys: ['scanReport', 'showOtherGames', 'otherSearch'],
    saveStrategy: 'debounce',
    saveInterval: 600,
  },
});
