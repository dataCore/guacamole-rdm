import { describe, expect, it } from 'vitest';
import { credentialFields } from './credentials';

describe('credentialFields', () => {
  it('keeps the order guacd asked in and maps known names', () => {
    const fields = credentialFields(['username', 'password', 'domain']);
    expect(fields.map((f) => f.name)).toEqual(['username', 'password', 'domain']);
    expect(fields.map((f) => f.known)).toEqual(['username', 'password', 'domain']);
    expect(fields.map((f) => f.secret)).toEqual([false, true, false]);
    expect(fields[0].autocomplete).toBe('username');
    expect(fields[1].autocomplete).toBe('current-password');
  });

  it('drops duplicates and empty names', () => {
    expect(credentialFields(['password', '', 'password']).map((f) => f.name)).toEqual(['password']);
  });

  it('treats unknown parameters as secret and keeps their name', () => {
    expect(credentialFields(['private-key'])).toEqual([
      { name: 'private-key', known: null, secret: true, autocomplete: 'off' },
    ]);
  });

  it('does not take inherited object keys for known names', () => {
    expect(credentialFields(['toString'])[0].known).toBeNull();
  });
});
