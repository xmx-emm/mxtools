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
    filterKeysStrategy: 'pick',
    filterKeys: ['scanReport', 'showOtherGames', 'otherSearch'],
    syncStrategy: 'debounce',
    syncInterval: 200,
    saveOnChange: true,
    saveStrategy: 'debounce',
    saveInterval: 300,
  },
});
