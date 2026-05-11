# soulmate implementation plan

## phase 1: foundation & lifecycle

- [x] set up electron + vite + typescript boilerplate.
- [x] implement `slskdservice` to spawn and kill binary.
- [x] implement robust zombie process cleanup in `slskdservice` (auto-kill on start).
- **goal:** app opens, slskd starts, app closes -> slskd dies.

## phase 2: authentication & data

- [x] implement spotify oauth via deep linking (`soulmate://callback`).
- **goal:** login opens browser, captures token.

## phase 3: the core & queue

- [x] implement search and download logic.
  - [x] backend: dynamic slskd config (with auto-creds) & api client (api v0).
  - [x] frontend: playlist selector (matrix aesthetic).
  - [x] logic: playlist -> search -> poll -> filter -> download.
  - [x] feature: real-time search bar (cosmetic/prepared).
  - [x] feature: embedded spotify login (auto-close).
  - [x] feature: real-time search bar (cosmetic/prepared).
  - [x] feature: embedded spotify login (auto-close).
  - [x] ui: matrix-style sidebar queue.
  - [x] **fix:** map `slotsfree` correctly in queueservice (solves "no match found").
  - [x] **refinement:** parallelize download queue processing.
- **goal:** selecting a playlist queues items in slskd.

## phase 4: packaging & distribution

- [x] configure `electron-builder` for cross-platform support (mac/win/linux).
- [x] create `scripts/download-binaries.ts` for automated binary fetching.
- [x] verify integration with real `slskd` binary (e2e tests passed).
- [x] fix macOS Gatekeeper blocking — ad-hoc signing (`identity: "-"`) + deep sign via `afterSign.js`.
- [x] set up github actions ci/cd (lint, test, build, release via `release.yml` + `ci.yml`).
- [x] migrate distribution from Google Drive to GitHub Releases.
- [ ] integrate `electron-updater` for silent auto-updates.
- [ ] (tier 2) enroll in Apple Developer Program + notarize builds for zero-warning installs.
- **goal:** production-ready `soulmate.app` (mac) and auto-updating infrastructure.

## phase 5: accessibility & regional localization

- [ ] add typed app preferences for locale, region, download path, and format priority.
- [ ] centralize settings persistence behind validated main-process preferences service and preload api.
- [ ] add renderer preferences/i18n provider with `es-CL` and `en` catalogs.
- [ ] upgrade settings modal to accessible dialog behavior with focus trap and keyboard support.
- [ ] localize core shell surfaces (top bar, login, settings, playlist and queue status text).
- [ ] wire chile (`CL`) region into spotify market-aware requests.
- [ ] add playwright coverage for preferences persistence, locale application, and settings accessibility.
- [ ] add vitest coverage for preference schema and locale fallback logic.
- **goal:** accessible, keyboard-navigable, chile-first multilingual foundation that scales to more locales and regions.
