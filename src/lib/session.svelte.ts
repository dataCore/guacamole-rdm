import { credentialFields, type CredentialField } from './credentials';
import { statusMessage, t } from './i18n';
import type { ConnectionNode } from './tree';

export type SessionState = 'connecting' | 'waiting' | 'connected' | 'disconnected' | 'error';

/** Keysyms for the Ctrl+Alt+Del chord. */
const KEYSYM_CTRL_L = 0xffe3;
const KEYSYM_ALT_L = 0xffe9;
const KEYSYM_DELETE = 0xffff;

/** Status codes that can mean either "the target rejected the credentials"
 *  or "the Guacamole login is gone". The app checks which one it was. */
const AUTH_STATUS = new Set([0x0301, 0x0303]);

let nextId = 1;

export interface SessionContext {
  base: URL;
  token: () => string | null;
  /** Re-checks the Guacamole login and returns to the login screen if it
   *  is gone. */
  verifyAuth: () => void;
}

/** One tab: a Guacamole client with its own tunnel and display. The display
 *  element lives for the whole life of the tab and is only moved between
 *  hosts, never re-created, so switching tabs costs nothing. */
export class Session {
  readonly id = `s${nextId++}`;
  state = $state<SessionState>('connecting');
  /** Guacamole status of the failure; translated when rendered, so a
   *  language switch also reaches error messages already on screen. */
  error = $state<{ code: number; message: string | null } | null>(null);
  /** Title reported by the remote end (e.g. the RDP window name), if any. */
  remoteName = $state<string | null>(null);
  /** Parameters guacd is waiting for (credentials the connection does not
   *  store), or null. The session stays "waiting" until they are sent. */
  required = $state<CredentialField[] | null>(null);

  readonly element: HTMLDivElement;
  #client: Guacamole.Client | null = null;
  #host: HTMLElement | null = null;
  #observer: ResizeObserver | null = null;
  #resizeTimer: ReturnType<typeof setTimeout> | undefined;
  #lastClipboard: string | null = null;

  constructor(
    readonly node: ConnectionNode,
    readonly context: SessionContext,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'session-display';
  }

  get title(): string {
    return this.node.name;
  }

  /** Mount into a visible host and connect on first attach (the size of the
   *  host is the initial remote resolution). */
  attach(host: HTMLElement): void {
    this.#host = host;
    host.append(this.element);
    this.#observer = new ResizeObserver(() => this.#scheduleResize());
    this.#observer.observe(host);
    if (!this.#client) this.connect();
  }

  detach(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#host = null;
    this.element.remove();
  }

  connect(): void {
    this.#teardown();
    this.state = 'connecting';
    this.error = null;

    const token = this.context.token();
    if (!token) {
      this.context.verifyAuth();
      return;
    }

    const wsUrl = new URL('websocket-tunnel', this.context.base);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const tunnel = new Guacamole.ChainedTunnel(
      new Guacamole.WebSocketTunnel(wsUrl.toString()),
      new Guacamole.HTTPTunnel(new URL('tunnel', this.context.base).toString()),
    );
    const client = new Guacamole.Client(tunnel);
    this.#client = client;

    // A late error of a replaced client (reconnect) must not tear down the
    // new one, nor trigger an auth check for a tab that is gone.
    tunnel.onerror = (status) => this.#client === client && this.#fail(status);
    client.onerror = (status) => this.#client === client && this.#fail(status);
    client.onname = (name) => (this.remoteName = name);
    client.onrequired = (parameters) => {
      if (this.#client !== client) return;
      const fields = credentialFields(parameters);
      this.required = fields.length ? fields : null;
    };
    client.onstatechange = (state) => {
      if (this.#client !== client) return;
      switch (state) {
        case 1:
          this.state = 'connecting';
          break;
        case 2:
          this.state = 'waiting';
          break;
        case 3:
          // Guacamole reports CONNECTED once guacd has accepted the session,
          // which for RDP is before the target answers. Green only once the
          // remote end has drawn something; until then keep "waiting".
          this.state = client.getDisplay().getWidth() > 0 ? 'connected' : 'waiting';
          this.#scheduleResize();
          break;
        case 5:
          if (this.state !== 'error') this.state = 'disconnected';
          break;
      }
    };
    client.onclipboard = (stream, mimetype) => this.#receiveClipboard(stream, mimetype);

    const display = client.getDisplay();
    const displayElement = display.getElement();
    this.element.replaceChildren(displayElement);
    display.onresize = (width) => {
      if (width > 0 && this.state === 'waiting' && this.#client === client) this.state = 'connected';
      this.#rescale();
    };

    // Native cursor: let the browser draw the remote cursor image.
    const mouse = new Guacamole.Mouse(displayElement);
    display.oncursor = (canvas, x, y) => {
      if (!mouse.setCursor(canvas, x, y)) display.showCursor(true);
    };
    display.showCursor(false);
    mouse.onEach(['mousedown', 'mouseup', 'mousemove'], (event) => {
      if (this.#client === client) client.sendMouseState((event as Guacamole.Mouse.Event).state, true);
    });

    const { width, height, dpi } = this.#targetSize();
    const params = new URLSearchParams({
      token,
      GUAC_DATA_SOURCE: this.node.dataSource,
      GUAC_ID: this.node.identifier,
      GUAC_TYPE: this.node.type,
      GUAC_WIDTH: String(width),
      GUAC_HEIGHT: String(height),
      GUAC_DPI: String(dpi),
      GUAC_TIMEZONE: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    for (const type of Guacamole.AudioPlayer.getSupportedTypes()) params.append('GUAC_AUDIO', type);
    for (const type of Guacamole.VideoPlayer.getSupportedTypes()) params.append('GUAC_VIDEO', type);
    for (const type of ['image/png', 'image/jpeg']) params.append('GUAC_IMAGE', type);

    client.connect(params.toString());
  }

  disconnect(): void {
    this.#teardown();
    this.state = 'disconnected';
  }

  /** Answer guacd's "required" request. Each value goes out as an argument
   *  value stream, as in Guacamole's own client; nothing is kept here. */
  submitCredentials(values: Record<string, string>): void {
    const client = this.#client;
    const fields = this.required;
    if (!client || !fields) return;
    this.required = null;
    for (const field of fields) {
      const writer = new Guacamole.StringWriter(client.createArgumentValueStream('text/plain', field.name));
      writer.sendText(values[field.name] ?? '');
      writer.sendEnd();
    }
  }

  /** Close for good: called when the tab goes away. */
  dispose(): void {
    clearTimeout(this.#resizeTimer);
    this.#teardown();
    this.detach();
  }

  sendKey(pressed: boolean, keysym: number): void {
    if (this.state === 'connected') this.#client?.sendKeyEvent(pressed ? 1 : 0, keysym);
  }

  sendCtrlAltDel(): void {
    for (const keysym of [KEYSYM_CTRL_L, KEYSYM_ALT_L, KEYSYM_DELETE]) this.sendKey(true, keysym);
    for (const keysym of [KEYSYM_DELETE, KEYSYM_ALT_L, KEYSYM_CTRL_L]) this.sendKey(false, keysym);
  }

  /** Local clipboard to the remote end; skipped when nothing changed, so
   *  focusing a tab does not resend the same text over and over. */
  pushClipboard(text: string): void {
    if (!this.#client || this.state !== 'connected' || text === this.#lastClipboard) return;
    this.#lastClipboard = text;
    const writer = new Guacamole.StringWriter(this.#client.createClipboardStream('text/plain'));
    writer.sendText(text);
    writer.sendEnd();
  }

  #receiveClipboard(stream: Guacamole.InputStream, mimetype: string): void {
    if (!mimetype.startsWith('text/')) {
      stream.sendAck('Unsupported', 0x0100);
      return;
    }
    const reader = new Guacamole.StringReader(stream);
    let text = '';
    reader.ontext = (chunk) => (text += chunk);
    reader.onend = () => {
      this.#lastClipboard = text;
      navigator.clipboard?.writeText(text).catch(() => undefined);
    };
  }

  #fail(status: Guacamole.Status): void {
    if (this.state === 'error') return;
    if (AUTH_STATUS.has(status.code)) this.context.verifyAuth();
    this.error = { code: status.code, message: status.message ?? null };
    this.state = 'error';
    this.#teardown();
  }

  #targetSize(): { width: number; height: number; dpi: number } {
    const ratio = window.devicePixelRatio || 1;
    const host = this.#host;
    const width = Math.max(320, Math.floor((host?.clientWidth || 1024) * ratio));
    const height = Math.max(240, Math.floor((host?.clientHeight || 768) * ratio));
    return { width, height, dpi: Math.floor(96 * ratio) };
  }

  #scheduleResize(): void {
    clearTimeout(this.#resizeTimer);
    this.#resizeTimer = setTimeout(() => {
      if (!this.#host || !this.#host.clientWidth) return; // hidden tab
      if (this.#client && this.state === 'connected') {
        const { width, height } = this.#targetSize();
        const display = this.#client.getDisplay();
        if (display.getWidth() !== width || display.getHeight() !== height) this.#client.sendSize(width, height);
      }
      this.#rescale();
    }, 150);
  }

  /** Fit the remote display into the host. Servers that honour the size
   *  request render at device pixels, so this lands on 1/devicePixelRatio;
   *  servers with a fixed resolution are shrunk to fit, never blown up. */
  #rescale(): void {
    const display = this.#client?.getDisplay();
    const host = this.#host;
    if (!display || !host || !display.getWidth() || !host.clientWidth) return;
    const fit = Math.min(host.clientWidth / display.getWidth(), host.clientHeight / display.getHeight());
    display.scale(Math.min(fit, 1));
  }

  #teardown(): void {
    const client = this.#client;
    this.#client = null;
    this.required = null;
    // The old mouse stays bound to the old display element, which is
    // replaced on reconnect; its handler ignores events of a stale client.
    client?.disconnect();
  }
}

export function sessionStateLabel(session: Session): string {
  switch (session.state) {
    case 'connecting':
      return t.session.connecting;
    case 'waiting':
      return t.session.waiting;
    case 'disconnected':
      return t.session.disconnected;
    case 'error':
      return session.error ? statusMessage(session.error.code, session.error.message ?? undefined) : t.errors.generic;
    default:
      return '';
  }
}
