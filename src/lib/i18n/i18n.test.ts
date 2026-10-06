import { describe, expect, it } from 'vitest';
import { de } from './de';
import { en } from './en';
import { resolveLanguage } from './locale.svelte';

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe('catalogues', () => {
  it('English covers every German key and nothing more', () => {
    expect(keys(en).sort()).toEqual(keys(de).sort());
  });
});

describe('resolveLanguage', () => {
  it('prefers the saved choice, then the configured language', () => {
    expect(resolveLanguage('de', ['en-US'], 'en')).toBe('en');
    expect(resolveLanguage('de', ['en-US'], null)).toBe('de');
  });

  it('follows the browser with auto and falls back to English', () => {
    expect(resolveLanguage('auto', ['fr-CH', 'de-CH', 'en'], null)).toBe('de');
    expect(resolveLanguage('auto', ['fr-CH', 'it'], null)).toBe('en');
    expect(resolveLanguage('auto', ['en-GB'], 'xx')).toBe('en');
  });
});
