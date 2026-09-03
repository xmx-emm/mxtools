import {reactive} from 'vue';
import type {ApexQPrefs} from '@/types/apex_q.ts';
import {loadApexQPrefs} from '@/stores/apex_q_preferences.ts';

function clonePrefs(value: ApexQPrefs): ApexQPrefs {
  return JSON.parse(JSON.stringify(value)) as ApexQPrefs;
}

/** Owns the editable preference model and its detached cross-WebView baseline. */
export function useApexQPreferencesController() {
  const initial = loadApexQPrefs();
  const prefs = reactive<ApexQPrefs>(clonePrefs(initial));
  let baseline = clonePrefs(initial);

  function clone(value: ApexQPrefs): ApexQPrefs {
    return clonePrefs(value);
  }

  function changedKeys(next: ApexQPrefs): Array<keyof ApexQPrefs> {
    return (Object.keys(next) as Array<keyof ApexQPrefs>).filter(
      key => JSON.stringify(next[key]) !== JSON.stringify(baseline[key]),
    );
  }

  function setBaseline(next: ApexQPrefs) {
    baseline = clonePrefs(next);
  }

  function patchBaseline(next: Partial<ApexQPrefs>) {
    baseline = clonePrefs({...baseline, ...next});
  }

  function adopt(next: ApexQPrefs) {
    setBaseline(next);
    Object.assign(prefs, next);
  }

  return {prefs, clone, changedKeys, setBaseline, patchBaseline, adopt};
}
