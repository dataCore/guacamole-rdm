# Changelog

All notable changes to this project. Versions follow
[Semantic Versioning](https://semver.org/); each release is a tag `vX.Y.Z`
and an image `ghcr.io/datacore/guacamole-rdm:X.Y.Z`.

## [Unreleased]

### Changed

- **Phones and tablets.** On a touch screen a single tap opens a
  connection (no double tap needed). Below 640px the tree lies over the
  workspace and closes once a connection is open; its open/closed state
  is no longer saved from there. Buttons, tree rows, tabs and menu entries
  get finger-sized targets on touch screens.
- **"⋯" buttons on touch screens** for the tree and tab menus, since iOS
  fires no context menu on a long press.
- The fullscreen button is hidden where the browser cannot put an element
  into fullscreen (iPhone Safari).
- Hover highlights apply only to devices that can hover.

## [1.1.2] — 2026-10-14

### Added

- **Version at the foot of the sidebar** (`guacamole-rdm X.Y.Z`), taken
  from `package.json` at build time.

## [1.1.1] — 2026-10-14

### Fixed

- **Clipboard on connect.** Text copied locally before opening a connection
  now reaches the remote end once the session shows its first frame. Before,
  the remote clipboard stayed empty until the focus left and came back.
- **Clipboard on paste.** Ctrl+V and Shift+Insert in a session first hand
  the local clipboard to the remote end, from the browser's paste event (no
  permission needed), and only then send the keys. Before, the text arrived
  only if a focus change happened to read the clipboard, so pasting often
  took several attempts.
- The clipboard is also read when the browser tab becomes visible again;
  refused reads are logged to the console (debug level) instead of being
  dropped silently.

## [1.1.0] — 2026-10-06

### Added

- **Downloads.** Files the remote end offers (RDP drive "Download" folder,
  `guacctl -d` / `guacget` over SSH with SFTP) are downloaded by the browser,
  as in Guacamole's own client. Before, the transfer was refused silently.
- **Automatic reconnect.** After a transient failure (gateway or remote end
  unreachable, busy, timed out — the same status codes as Guacamole's own
  client) the tab reconnects after 15 seconds. *Connect now* skips the wait,
  *Do not reconnect* keeps the error on screen.
- **Unstable connection notice** while the tunnel hears nothing from the
  gateway; it disappears when the connection recovers.
- **Clipboard field** (clipboard button next to the tab actions): shows what
  the remote end copied last and sends text to it. For browsers that do not
  let the app read the local clipboard (Firefox, plain HTTP).
- **Microphone** for connections with audio input enabled: the browser asks
  for the microphone only once guacd accepts the audio stream. Needs HTTPS.
- Dev stack: the SSH demo connections have SFTP enabled.

### Fixed

- Dev stack: the VNC target starts again after a container restart.

## [1.0.1] — 2026-10-06

### Added

- **Credential prompt.** When a connection does not store its credentials,
  guacd asks for them while connecting (e.g. RDP with NLA, a VNC password).
  The tab now shows a form for exactly the parameters guacd asks for
  (username, password, domain, …) and sends them the way Guacamole's own
  client does. Nothing is stored. *Cancel* disconnects the tab. Before, such
  a tab stayed at "Waiting for remote end …".
- Dev stack: a VNC target with a password the connection does not store
  (`vncPrompt01` in `deploy/dev/seed.sh`), to try the prompt.

### Fixed

- Keys held while the focus leaves the session (Alt+Tab, a click into the
  tree) are released on the remote end. Before, a modifier such as Alt could
  stay pressed there until it was pressed again.

## [1.0.0] — 2026-10-06

First public release: connection tree and session tabs in front of Apache
Guacamole, SSO via Guacamole's OpenID Connect extension, German and English
UI, light and dark theme, replaceable themes, hardened container image.

[1.1.2]: https://github.com/dataCore/guacamole-rdm/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/dataCore/guacamole-rdm/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/dataCore/guacamole-rdm/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/dataCore/guacamole-rdm/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/dataCore/guacamole-rdm/releases/tag/v1.0.0
