import { describe, expect, it } from 'vitest';
import { sanitizeFilename, shouldAutoReconnect, streamDownloadUrl } from './streams';

describe('sanitizeFilename', () => {
  it('replaces runs of path separators', () => {
    expect(sanitizeFilename('../etc/passwd')).toBe('.._etc_passwd');
    expect(sanitizeFilename('a\\\\b//c')).toBe('a_b_c');
    expect(sanitizeFilename('report.pdf')).toBe('report.pdf');
  });
});

describe('streamDownloadUrl', () => {
  it('builds the tunnel stream URL below Guacamole with the token', () => {
    const url = streamDownloadUrl(new URL('https://remote.example/guacamole/'), 'abc-1', 3, 'Q3 report.pdf', 'T0K');
    expect(url).toBe('https://remote.example/guacamole/api/session/tunnels/abc-1/streams/3/Q3%20report.pdf?token=T0K');
  });

  it('keeps a hostile filename inside its path segment', () => {
    const url = new URL(streamDownloadUrl(new URL('https://remote.example/guacamole/'), 'u', 1, '../../x?y#z', 't'));
    expect(url.pathname).toBe('/guacamole/api/session/tunnels/u/streams/1/.._.._x%3Fy%23z');
    expect(url.searchParams.get('token')).toBe('t');
  });
});

describe('shouldAutoReconnect', () => {
  it('retries transient upstream failures from either side', () => {
    for (const code of [0x0200, 0x0202, 0x0203, 0x0207, 0x0208, 0x0308]) {
      expect(shouldAutoReconnect(code, 'client')).toBe(true);
      expect(shouldAutoReconnect(code, 'tunnel')).toBe(true);
    }
  });

  it('retries a rejected login only when guacd reported it', () => {
    expect(shouldAutoReconnect(0x0301, 'client')).toBe(true);
    expect(shouldAutoReconnect(0x0301, 'tunnel')).toBe(false);
  });

  it('does not retry what a retry cannot fix', () => {
    for (const code of [0x0100, 0x0204, 0x0205, 0x0209, 0x0303, 0x031d]) {
      expect(shouldAutoReconnect(code, 'client')).toBe(false);
    }
  });
});
