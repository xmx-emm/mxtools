let debugEnabled = import.meta.env.DEV;

export function isDebugEnabled() {
  return debugEnabled;
}

export function setDebugEnabled(v: boolean) {
  debugEnabled = v;
}
