import {reactive} from 'vue';
import type {AlterQPrefs} from '@/types/alter_q.ts';
import {loadAlterQPrefs} from '@/types/alter_q.ts';

function clonePrefs(value: AlterQPrefs): AlterQPrefs {
  return JSON.parse(JSON.stringify(value)) as AlterQPrefs;
}

/** Owns the editable preference model and its detached cross-WebView baseline. */
export function useAlterQPreferencesController() {
  const initial = loadAlterQPrefs();
  const prefs = reactive<AlterQPrefs>(clonePrefs(initial));
  let baseline = clonePrefs(initial);

  function clone(value: AlterQPrefs): AlterQPrefs {
    return clonePrefs(value);
  }

  function changedKeys(next: AlterQPrefs): Array<keyof AlterQPrefs> {
    return (Object.keys(next) as Array<keyof AlterQPrefs>).filter(
      key => JSON.stringify(next[key]) !== JSON.stringify(baseline[key]),
    );
  }

  function setBaseline(next: AlterQPrefs) {
    baseline = clonePrefs(next);
  }

  function patchBaseline(next: Partial<AlterQPrefs>) {
    baseline = clonePrefs({...baseline, ...next});
  }

  function adopt(next: AlterQPrefs) {
    setBaseline(next);
    Object.assign(prefs, next);
  }

  return {prefs, clone, changedKeys, setBaseline, patchBaseline, adopt};
}
