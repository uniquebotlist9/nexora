import en from './locales/en.json';

/**
 * Minimal localization scaffold. Guild settings carry a `language` field
 * (default "en"); new locales are added by dropping a JSON file here and
 * registering it in LOCALES. Missing keys fall back to English, then to the
 * raw key so nothing renders blank.
 */
type StringTable = Record<string, string>;

const LOCALES: Record<string, StringTable> = {
  en: en as StringTable,
};

export const SUPPORTED_LANGUAGES: string[] = Object.keys(LOCALES);

export type LocaleVars = Record<string, string | number>;

export function t(key: string, vars: LocaleVars = {}, language = 'en'): string {
  const table = LOCALES[language] ?? LOCALES.en;
  let template = table[key] ?? LOCALES.en[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    template = template.split(`{${name}}`).join(String(value));
  }
  return template;
}
