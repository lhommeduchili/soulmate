# soulmate development todo

## priority: high (phase 3: the core & queue)
- [x] implement `slskdservice` configuration injection (random api key/port).
- [x] create `slskdclient` to talk to `slskd` api (search/download).
- [x] implement `queueservice` to manage search & download orchestration.
- [x] update ui to show search input (or playlist selection) and download progress.

## priority: high (phase 4: packaging & distribution)
- [x] configure `electron-builder` for mac/win/linux.
- [x] create generic distribution automation (binary download script).

## priority: medium
- [ ] standardize error handling with `apperror` and `electron-log`.
- [ ] implement react error boundaries in ui.
- [x] implement robust startup check to kill zombie `slskd` processes.
- [ ] display real-time download speed and status.
- [ ] implement aria accessibility standards across all components.
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
