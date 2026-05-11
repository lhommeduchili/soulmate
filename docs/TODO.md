# soulmate development todo

## priority: high (phase 3: the core & queue)

- [x] implement `slskdservice` configuration injection (random api key/port).
- [x] create `slskdclient` to talk to `slskd` api (search/download).
- [x] implement `queueservice` to manage search & download orchestration.
- [x] update ui to show search input (or playlist selection) and download progress.

## priority: high (phase 4: packaging & distribution)

- [x] configure `electron-builder` for mac/win/linux.
- [x] create generic distribution automation (binary download script).
- [x] fix macOS Gatekeeper — ad-hoc signing + `afterSign.js` deep sign.
- [x] set up github actions ci/cd (`ci.yml` + `release.yml`).
- [x] migrate distribution from Google Drive to GitHub Releases.
- [ ] (tier 2) enroll in Apple Developer Program + notarize builds.

## priority: medium

- [ ] standardize error handling with `apperror` and `electron-log`.
- [ ] implement react error boundaries in ui.
- [x] implement robust startup check to kill zombie `slskd` processes.
- [ ] display real-time download speed and status.
- [ ] implement typed preferences model for locale, region, download path, and format priority.
- [ ] centralize settings persistence in a dedicated preferences service with validated ipc payloads.
- [ ] add renderer i18n foundation with `es-CL` and `en` message catalogs.
- [ ] localize top bar, login, settings, playlist status, and queue status surfaces.
- [ ] make settings modal a fully accessible dialog with focus trap, escape close, and focus return.
- [ ] make editable track cells keyboard-operable.
- [ ] standardize visible focus styles across major interactive components.
- [ ] apply chile market preferences to spotify requests.
- [ ] add playwright coverage for localization persistence and settings accessibility.
- [ ] add vitest coverage for preference defaults and locale fallback behavior.
- [ ] configure strict typescript (`strict: true`), eslint, and husky.

## completed

### phase 3: the core & queue

- [x] implement `slskdservice` configuration injection (random api key/port).
- [x] create `slskdclient` to talk to `slskd` api (search/download).
- [x] implement `queueservice` to manage search & download orchestration.
- [x] update ui: playlist selector, matrix queue, clear functionality.
- [x] ui polish: marquee text, hover effects, silent actions.
- [x] support youtube public playlists (scraping & integration).

## completed

### phase 2: authentication & data

- [x] implement `soulmate://` protocol handler in electron.
- [x] implement `spotifyservice` with pkce auth flow.
- [x] implement secure storage for tokens (`electron-store`).
- [x] write e2e test for spotify login redirect.
- [x] design "connect spotify" ui button/state.

### phase 1: foundation

- [x] initialize repository structure.
- [x] create basic electron + vite + ts setup.
- [x] create `slskdservice` skeleton.
- [x] write first playwright test for app launch.
