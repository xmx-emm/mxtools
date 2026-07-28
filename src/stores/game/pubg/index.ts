import {defineStore} from 'pinia';
import {pubgLaunchActions} from './actions_launch.ts';
import {pubgGetters} from './getters.ts';
import {createPubgState} from './state.ts';

export const usePubgStore = defineStore('pubg', {
  state: createPubgState,
  actions: {
    ...pubgLaunchActions,
  },
  getters: pubgGetters,
});
