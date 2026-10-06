import { loadPref, savePref } from '../prefs';

export const LANGUAGES = ['de', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** The active UI language. Reactive: everything rendered through `t`
 *  follows a switch immediately, open sessions stay untouched. */
export const locale = $state<{ lang: Language }>({ lang: 'de' });

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** A choice the user made in this browser wins; then the installation's
 *  setting; with "auto", the browser's preferred languages; English last. */
export function resolveLanguage(configured: string, preferred: readonly string[], saved: unknown): Language {
  if (isLanguage(saved)) return saved;
  if (isLanguage(configured)) return configured;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}

export function initLanguage(configured: string): void {
  setLanguage(resolveLanguage(configured, navigator.languages ?? [navigator.language], loadPref('lang', null)), false);
}

export function setLanguage(lang: Language, remember = true): void {
  locale.lang = lang;
  document.documentElement.lang = lang === 'de' ? 'de-CH' : 'en';
  if (remember) savePref('lang', lang);
}
