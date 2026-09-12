import {createPinia, setActivePinia} from 'pinia';
import {expect, it} from 'vitest';
import {useRazerGameScanStore} from '@/stores/razer_game_scan.ts';
import {mergeScannedGame} from '@/utils/razer_polling_config.ts';
import type {RazerBackgroundConfig} from '@/types/background_runtime.ts';

it('retains scanned games, expansion and search when the page obtains its store again', () => {
  setActivePinia(createPinia());
  const store = useRazerGameScanStore();
  store.scanReport = {games: [], sources: []};
  store.showOtherGames = true;
  store.otherSearch = 'Game';
  const reopened = useRazerGameScanStore();
  expect(reopened.scanReport).toEqual({games: [], sources: []});
  expect(reopened.showOtherGames).toBe(true);
  expect(reopened.otherSearch).toBe('Game');
});

it('adds an unresolved scanned game as disabled until its executable is supplied', () => {
  const config: RazerBackgroundConfig = {enabled: false, deviceProfiles: {}, games: []};
  mergeScannedGame(config, {logicalId: 'other', name: 'Other', isShooter: false, sources: ['steam'], installations: [], matchers: []}, [], true);
  expect(config.games[0]).toMatchObject({id: 'other', enabled: false, matchers: [], userEdited: true});
});
