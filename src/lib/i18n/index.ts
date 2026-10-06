import { de, type Messages } from './de';
import { en } from './en';
import { locale } from './locale.svelte';

export { initLanguage, locale, resolveLanguage, setLanguage, type Language } from './locale.svelte';
export type { Messages } from './de';

const catalogues: Record<string, Messages> = { de, en };

/** The messages of the active language. A proxy, so `t.tree.search` read in
 *  a template or $derived re-evaluates when the language changes. */
export const t: Messages = new Proxy({} as Messages, {
  get: (_, key) => catalogues[locale.lang][key as keyof Messages],
});

export function statusMessage(code: number, fallback?: string): string {
  const text = t.errors.status[code] ?? fallback ?? t.errors.generic;
  return `${text} (0x${code.toString(16).padStart(4, '0').toUpperCase()})`;
}
