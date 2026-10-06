/** Helpers around Guacamole's streams that need no browser: the REST URL a
 *  file the remote end offers is downloaded from, and which failures are
 *  worth an automatic reconnect. Both follow Guacamole 1.6's own client
 *  (tunnelService.js, guacClientNotification.js). */

/** Path separators would let a remote filename escape the URL segment. */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/]+/g, '_');
}

/** GET on this URL hands the stream to the browser as a download. The token
 *  has to be in the query: the browser fetches it, not this app. */
export function streamDownloadUrl(base: URL, tunnel: string, stream: number, filename: string, token: string): string {
  const path = `api/session/tunnels/${encodeURIComponent(tunnel)}/streams/${encodeURIComponent(String(stream))}/${encodeURIComponent(sanitizeFilename(filename))}`;
  const url = new URL(path, base);
  url.searchParams.set('token', token);
  return url.toString();
}

export type FailureSource = 'client' | 'tunnel';

/** Seconds before a failed session reconnects by itself. */
export const RECONNECT_DELAY = 15;

/** Server-side or network trouble that may well be gone a moment later. A
 *  rejected login (0x0301) only counts when guacd reported it: the remote
 *  end may have been busy; from the tunnel it means Guacamole refused. */
const TRANSIENT = new Set([0x0200, 0x0202, 0x0203, 0x0207, 0x0208, 0x0308]);

export function shouldAutoReconnect(code: number, source: FailureSource): boolean {
  return TRANSIENT.has(code) || (source === 'client' && code === 0x0301);
}
