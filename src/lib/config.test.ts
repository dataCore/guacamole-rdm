import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig, resolveGuacamoleBase } from './config';

describe('parseConfig', () => {
  it('falls back to defaults for missing or empty values', () => {
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig({ title: '  ', autoSso: 'yes' })).toEqual(DEFAULT_CONFIG);
  });

  it('accepts only plain theme directory names', () => {
    expect(parseConfig({ theme: 'corporate' }).theme).toBe('corporate');
    expect(parseConfig({ theme: '../evil' }).theme).toBe('default');
    expect(parseConfig({ theme: 'Corporate' }).theme).toBe('default');
  });

  it('adds the trailing slash to guacamoleUrl', () => {
    expect(parseConfig({ guacamoleUrl: '/guacamole' }).guacamoleUrl).toBe('/guacamole/');
  });
});

describe('resolveGuacamoleBase', () => {
  it('resolves relative to the origin', () => {
    const base = resolveGuacamoleBase(parseConfig({ guacamoleUrl: '/guac/' }), 'https://remote.example');
    expect(base.toString()).toBe('https://remote.example/guac/');
  });

  it('rejects another origin', () => {
    expect(() => resolveGuacamoleBase(parseConfig({ guacamoleUrl: 'https://evil.example/' }), 'https://remote.example')).toThrow();
  });
});
