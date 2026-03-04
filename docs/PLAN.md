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
- [ ] integrate `electron-updater` for silent auto-updates.
- [ ] set up github actions ci/cd (lint, test, build, release).
- **goal:** production-ready `soulmate.app` (mac) and auto-updating infrastructure.
