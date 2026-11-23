// Interface language and content language are independent (brief, stage 4). The interface language picks the locale file
// for the app's own strings; the content language picks which language of a record to show. Every string the app shows
// comes from a locale file; a missing key shows the key itself and is logged, so it cannot go unnoticed.

export const LANGUAGES = { en: 'English', fr: 'Français' };
export const DEFAULT_UI_LANGUAGE = 'en';
export const DEFAULT_CONTENT_LANGUAGE = 'en';
export const SETTINGS_KEY = 'cl_settings';

/** The language to use for a browser's preferred list, falling back to English. */
export function resolveLanguage(preferred, available = Object.keys(LANGUAGES)) {
  for (const tag of preferred ?? []) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (available.includes(base)) return base;
  }
  return DEFAULT_UI_LANGUAGE;
}

export function createI18n({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = './',
  storage,
  onMissing = () => {},
} = {}) {
  const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  let strings = {};
  let uiLanguage = DEFAULT_UI_LANGUAGE;

  const readSettings = () => {
    try {
      return JSON.parse(store?.getItem(SETTINGS_KEY) ?? '{}') ?? {};
    } catch {
      return {};
    }
  };
  const writeSettings = (patch) => {
    try {
      store?.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...patch }));
    } catch {
      // ignore: the setting simply does not persist
    }
  };

  async function load(language) {
    const lang = Object.hasOwn(LANGUAGES, language) ? language : DEFAULT_UI_LANGUAGE;
    const response = await fetchImpl(`${baseUrl}locales/${lang}.json`);
    if (!response.ok) throw new Error(`Could not load the ${lang} strings (HTTP ${response.status}).`);
    strings = await response.json();
    uiLanguage = lang;
    return lang;
  }

  return {
    load,
    /** Looks up a string; `{name}` placeholders are filled from `params`. */
    t(key, params = {}) {
      const value = strings[key];
      if (typeof value !== 'string') {
        onMissing(key);
        return key;
      }
      return value.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    },
    get uiLanguage() {
      return uiLanguage;
    },
    get contentLanguage() {
      return readSettings().contentLanguage ?? DEFAULT_CONTENT_LANGUAGE;
    },
    async setUiLanguage(language) {
      const lang = await load(language);
      writeSettings({ uiLanguage: lang });
      return lang;
    },
    setContentLanguage(language) {
      writeSettings({ contentLanguage: language });
    },
    savedUiLanguage: () => readSettings().uiLanguage ?? null,
    /** Replaces the text of every [data-i18n] element (and the attributes named in data-i18n-attr, "attr:key"). */
    applyToDom(root) {
      for (const element of root.querySelectorAll('[data-i18n]')) element.textContent = this.t(element.dataset.i18n);
      for (const element of root.querySelectorAll('[data-i18n-attr]')) {
        for (const pair of element.dataset.i18nAttr.split(';')) {
          const [attribute, key] = pair.split(':');
          if (attribute && key) element.setAttribute(attribute.trim(), this.t(key.trim()));
        }
      }
    },
  };
}
