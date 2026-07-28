export type LocaleMessageTree = Record<string, unknown>;

type LocaleModule = {
  default: LocaleMessageTree;
};

export function createLocaleMessageLoader<Locale extends string>(options: {
  loaders: Record<Locale, () => Promise<LocaleModule>>;
  install: (locale: Locale, messages: LocaleMessageTree) => void;
  activate: (locale: Locale) => void;
}) {
  const pending = new Map<Locale, Promise<LocaleMessageTree>>();
  const loaded = new Set<Locale>();
  let activationGeneration = 0;

  async function load(locale: Locale): Promise<LocaleMessageTree> {
    const existing = pending.get(locale);
    if (existing) return existing;

    const request = options.loaders[locale]()
      .then((module) => {
        options.install(locale, module.default);
        loaded.add(locale);
        return module.default;
      })
      .catch((error) => {
        pending.delete(locale);
        loaded.delete(locale);
        throw error;
      });
    pending.set(locale, request);
    return request;
  }

  async function set(locale: Locale): Promise<boolean> {
    const generation = ++activationGeneration;
    await load(locale);
    if (generation !== activationGeneration) return false;
    options.activate(locale);
    return true;
  }

  return {
    load,
    set,
    isLoaded: (locale: Locale) => loaded.has(locale),
  };
}
