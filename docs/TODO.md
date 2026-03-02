# Soulmate Development Todo

## Priority: High (Phase 3: The Core & Queue)
- [x] Implement `SlskdService` configuration injection (random API key/port).
- [x] Create `SlskdClient` to talk to `slskd` API (search/download).
- [x] Implement `QueueService` to manage search & download orchestration.
- [x] Update UI to show search input (or playlist selection) and download progress.

## Priority: High (Phase 4: Packaging & Distribution)
- [x] Configure `electron-builder` for Mac/Win/Linux.
- [x] Create generic distribution automation (binary download script).

## Priority: Medium
- [ ] Standardize error handling with `AppError` and `electron-log`.
- [ ] Implement React Error Boundaries in UI.
- [x] Implement robust startup check to kill zombie `slskd` processes.
- [ ] Display real-time download speed and status.
- [ ] Implement ARIA accessibility standards across all components.
- [ ] Configure strict TypeScript (`strict: true`), ESLint, and Husky.

## Completed
### Phase 3: The Core & Queue
- [x] Implement `SlskdService` configuration injection (random API key/port).
- [x] Create `SlskdClient` to talk to `slskd` API (search/download).
- [x] Implement `QueueService` to manage search & download orchestration.
- [x] Update UI: Playlist Selector, Matrix Queue, Clear Functionality.
- [x] UI Polish: Marquee text, Hover effects, Silent Actions.
- [x] Support YouTube Public Playlists (Scraping & Integration).

## Completed
### Phase 2: Authentication & Data
- [x] Implement `Soulmate://` protocol handler in Electron.
- [x] Implement `SpotifyService` with PKCE Auth Flow.
- [x] Implement secure storage for tokens (`electron-store`).
- [x] Write E2E test for Spotify Login redirect.
- [x] Design "Connect Spotify" UI button/state.

### Phase 1: Foundation
- [x] Initialize repository structure.
- [x] Create basic Electron + Vite + TS setup.
- [x] Create `SlskdService` skeleton.
- [x] Write first Playwright test for app launch.
