# AGENTS.md — guacamole-rdm

Guidance for contributors and coding agents. What the project is and how to run
it is in the README; this file records the decisions behind it and the rules
that are not obvious from the code.

## Language

- Code, identifiers, comments, commit messages, logs: **English**.
- UI text lives only in `src/lib/i18n/`: `de.ts` defines the shape (German,
  Swiss orthography: always "ss", never the sharp s), `en.ts` must have every
  key — a unit test enforces it. New text always goes into both.

## Architecture decisions (do not re-evaluate without a reason)

- **No backend, no database, no users of its own.** Login, connections,
  permissions and history belong to Guacamole. Before adding storage, check
  whether Guacamole can hold it (attributes, user preferences).
- **Same origin as Guacamole** (SPA at `/`, Guacamole at its default context
  `/guacamole/`). Token sharing (`localStorage["GUAC_AUTH_TOKEN"]`, JSON-encoded
  like Guacamole's own UI), the `'self'`-only CSP and the absence of CORS all
  rest on this.
- **`guacamole-common-js` is loaded from the Guacamole server**, not bundled
  (`src/lib/guacamole.ts`), so it always matches the server version. Types come
  from `@types/guacamole-common-js`.
- **SSO:** a failed `POST api/tokens` returns the authorization URL including a
  server-generated nonce (field type `REDIRECT`). The SPA swaps only
  `redirect_uri`, so the identity provider needs `https://<host>/` next to
  `https://<host>/guacamole/`. It adds its own `state` (kept in
  sessionStorage) and accepts an `id_token` only with that state — otherwise a
  forged link could log the victim into someone else's account. IdP errors
  (`#error=…`) are shown, never answered with another redirect.
- **Stale tokens are checked with `HEAD api/session`**, never by resuming them
  through `POST api/tokens`: that counts as a failed login for Guacamole's
  brute-force ban. Only 401/403 mean "invalid"; a network error or 5xx keeps
  the token. The shared token is removed only while it is still ours.
- **Multi-step login** (e.g. TOTP): further fields Guacamole asks for after
  the password are rendered generically; a TOTP enrollment QR code is shown.
- **A tab is "connected" only after the first frame.** Guacamole reports
  CONNECTED as soon as guacd accepts the session, which for RDP is before the
  target answers.
- **Nothing that takes typing goes inside the viewport.** Its
  `Guacamole.Keyboard` listens in the capture phase and swallows every key
  before an element inside sees it (`stopPropagation` there does not help).
  The credential prompt therefore sits in `.stage` next to the viewport, and
  only the tab in front shows it. The keyboard is reset when the window or
  the viewport loses focus, so no key stays pressed on the remote end.
- **Follow Guacamole's own client where it defines behaviour:** downloads go
  through `api/session/tunnels/{uuid}/streams/{index}/{name}?token=` (the
  browser fetches them, so the token is in the query); automatic reconnect
  uses the status codes of Guacamole 1.6 (`src/lib/streams.ts`); audio
  input is requested on every connect and only becomes a microphone request
  once guacd accepts the stream.
- **The image is neutral:** only the `default` theme (close to Guacamole's own
  look, system fonts), no corporate fonts or logos. Installations mount their
  own theme; the app styles itself only through the `--g-*` tokens documented
  in `public/themes/default/theme.css`. **Every theme needs light and dark.**
  No Apache Guacamole logo in the default theme — it is an ASF trademark.

## Hardening

Image: nginx-unprivileged (uid 101), read-only root fs, `cap_drop: ALL`, tmpfs
on `/tmp`, base images pinned to a version. `examples/docker-compose.yml` shows
the same hardening for the whole stack; guacd needs a writable tmpfs at
`/home/guacd`, or every RDP connection fails with "Security negotiation failed".

## Layout

- `src/` — the SPA; logic with unit tests in `src/lib/`.
- `docker/` — nginx config and the entrypoint hook that renders `config.json`
  from `RDM_*` variables.
- `deploy/dev/` — local Guacamole + SSH target for `npm run dev`, with neutral
  demo data (`seed.sh`).
- `examples/` — runnable example stack. Keep it in step with the image and the
  hardening, and run it once after changing either.
- `docs/` — icon and README screenshots. Take screenshots with the demo data
  from `deploy/dev/seed.sh`, never with real host names.

## Verification

Before a commit: `npm run check && npm test`. Check UI changes in a browser
against the dev stack — the unit tests cover the logic in `src/lib/`, not
Guacamole sessions.
