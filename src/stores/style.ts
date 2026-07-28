import {defineStore} from 'pinia';
import {nextTick, ref} from 'vue';
import {isDarkStyle} from '@/utils/ui.ts';
import {DEFAULT_ACCENT, findAccent, persistAccentHint} from '@/themes.ts';
import {applyAccentTheme} from '@/vuetify.ts';

export interface ThemeTransitionOrigin {
  x: number;
  y: number;
}

type ThemeTransitionKind = 'theme' | 'accent';

interface ViewTransitionLike {
  finished: Promise<unknown>;
  skipTransition?: () => void;
}

interface ViewTransitionCapability {
  startViewTransition?: (
    updateCallback: () => void | Promise<void>,
  ) => ViewTransitionLike;
}

const VIEW_TRANSITION_ATTRIBUTE = 'data-mx-theme-transition';
const FALLBACK_TRANSITION_ATTRIBUTE = 'data-mx-theme-transition-fallback';
const VIEW_TRANSITION_PROPERTIES = [
  '--mx-theme-transition-x',
  '--mx-theme-transition-y',
  '--mx-theme-transition-radius',
  '--mx-theme-transition-duration',
] as const;

let activeViewTransition: ViewTransitionLike | null = null;
let fallbackCleanupTimer: ReturnType<typeof setTimeout> | null = null;

function readSystemTheme(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return isDarkStyle();
  } catch {
    return false;
  }
}

const systemPrefersDark = ref(readSystemTheme());

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function transitionOrigin(
  root: HTMLElement,
  requested?: ThemeTransitionOrigin,
): ThemeTransitionOrigin {
  const viewportWidth = Math.max(window.innerWidth || root.clientWidth, 1);
  const viewportHeight = Math.max(window.innerHeight || root.clientHeight, 1);
  let candidate = requested;

  if (
    !candidate ||
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y)
  ) {
    const focused = document.activeElement;
    if (typeof Element !== 'undefined' && focused instanceof Element) {
      const rect = focused.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        candidate = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    }
  }

  return {
    x: Math.min(Math.max(candidate?.x ?? viewportWidth / 2, 0), viewportWidth),
    y: Math.min(Math.max(candidate?.y ?? viewportHeight / 2, 0), viewportHeight),
  };
}

function clearViewTransitionGeometry(root: HTMLElement) {
  root.removeAttribute(VIEW_TRANSITION_ATTRIBUTE);
  for (const property of VIEW_TRANSITION_PROPERTIES) {
    root.style.removeProperty(property);
  }
}

function setViewTransitionGeometry(
  root: HTMLElement,
  kind: ThemeTransitionKind,
  requestedOrigin?: ThemeTransitionOrigin,
) {
  const origin = transitionOrigin(root, requestedOrigin);
  const viewportWidth = Math.max(window.innerWidth || root.clientWidth, 1);
  const viewportHeight = Math.max(window.innerHeight || root.clientHeight, 1);
  const radius = Math.ceil(Math.hypot(
    Math.max(origin.x, viewportWidth - origin.x),
    Math.max(origin.y, viewportHeight - origin.y),
  )) + 2;

  root.setAttribute(VIEW_TRANSITION_ATTRIBUTE, kind);
  root.style.setProperty('--mx-theme-transition-x', `${origin.x}px`);
  root.style.setProperty('--mx-theme-transition-y', `${origin.y}px`);
  root.style.setProperty('--mx-theme-transition-radius', `${radius}px`);
  root.style.setProperty(
    '--mx-theme-transition-duration',
    kind === 'accent' ? '420ms' : '520ms',
  );
}

async function applyWithoutTransition(update: () => void) {
  update();
  await nextTick();
}

async function applyFallbackTransition(
  update: () => void,
  kind: ThemeTransitionKind,
) {
  if (typeof document === 'undefined') {
    await applyWithoutTransition(update);
    return;
  }

  const root = document.documentElement;
  if (fallbackCleanupTimer !== null) {
    clearTimeout(fallbackCleanupTimer);
    fallbackCleanupTimer = null;
  }
  root.removeAttribute(FALLBACK_TRANSITION_ATTRIBUTE);
  void root.offsetWidth;
  root.setAttribute(FALLBACK_TRANSITION_ATTRIBUTE, kind);
  await applyWithoutTransition(update);

  fallbackCleanupTimer = setTimeout(() => {
    root.removeAttribute(FALLBACK_TRANSITION_ATTRIBUTE);
    fallbackCleanupTimer = null;
  }, kind === 'accent' ? 260 : 320);
}

async function applyThemeTransition(
  update: () => void,
  kind: ThemeTransitionKind,
  origin?: ThemeTransitionOrigin,
) {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    prefersReducedMotion()
  ) {
    await applyWithoutTransition(update);
    return;
  }

  const transitionDocument = document as unknown as ViewTransitionCapability;
  if (typeof transitionDocument.startViewTransition !== 'function') {
    await applyFallbackTransition(update, kind);
    return;
  }

  const root = document.documentElement;
  activeViewTransition?.skipTransition?.();
  setViewTransitionGeometry(root, kind, origin);

  let didUpdate = false;
  let transition: ViewTransitionLike;
  try {
    transition = transitionDocument.startViewTransition(async () => {
      didUpdate = true;
      await applyWithoutTransition(update);
    });
  } catch {
    clearViewTransitionGeometry(root);
    if (!didUpdate) await applyFallbackTransition(update, kind);
    return;
  }

  activeViewTransition = transition;
  try {
    await transition.finished;
  } catch {
    // A newer theme selection can intentionally skip this transition.
  } finally {
    if (activeViewTransition === transition) {
      activeViewTransition = null;
      clearViewTransitionGeometry(root);
    }
  }
}

function persistThemeHint(resolved: string) {
  try {
    localStorage.setItem('mx-theme', resolved);
  } catch { /* localStorage may be unavailable */
  }
}

function persistThemePreference(preference: string) {
  try {
    localStorage.setItem('mx-theme-preference', preference);
  } catch { /* localStorage may be unavailable */
  }
}

export const useUiStyleStore = defineStore('uiStyle', {
    state: () => ({
      theme: 'system',
      accent: DEFAULT_ACCENT,
    }),
    actions: {
      persistThemeHints() {
        const resolved = this.themeStyle;
        persistThemePreference(this.theme);
        persistThemeHint(resolved);
        persistAccentHint(findAccent(this.accent), resolved === 'dark');
      },
      async setTheme(t: string, origin?: ThemeTransitionOrigin) {
        const currentResolvedTheme = this.themeStyle;
        const nextResolvedTheme = t === 'system'
          ? (systemPrefersDark.value ? 'dark' : 'light')
          : t;
        const update = () => {
          this.theme = t;
          this.persistThemeHints();
        };

        if (t === this.theme || nextResolvedTheme === currentResolvedTheme) {
          await applyWithoutTransition(update);
          return;
        }
        await applyThemeTransition(update, 'theme', origin);
      },
      async setAccent(id: string, origin?: ThemeTransitionOrigin) {
        if (id === this.accent) return;
        await applyThemeTransition(() => {
          this.accent = id;
          applyAccentTheme(id);
          const isDark = this.themeStyle === 'dark';
          persistAccentHint(findAccent(id), isDark);
        }, 'accent', origin);
      },
      watchSystemTheme() {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
          return () => undefined;
        }
        let mediaQuery: MediaQueryList;
        try {
          mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        } catch {
          return () => undefined;
        }
        let initialized = false;
        const applySystemTheme = (matches: boolean) => {
          const update = () => {
            systemPrefersDark.value = matches;
            if (this.theme === 'system') this.persistThemeHints();
          };
          const shouldAnimate = initialized &&
            this.theme === 'system' &&
            systemPrefersDark.value !== matches;
          initialized = true;
          if (shouldAnimate) void applyThemeTransition(update, 'theme');
          else update();
        };
        const onChange = (event: MediaQueryListEvent) => applySystemTheme(event.matches);

        applySystemTheme(mediaQuery.matches);
        if (typeof mediaQuery.addEventListener === 'function') {
          mediaQuery.addEventListener('change', onChange);
        } else if (typeof mediaQuery.addListener === 'function') {
          mediaQuery.addListener(onChange);
        }

        return () => {
          if (typeof mediaQuery.removeEventListener === 'function') {
            mediaQuery.removeEventListener('change', onChange);
          } else if (typeof mediaQuery.removeListener === 'function') {
            mediaQuery.removeListener(onChange);
          }
        };
      },
    },
    getters: {
      themeStyle: (state): string => {
        if (state.theme === 'system') {
          return systemPrefersDark.value ? 'dark' : 'light';
        }
        return state.theme;
      },
      isDark(): boolean {
        return this.themeStyle === 'dark';
      },
    },
    tauri: {
      syncStrategy: 'debounce',
      syncInterval: 300,
      saveStrategy: 'debounce',
      saveInterval: 500,
    },
  }
);
