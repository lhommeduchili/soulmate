# soulmate specifications

## 1. objective

develop "soulmate" from scratch—a high-quality, zero-configuration desktop application that allows users (specifically djs and audiophiles) to download high-quality audio from soulseek via a spotify interface.

## 2. core philosophy

- **simplicity first (kiss):** the end user is non-technical. one file, open it, and it works. no terminal, no docker.
- **robustness:** handle network flakiness, crashes, and rate limits gracefully.
- **code quality:** solid principles, dry, clean architecture.

## 3. technology stack

- **runtime:** electron (main process) + node.js.
- **frontend:** react + vite + typescript (renderer process).
- **language:** typescript (both main and renderer). strict mode (`strict: true`), no `any` types. **no python.**
- **testing:** playwright (end-to-end) and vitest (unit tests for pure functions).
- **tooling:** husky pre-commit hooks running eslint and prettier.
- **core dependency:** `slskd` (soulseek daemon) - managed as a child process.

## 4. architecture (mvc)

### model (data & logic)

- **store:** `electron-store` or sqlite.
- **state management:** zustand for global ui state.
- **preferences:** app preferences must be strongly typed and centralized behind a dedicated `PreferencesService` backed by `electron-store`.
  - Schema: `src/shared/schemas.ts` and `src/shared/preferences.ts`.
  - `locale`: `'es-CL' | 'en'` (default: `'es-CL'`).
  - `region`: `'CL' | 'US' | 'GB' | 'AR' | 'MX' | 'ES' | 'BR'` (default: `'CL'`).
  - `downloadPath`: string (default: user Downloads / `soulmate downloads`).
  - `formatPriority`: `'flac' | '320kbps' | 'any'` (default: `'flac'`).
  - Legacy array format priorities are safely migrated to `'flac'`.
- **services:**
  - `slskdservice`: binary lifecycle, config injection, health checks.
  - `spotifyservice`: zero-login public playlist ingestion (via embed, open web player state, and oembed) with legacy oauth2 pkce fallback, market/region aware (`CL` default).
  - `spotifyParser`: pure, isolated extractor module parsing public HTML payloads without auth or side effects.
  - `preferencesservice`: manages user preferences persistence, IPC synchronization, defaults, and download paths.
  - `queueservice`: ranking and prioritizing downloads, respecting format priority settings.
  - `metadataservice`: native audio metadata injection (FLAC Vorbis comments + METADATA_BLOCK_PICTURE, MP3 ID3v2.3/ID3v2.4 via `node-id3`), album art retrieval, filename sanitization, and DJ file organization.

### view (ui)

- **top bar:** configuration, search (cosmetic), home.
- **sidebar:** matrix-style download queue with **clear** functionality and marquee text.
- **main view:** playlist grid (images), playlist review (table).
- **settings dialog:** fully accessible modal (`role="dialog"`, `aria-modal="true"`, focus trap on open, escape dismiss, and focus restoration to trigger button) with language, region, audio quality priority, download directory picker, and visible focus rings (`focus-visible:ring-2 focus-visible:ring-soul-green`).
- **components:** must implement react error boundaries and strict accessibility (a11y) standards (aria labels, keyboard navigation).
- **localization:** renderer copy must come from translation catalogs, not inline strings. first iteration supports `es-CL` (Chile default) and `en` with a scalable key-based translation layer.
- **regionalization:** chile (`CL`) is the default market/region profile. user-facing preferences allow language override while keeping region-aware service behavior and formatting.
- **styling:** tailwind css (dark/matrix aesthetic).

### controller (main process)

- **ipc handlers:** main orchestration. frontend sends ipc messages (e.g., `preferences:get`, `preferences:set`, `download.start`), main calls services. input payloads must be validated/sanitized using `zod` schemas.
  - `preferences:get`: returns validated `AppPreferences`.
  - `preferences:set`: validates payload against `PartialUserPreferencesSchema` and persists updates.
  - `queue:open-folder`: reveals completed audio file in the host operating system's file manager via `shell.showItemInFolder` with download directory fallback.

### security

- **browserwindow:** `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, and `allowRunningInsecureContent: false`.
- **preload least privilege:** exposes only the strictly typed `window.api` bridge via `contextBridge` (no raw `ipcRenderer` / `window.electron` exposure).
- **csp:** strict content security policy in renderer (`img-src 'self' data: https:;`, `form-action 'none';`, `frame-src 'none';`, `object-src 'none';`).
- **navigation, permissions & external links:** denies unsolicited Chromium permissions, blocks unexpected renderer navigations, and restricts `shell.openExternal` to `https:`/`http:` URLs.
- **path containment & ssrf defense:** confines `soulmate-media://`, `queue:open-folder`, and DJ crate exports to canonicalized paths inside the user's library (defeating `..` and symlink escapes); enforces `https:`-only non-private/non-loopback URL validation for remote fetches.
- **daemon & secret protection:** `slskd` binds strictly to `127.0.0.1`, writes `slskd.yml` with `0600` permissions and JSON-escaped YAML scalars, spawns helpers via argument-array `execFile`/`execFileSync` (no shell interpolation), uses 256-bit API keys, enforces cryptographic PKCE + CSRF `state` validation for Spotify OAuth, and encrypts stored secrets with Electron `safeStorage`.

## 5. zero-config requirement

1.  **binary management:**
    - **dev:** `scripts/download-binaries.ts` fetches platform-specific `slskd`.
    - **prod:** `electron-builder` bundles the os-specific binary into `resources/`.
    - `slskdservice` detects environment and paths automatically.
2.  **auto-updates:**
    - silent background auto-updates via `electron-updater`.
    - github actions pipeline for ci/cd (lint, test, build, release).
3.  **dynamic configuration:**
    - find random free port.
    - generate temp `slskd.yml`.
    - launch `slskd` with this config.
    - never ask user for ports/keys.

## 6. development workflow (tdd)

1.  define requirement.
2.  write playwright test (fail).
3.  run & fail.
4.  implement minimal code.
5.  refactor.

## 7. accessibility and localization requirements

- **dialog accessibility:** custom dialogs must use correct semantics (`role="dialog"`, `aria-modal`), trap focus, support `Escape`, and return focus to the trigger.
- **keyboard editing:** any editable cell or interactive text pattern must be operable with keyboard alone.
- **focus visibility:** do not remove focus treatment unless a visible replacement is provided.
- **document metadata:** renderer must apply the active locale to the document root (`lang`, and `dir` when needed).
- **regional api behavior:** spotify and other region-sensitive services must read the active region from preferences instead of hardcoding or omitting market context.

## 8. distribution & code signing

- **macOS (tier 1 — current):** ad-hoc signed (`identity: "-"` in `electron-builder.yml`). the `afterSign.js` hook deep-signs the `.app` bundle including nested binaries (e.g., `slskd`). recommended install method is the one-line `curl` installer (`install.sh`), which verifies `SHA256SUMS.txt`, installs `soulmate.app`, and clears `com.apple.quarantine` automatically. manual `.dmg`/`.zip` users can approve the app once via System Settings → Privacy & Security → Open Anyway, or strip the quarantine flag with `xattr -cr`.
- **macOS (tier 2 — future):** Developer ID signing + Apple notarization. requires Apple Developer Program enrollment (\$99/year). the `afterSign.js` hook already supports notarization when `APPLE_ID`, `APPLE_ID_PASSWORD`, and `APPLE_TEAM_ID` env vars are set.
- **Windows:** unsigned (nsis installer). windows SmartScreen may show a warning on first run.
- **Linux:** unsigned AppImage. no platform-level signing required.
- **distribution channel:** GitHub Releases (`draft: false`). artifacts plus `SHA256SUMS.txt` are published automatically by the `release.yml` workflow, powering both `install.sh` and `electron-updater`.

## 9. ci/cd

- **ci (`ci.yml`):** runs on every push to `main` and on pull requests. strictly validates lint (`npm run lint`), formatting (`npm run format:check`), typecheck (`npm run typecheck`), and unit tests (`npm run test:unit`).
- **release (`release.yml`):** triggered by pushing a version tag (`v*`). builds platform-specific artifacts on native runners (macOS arm64/x64, Linux x64, Windows x64), generates `SHA256SUMS.txt`, and publishes a GitHub Release via `softprops/action-gh-release`.
- **binary management in ci:** the `slskd` binaries are gitignored and downloaded at build time via `npm run binaries:download`. each platform runner downloads only the binaries it needs.
- **notarization in ci (tier 2):** when `APPLE_ID`, `APPLE_ID_PASSWORD`, and `APPLE_TEAM_ID` are configured as GitHub repository secrets, the macOS build job will automatically notarize the app.

## 10. zero-login spotify playlist, album & track ingestion

To overcome Spotify's 5-user Developer Mode quota limitation and deliver true zero-config operation:

- **Entity & URL Normalization:** Accepts playlists (`/playlist/:id`), albums (`/album/:id`), tracks (`/track/:id`), embed URLs (`/embed/...`), localized paths (`/intl-*/...`), Spotify URIs (`spotify:(playlist|album|track)::id`), short prefixes (`album:id`, `track:id`), and raw base62 IDs, with query parameters and hash fragments sanitized.
- **Pure Extractor Engine (`spotifyParser`):** Pure functions parsing public Embed JSON scripts (`resource`, `initial-state`, `__NEXT_DATA__`), Open Web Player state (`initialState` base64 payloads), and oEmbed JSON:
  - `parseOpenPageHtml` & `parseEmbedHtml`: parses playlist payloads.
  - `parseAlbumHtml`: parses album Open Page and Embed payloads, building collection metadata and track list.
  - `parseTrackHtml`: parses single track Open Page and Embed payloads into a 1-item review collection and single track item.
- **Multi-Tier Cascade (`SpotifyService`):**
  - **Tier 1 (Embed):** Fetches `open.spotify.com/embed/(playlist|album|track)/:id` and extracts tracklist and metadata.
  - **Tier 2 (Open Web Player State):** If Tier 1 fails or extracts 0 tracks, fetches `open.spotify.com/(playlist|album|track)/:id` and decodes the embedded `initialState`.
  - **Tier 3 (oEmbed Fallback):** If metadata is missing or partial, fetches `open.spotify.com/oembed` to resolve title, author name, and cover art.
  - **Memory Caching:** Resolved entity metadata and track lists are cached with a 5-minute TTL to ensure fast navigation from import bar to track review without redundant network calls.
- **Queue Pipeline & Schema Compatibility:**
  - Track payloads strictly conform to `TracksArraySchema` validated at the IPC boundary (`queue:start` and `download:start`).
  - Track titles and artist names are decoded and sanitized via `cleanTrackText` to eliminate unescaped HTML entities (e.g. `&amp;`), nested escapes, non-breaking spaces, and extra whitespace before queue dispatch and Soulseek query construction.
  - End-to-end user journey is verified via Playwright (`tests/playlist-add.spec.ts` and `tests/album-add.spec.ts`), testing public URL import, review table hydration, and queue dispatch without user authentication.
- **UI Streamlining & Login Demotion:**
  - **Zero-Login Workspace:** The primary empty state in `PlaylistSelector` presents a welcoming, distraction-free search and import workspace with actionable guidance for pasting public Spotify and YouTube URLs. Full-width login banners and OAuth prompts are eliminated from primary views.
  - **Secondary Settings Action:** Spotify account connection is repositioned as an optional sync item inside `SettingsModal` (`settings-spotify-connect` / `settings-spotify-logout`), allowing audiophiles who want personal private library synchronization to opt-in without blocking general usage.
  - **Immediate Ingestion Feedback:** `TopBar` displays a matrix-styled ping/spinner progress indicator when an import or search is in flight, disabling redundant inputs.
  - **Inline Error Alerting:** Invalid or unreachable URLs trigger an accessible inline alert banner with `role="alert"` and `aria-live="assertive"`, complete with dismiss controls and automatic dismissal on input edit.
  - **Bilingual Accessibility:** All new UI elements are fully localized across `es-CL` and `en` message catalogs, maintaining visible keyboard focus rings (`focus-visible:ring-2 focus-visible:ring-soul-green`) and explicit ARIA labeling.

## 11. youtube playlist & single video ingestion

- **URL Extraction (`extractYoutubeVideoId`):** Detects and normalizes single video URLs (`youtube.com/watch?v=...`, `youtu.be/...`, `/embed/...`, `/v/...`) while preserving playlist URLs (`playlist?list=...`).
- **Single Video Resolution:** Single videos are resolved via YouTube's unauthenticated oEmbed endpoint with watch-page metadata fallback, creating a 1-track collection with smart artist/title extraction and thumbnail caching.
- **Queue Processing:** Dispatches to `queue:start` identically to Spotify collections for automated Soulseek search and download.

## 12. real-time transfer telemetry, queue metrics & keyboard cell editing

- **Real-Time Telemetry & Progress Engine (`src/main/utils/telemetry.ts`):**
  - **Speed Tracking:** Computes transfer rates dynamically using differential delta-bytes over elapsed milliseconds or reported slskd metrics, formatted cleanly across scales (`B/s`, `KB/s`, `MB/s`, `GB/s`).
  - **Transfer Progress:** Tracks bytes transferred vs total file size (e.g. `4.2 MB / 10.5 MB`), updating `progress` percentage and human-readable size labels.
  - **State Normalization:** Standardizes diverse daemon transfer states into typed `DownloadStatus` (`pending`, `searching`, `queued`, `connecting`, `downloading`, `completed`, `failed`).
- **Safe Download Retry (`queue:retry`):**
  - IPC handler validated via `StringQuerySchema` resetting failed downloads back to `pending`, resetting speed and metrics, attempting remote transfer cleanup via `slskdClient.cancelDownload`, and triggering queue re-processing without app relaunch.
- **Matrix Sidebar Telemetry & Speed Indicators (`Sidebar.tsx`):**
  - Surfaces real-time download speeds (`850 KB/s` in glowing soul-green), progress percentage, active peer badges (`@username`), and remaining byte sizes in compact monospace typography.
  - Incorporates accessible ARIA live regions (`aria-live="polite"` and `aria-atomic="true"`) announcing status transitions to screen readers (e.g. download completed, failed, or active).
  - Failed downloads display actionable, keyboard-accessible retry triggers (`[retry]`) with localized screen reader labels.
  - Fully localized across `es-CL` (Chile default) and `en` message catalogs.
- **Keyboard-Operable Track Cell Editing (`EditableCell.tsx`):**
  - Fully accessible, WCAG-compliant track title, artist, and album editing in playlist review.
  - `Enter` or `Space` on focused button enters edit mode, automatically focusing and selecting input text.
  - `Escape` cancels edits and restores the original value.
  - `Enter` saves the sanitized new value.
  - Focus restoration returns focus to the trigger button upon exiting edit mode, preventing lost keyboard focus.
  - Visible focus indicators match `focus-visible:ring-2 focus-visible:ring-soul-green`.
- **Automated Verification:**
  - 100% green Vitest unit tests in `EditableCell.spec.ts` and `QueueService.spec.ts`.
  - Playwright E2E suites in `tests/editable-cell-a11y.spec.ts` and `tests/queue-telemetry.spec.ts` verifying keyboard editing, focus management, real-time speed display, state transitions, and retry flows.

## 13. standardized error domain, react error boundaries & pre-commit tooling

- **Standardized Error Architecture (`AppError.ts`):**
  - Strongly typed `AppErrorCode` domain: `SLSKD_DAEMON_OFFLINE`, `SLSKD_NOT_CONFIGURED`, `SLSKD_API_ERROR`, `SEARCH_TIMEOUT`, `DOWNLOAD_ABORTED`, `INGESTION_RATE_LIMIT`, `STORAGE_IO_ERROR`, `INVALID_PAYLOAD`, `SPOTIFY_AUTH_FAILED`, `PLAYLIST_NOT_FOUND`, `NETWORK_ERROR`, and `UNKNOWN_ERROR`.
  - Secure error serialization (`AppError.serialize` and `AppError.deserialize`) that automatically strips internal paths (macOS, Linux, Windows, file URLs) and redacts credentials (auth tokens, passwords, API keys, cookies) before IPC transit.
  - Zod validation errors seamlessly serialized into `INVALID_PAYLOAD` with sanitized details.
- **Hardened Logging with Structured Formats (`logger.ts`):**
  - Powered by `electron-log` with safe fallback to user directory or temp storage when `app.getPath('userData')` is unavailable in test environments or before Electron initialization.
  - Structured log formatting: `[{timestamp}] [{level}] [{scope}] {text}` supporting component-scoped loggers via `createComponentLogger`.
- **UI Resilience & Isolated React Error Boundaries:**
  - Hardened `ErrorBoundary.tsx` supporting component name tagging, functional fallback rendering, error callbacks, and clean state recovery via `reset()`.
  - Matrix-themed `PageErrorFallback.tsx` recovery cards with status badges (`[SYSTEM FAULT: RECOVERY MATRIX]`), diagnostic telemetry boxes, and actionable recovery triggers (`Retry / Reintentar`, `Reset Workspace / Reiniciar Espacio`, and `Reload / Recargar`).
  - Critical views (`Sidebar`, `PlaylistsPage`, and `ReviewPage` / `PlaylistReview`) isolated in individual Error Boundaries so a failure in one component never crashes or blanks the entire desktop application.
  - Resilient i18n via `useSafeI18n()` guaranteeing fallback rendering even if rendered outside an `I18nProvider`.
- **Git Hygiene & Mandatory Pre-Commit Tooling:**
  - Husky pre-commit hook executing `npm run lint`, `npm run format:check`, and `npm run typecheck`.
  - Modern ESLint flat config (`eslint.config.mjs`) with `typescript-eslint` enforcing strict rules and prohibiting unhandled errors across main and renderer processes.
- **Automated Verification:**
  - 100% green Vitest unit tests in `src/main/utils/AppError.spec.ts` (9 tests) and `src/renderer/src/components/ErrorBoundary.spec.ts` (10 tests).
  - Playwright E2E suite in `tests/error-handling.spec.ts` verifying component isolation, retry triggers, absence of white-screens, and localized IPC error alerts without unhandled promise rejections.

## 14. audiophile post-download pipeline: metadata tagging, album art injection & dj file organization

- **Audio Tagging & Metadata Injection Engine (`MetadataService.ts`):**
  - Native Node/TypeScript audio tagging service operating without external Python or CLI dependencies.
  - **FLAC Support:** Injects RFC 9639 Vorbis comments (`TITLE`, `ARTIST`, `ALBUM`, `TRACKNUMBER`, `DATE`) and embedded `METADATA_BLOCK_PICTURE` (Front Cover, picture type 3) while preserving original audio frames bit-for-bit.
  - **MP3 Support:** Injects ID3v2.3/ID3v2.4 frames (`TIT2`, `TPE1`, `TALB`, `TRCK`, `TYER`, `APIC`) via `node-id3`.
  - **Album Art Injection:** Fetches high-resolution album art from ingestion sources with timeout protection and embeds directly into audio files.
  - **Graceful Degradation:** Audio files are never corrupted if image retrieval or tagging fails; operations log structured `AppError` and preserve original files.
- **DJ File Organization & Sanitized Naming Pipeline:**
  - Standard DJ file hierarchy organized within user-configured `downloadPath`:
    `<DownloadDir>/<Artist>/<Album>/<TrackNumber> - <Title>.<ext>` or `<DownloadDir>/<Artist> - <Title>.<ext>`.
  - Robust cross-platform filename sanitization (`sanitizeFilename`) eliminating forbidden characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) and control characters while preserving international Unicode characters (accents, Japanese, Cyrillic, Spanish).
  - Atomic staging rename/copy to eliminate partial-read conflicts with DJ software (rekordbox, Traktor, Serato, Engine DJ).
- **Queue Completion Lifecycle & Reveal in Folder Action:**
  - Transitions completed transfers through `downloading` -> `tagging` -> `completed` and updates `DownloadItem` with `targetPath` and `filePath`.
  - Native OS folder reveal IPC handler `queue:open-folder` using `shell.showItemInFolder`.
  - Interactive folder icon action in `Sidebar.tsx` with accessible tooltips and screen reader announcements.
  - Localized across `es-CL` (Chile default) and `en` message catalogs (`sidebar.tagging`, `sidebar.revealInFolder`, `sidebar.revealInFolderAria`).
- **Automated Verification:**
  - 17 Vitest unit tests in `src/main/services/MetadataService.spec.ts`.
  - 3 Playwright E2E tests in `tests/metadata-pipeline.spec.ts`.

## 15. dj playlist manifest export (.m3u8), library duplicate detection & silent background updates

- **DJ Playlist Manifest & Export Engine (`PlaylistExportService.ts`):**
  - Generates standard UTF-8 extended playlist manifests (`#EXTM3U`, `#EXTINF:<duration>,<Artist> - <Title>`, relative path).
  - Normalizes relative audio paths with cross-platform forward slashes (`/`), targeting organized DJ library hierarchies (`../<Artist>/<Album>/<TrackNumber> - <Title>.<ext>` or `../<Artist>/<Track>.<ext>`) from `<DownloadDir>/Playlists/`.
  - Automatically exports or updates `<DownloadDir>/Playlists/<SanitizedPlaylistName>.m3u8` when all items in a queue batch finish downloading.
  - IPC handler `queue:export-playlist` with `ExportPlaylistPayloadSchema` validation to trigger manual manifest generation and reveal the `.m3u8` file in the OS file manager via `shell.showItemInFolder`.
- **Local Library Duplicate Detection & Smart Ingestion (`LibraryService.ts`):**
  - High-performance local library scanner checking `<DownloadDir>` for existing audio files across `.flac` and `.mp3` formats (accounting for sanitized artist, album, track number, and flat paths).
  - IPC handler `library:check-tracks` verifying ingestion batches in real time.
  - `PlaylistReview.tsx` surfaces Matrix-styled `[IN LIBRARY]` / `[EN BIBLIOTECA]` badges on matching tracks.
  - Interactive, keyboard-accessible `skip-in-library-toggle` checkbox allowing users to automatically deselect already-downloaded tracks to conserve bandwidth and prevent duplicate downloads.
  - `QueueService.addToQueue` immediately detects duplicates if added, marking them `completed` with existing `targetPath`/`filePath` without making redundant network transfers.
- **Silent Background Auto-Updater (`UpdateService.ts`):**
  - Auto-updating engine powered by `electron-updater` configured for GitHub Releases (`lhommeduchili/soulmate`).
  - Isolated and decoupled with lazy loading to prevent Vitest/test runner module conflicts, safely bypassed in development and test environments (`NODE_ENV === 'test'` or `VITEST`).
  - IPC channels: `update:status`, `update:check`, `update:install`, and test-simulation channel `update:simulate-status`.
  - Non-intrusive `update-available-pill` in `TopBar.tsx` when an update is downloaded and ready to install.
  - System Updates telemetry card in `SettingsModal.tsx` showing current app version, update status, and "Check for Updates" / "Restart to Update" buttons.
- **Full Localization (`es-CL` and `en`):**
  - Complete parity across Chilean Spanish (`es-CL`) and English (`en`) message catalogs for all library, export, and update features (`review.inLibrary`, `review.skipInLibrary`, `review.exportM3u`, `review.exportSuccess`, `sidebar.playlistManifestReady`, `sidebar.revealManifest`, `update.available`, `update.check`, `update.downloaded`, `update.install`, `settings.updatesTitle`).
- **Automated Verification:**
  - 100% green Vitest unit tests in `src/main/services/PlaylistExportService.spec.ts` (6 tests) and `src/main/services/UpdateService.spec.ts` (3 tests).
  - Playwright E2E suite in `tests/dj-library-export.spec.ts` (4 tests) verifying `.m3u8` manifest creation, relative path resolution, `[IN LIBRARY]` badges, skip toggle behavior, update notification pill, and Chilean Spanish translation parity.

## 16. persistent download queue, batch pause/resume, concurrency limiting & audiophile in-app audio preview

- **Queue Persistence & Crash Recovery (`QueuePersistence.ts`, `QueueService.ts`):**
  - Serializes download queue items and state transitions (`pending`, `downloading`, `tagging`, `completed`, `failed`, `paused`) into `electron-store`.
  - On application startup or relaunch, previous queue state is automatically restored. Active transfers that were interrupted by an unexpected exit or crash cleanly transition to `paused`, preventing ghost downloads or orphaned daemon requests while allowing single-click resumption.
  - IPC handler `queue:get` returning the active in-memory queue state.
  - IPC handler `queue:pause-all` safely pausing all active and pending downloads and cancelling in-flight remote requests via `slskdClient.cancelDownload`.
  - IPC handler `queue:resume-all` resetting paused downloads to `pending` and immediately triggering batch processing.
  - IPC handler `queue:clear-completed` purging completed items from the queue while preserving organized audio files and `.m3u8` playlist manifests on disk.
- **Configurable Download Concurrency & Bandwidth Throttling:**
  - Adds `maxConcurrentDownloads` preference (`1`, `2`, `3`, or `0` for unlimited; default: `2`) to `src/shared/schemas.ts`, `src/shared/preferences.ts`, and `PreferencesService.ts`.
  - Enforces active transfer concurrency limits in `QueueService.processQueue()`, queuing subsequent items until active slots become available to prevent Soulseek peer upload bottlenecks and socket starvation.
  - Configurable in `SettingsModal.tsx` via an accessible select dropdown with instant persistence.
- **Audiophile In-App Audio Preview Player (`AudioPlayerContext.tsx`, `AudioPlayer.tsx`):**
  - Allows DJs to audition completed audio files directly inside the application before importing into performance software.
  - Privileged custom protocol scheme `soulmate-media://` registered in Electron main (`protocol.handle('soulmate-media')`), safely streaming local `.flac` and `.mp3` files under strict Content Security Policy (`media-src 'self' soulmate-media:;`) and context isolation.
  - Matrix-styled audio preview bar docked at the bottom of the viewport featuring:
    - Play / Pause toggle, Stop action, seek scrubber, elapsed / total duration formatting, and volume slider.
    - Full keyboard navigation: `Space` toggles play/pause, `Escape` stops playback and dismisses player.
    - Explicit ARIA labeling, live region announcements, and focus rings.
  - Interactive audition trigger buttons on completed items in `Sidebar.tsx` and in-library tracks in `PlaylistReview.tsx`.
- **Full Localization (`es-CL` and `en`):**
  - 100% key parity across Chilean Spanish (`es-CL`) and English (`en`) message catalogs for all queue controls, player transport actions, and concurrency settings.
- **Automated Verification:**
  - 146 green Vitest unit tests (5 new tests in `QueuePersistence.spec.ts`, updated tests in `QueueService.spec.ts`).
  - 40 green Playwright E2E tests (4 new tests in `tests/queue-persistence.spec.ts`).

## 17. manual peer/source selection, query tuning for unmatched tracks & audiophile format verification

- **Manual Query Tuning for Unmatched & Failed Tracks (`QueueService.ts`, `Sidebar.tsx`):**
  - Allows DJs and audiophiles to refine and override search queries directly from the sidebar queue (`[EDIT QUERY]` / `[EDITAR BÚSQUEDA]`) when automated searches fail, stall, or return no matches.
  - IPC handler `queue:retry-with-query` validated with `RetryWithQueryPayloadSchema` (`{ id: string, customQuery: string }`).
  - Automatically aborts any existing remote download via `slskdClient.cancelDownload`, resets download state to `pending`, stores `customQuery` on `DownloadItem`, and executes a fresh Soulseek search.
  - Fully keyboard-operable inline input with `Enter` to commit, `Escape` to cancel, visible focus outline, and screen reader announcements.
- **Manual Peer & Source Selection Modal (`PeerSelectionModal.tsx`, `SlskdClient.ts`):**
  - Accessible Matrix-themed dialog opened via `[CHOOSE SOURCE]` / `[VER FUENTES]` on queued, failed, or active downloads.
  - IPC handler `queue:search-sources` performing real-time searches or returning cached peer results, deduplicating and flattening files with remote metadata (peer username, filename, file size, bitrate, sample rate, bit depth, upload speed, queue length).
  - IPC handler `queue:select-source` validated with `SelectSourcePayloadSchema` allowing one-click download binding (`[DOWNLOAD THIS FILE]` / `[DESCARGAR ESTE ARCHIVO]`), immediately dispatching the selected file to `slskdClient.download` and updating the queue item.
  - Strict modal accessibility (WCAG 2.1 AA): `role="dialog"`, `aria-modal="true"`, focus trap on open, `Escape` key listener, focus restoration to trigger button on close, and visible focus rings.
- **Audiophile Audio Format & Bitrate Verification Engine (`AudioInspection.ts`):**
  - Pure Node/TypeScript binary container header parser running post-download before metadata tagging.
  - **FLAC Container Inspection:** Validates `fLaC` stream marker and parses the 34-byte `STREAMINFO` block (block type 0). Extracts sample rate (e.g. 44.1 kHz, 48 kHz, 96 kHz, 192 kHz), bit depth (16-bit, 24-bit, 32-bit), channel count (1-8), and total sample count to verify genuine lossless high-resolution audio.
  - **MP3 Frame Header Inspection:** Parses MPEG-1/MPEG-2 Layer III frame sync headers (`0xFFE0`), correctly skipping ID3v2 headers via syncsafe integers. Extracts sample rate, MPEG audio layer, channel mode, bitrate (up to 320 kbps), and distinguishes CBR vs VBR streams by inspecting Xing, Info, or VBRI header tags in side information blocks.
  - Verified technical parameters persisted on `DownloadItem.formatInfo`: `{ format: 'FLAC' | 'MP3', sampleRate: number, bitDepth?: number, bitrate?: number }`.
  - Matrix-styled audiophile badges rendered across `Sidebar.tsx` and `AudioPlayer.tsx` preview player bar (e.g. `[24-BIT / 96kHz]`, `[16-BIT / 44.1kHz]`, `[320 KBPS]`).
- **Full Localization (`es-CL` and `en`):**
  - 100% key parity across Chilean Spanish (`es-CL`) and English (`en`) message catalogs for all query editing, peer modal columns/buttons, and audiophile format badges (`sidebar.editQuery`, `sidebar.chooseSource`, `peerModal.*`, `format.*`).
- **Automated Verification:**
  - 158 green Vitest unit tests (9 new tests in `AudioInspection.spec.ts`, 3 new tests in `QueueService.spec.ts`).
  - 43 green Playwright E2E tests (3 new tests in `tests/peer-source-selection.spec.ts`).

## 18. dj setlist batch import, smart search query cascade & stalled transfer auto-failover

- **DJ Setlist & Performance Software Batch Import (`setlistParser.ts`, `SetlistImportModal.tsx`):**
  - Allows DJs to import tracklists directly from performance software history exports (Rekordbox, Traktor, Serato CSV/TSV/TXT) or raw setlist text notes (e.g. copied from 1001Tracklists, Discord, cue sheets).
  - Pure extraction module `src/shared/setlistParser.ts` and `src/main/utils/setlistParser.ts` handling tab/comma-delimited tables, timestamps (`[00:12:34]`), line numbers (`01. Artist - Title`), mixed separators, and noisy remix/feat tags.
  - Matrix-styled modal dialog (`SetlistImportModal.tsx`) featuring:
    - Dual input modes: Plaintext raw textarea paste and CSV/TXT drag-and-drop file dropzone.
    - Real-time detected track count telemetry badge (`[data-testid="setlist-track-count"]`).
    - Custom setlist naming input.
    - Strict accessibility (WCAG 2.1 AA): `role="dialog"`, `aria-modal="true"`, focus trap on open, `Escape` key dismiss, and focus restoration to the trigger button (`[data-testid="import-setlist-trigger"]`).
  - Seamless hydration directly into `PlaylistReview.tsx` (`/review/setlist/:id`) with duplicate detection badges (`[IN LIBRARY]`), skip-in-library toggle, and one-click dispatch to download queue.
- **Automated Search Query Expansion Cascade (`MatchMaker.ts`, `QueueService.ts`):**
  - Eliminates false-negative search failures on Soulseek by executing a multi-tier query fallback cascade when exact searches return 0 matches:
    - **Tier 1 (Exact)**: `Artist Title` (sanitized).
    - **Tier 2 (Cleaned)**: Strips noisy parenthetical/bracketed clauses (e.g., `(feat. ...)`, `[Remastered 2024]`, `(Club Mix)`).
    - **Tier 3 (Minimalist)**: Primary artist only + core track title words.
  - Tracks search progression in `DownloadItem.searchAttempt` (1, 2, 3) and reflects active cascade attempt in sidebar telemetry (`Sidebar.tsx` displaying `SEARCHING (ATTEMPT 2/3)...`).
  - User preference toggle in `SettingsModal.tsx` (`autoQueryCascade: boolean`, default: `true`) backed by `PreferencesService`.
- **Stalled Download & Remote Peer Disconnect Auto-Failover (`QueueService.ts`):**
  - Detects frozen transfers when transfer speed drops to 0 B/s for >30 seconds or remote peer aborts/disconnects prematurely.
  - Logs diagnostic telemetry via `AppError("DOWNLOAD_STALLED", ...)`.
  - Automatically queries cached search results for the track, filters out exhausted peers, selects the next highest-scoring candidate with available free upload slots, and re-binds the download without requiring manual user intervention.
  - Renders yellow Matrix badge `[FAILOVER: @peer]` in `Sidebar.tsx` and announces source failover to screen readers via an accessible `aria-live="polite"` region.
- **Full Localization (`es-CL` and `en`):**
  - 100% key parity across Chilean Spanish (`es-CL`) and English (`en`) message catalogs for all setlist import controls, placeholders, dropzone hints, query cascade labels, and failover notifications.
- **Automated Verification:**
  - 183 green Vitest unit tests (17 test files; 14 new tests in `setlistParser.spec.ts`, updated tests in `MatchMaker.spec.ts`, `QueueService.spec.ts`, `PreferencesService.spec.ts`, `AppError.spec.ts`).
  - 46 green Playwright E2E tests (20 test files; 3 new tests in `tests/setlist-import.spec.ts`).
  - Clean execution of Husky pre-commit hook with zero errors.

## 19. dj performance crate export (rekordbox xml & serato subcrates), camelot key/bpm tagging & dynamic bandwidth throttling

- **Pioneer Rekordbox XML Collection Exporter (`CrateExportService.ts`):**
  - Pure XML generator strictly adhering to Pioneer Rekordbox XML specification (`<DJ_PLAYLISTS Version="1.0.0">`, `<PRODUCT>`, `<COLLECTION>`, `<PLAYLISTS>`).
  - Standardized XML character entity escaping (`escapeXml`) and cross-platform file URI formatting (`file://localhost/...` with RFC 3986 percent-encoding).
  - Audio track metadata mapping: Track ID, Name, Artist, Album, BitRate, SampleRate, Size, TotalTime, Year, Location, AverageBpm, and Tonality (musical key).
  - Exports collection nodes and a structured playlist tree ready for instant drag-and-drop or sync into Pioneer Rekordbox.
  - IPC handler `crate:export-rekordbox` validated with `ExportCratePayloadSchema`, persisting `rekordbox.xml` to the user's download directory without involuntary Finder window focus disruption.
- **Serato Subcrate Binary Exporter (`CrateExportService.ts`):**
  - Pure binary serializer writing Serato DJ's standard Tag-Length-Value (TLV) format (`vrsn`, `otrk`, `ptrk`).
  - Writes big-endian 4-byte ASCII tag identifier and 4-byte payload length headers.
  - Serializes track file paths as UTF-16BE strings relative to the drive root without leading slashes (e.g., `Users/...` on macOS/Linux, `Music/...` on Windows), satisfying Serato DJ subcrate indexing specifications.
  - Generates `.crate` files ready for direct placement in the user's `<Music>/_Serato_/Subcrates/` directory or export folder.
  - IPC handler `crate:export-serato` validated with `ExportCratePayloadSchema`.
- **Camelot Key & BPM Extraction, Normalization & Badges (`AudioInspection.ts`):**
  - Pure musical key converter `toCamelotKey` translating all 24 standard minor and major musical keys (`Am` -> `8A`, `C#m` -> `12A`, `G Major` -> `9B`, `Bb minor` -> `3A`, etc.) and Open Key notation into standardized Camelot wheel notation.
  - BPM parser `parseBpm` with range validation (`30` to `300` BPM) and 2-decimal rounding.
  - Enriched binary audio inspection extracting ID3v2 musical key (`TKEY`) and BPM (`TBPM`) tags via `node-id3`, and FLAC Vorbis comments (`INITIALKEY`, `KEY`, `BPM`) via `readFlacTags`.
  - Normalized `bpm` and `camelotKey` persisted on `FormatInfo` and `DownloadItem.formatInfo`.
  - Matrix-styled Camelot badges (`[8A / 126 BPM]`, `[126 BPM]`, or `[8A]`) rendered in `Sidebar.tsx`, `PlaylistReview.tsx`, and `AudioPlayer.tsx`.
- **Dynamic Bandwidth Rate Limiting (`PreferencesService.ts`, `QueueService.ts`, `SlskdClient.ts`, `SettingsModal.tsx`):**
  - User preference `downloadSpeedLimit` (`0` = unlimited, `500` = 500 KB/s, `2000` = 2 MB/s, `5000` = 5 MB/s; default: `0`) added to `UserPreferencesSchema`, `DEFAULT_PREFERENCES`, and `PreferencesService`.
  - Dynamically updates `slskd` speed limits via `SlskdClient.reconfigureOptions({ limits: { transfer: { downloadSpeed: limit } } })` on startup and instant preference changes without daemon restarts.
  - Accessible `<select>` dropdown (`data-testid="bandwidth-limit-select"`) in `SettingsModal.tsx` with instant persistence and ARIA labeling.
- **UI Export Controls & Non-Intrusive Feedback (`PlaylistReview.tsx`, `Sidebar.tsx`, `AudioPlayer.tsx`):**
  - Export button group in `PlaylistReview.tsx` offering `.m3u8` playlist manifest, `Rekordbox XML`, and `Serato .crate` one-click exports.
  - Non-intrusive feedback via localized notification banners without involuntary OS Finder window focus interruptions.
  - Interactive Camelot badges displayed alongside audiophile sample rate / bit depth tags.
- **Full Localization (`es-CL` and `en`):**
  - 100% key parity across Chilean Spanish (`es-CL`) and English (`en`) message catalogs for all crate export buttons, success alerts, Camelot badges, and bandwidth speed-limit options (`review.exportRekordbox`, `review.exportSerato`, `review.exportCrateSuccess`, `settings.bandwidthLimit`, `settings.bandwidth.*`).
- **Automated Verification:**
  - 201 green Vitest unit tests (18 test files; 9 tests in `CrateExportService.spec.ts`, 15 tests in `AudioInspection.spec.ts`, updated tests in `PreferencesService.spec.ts` and `QueueService.spec.ts`).
  - 50 green Playwright E2E tests (21 test files; 4 new tests in `tests/crate-export.spec.ts`).
  - Clean Husky pre-commit hook execution with zero errors and zero warnings.

## 20. native instruments traktor pro nml exporter, replaygain 2.0 / ebu r128 loudness tagging & "fake lossless" transcode verification

- **Native Instruments Traktor Pro NML Collection Exporter (`CrateExportService.ts`):**
  - Pure XML serializer producing compliant Traktor Pro Collection NML documents (`<NML VERSION="19">`, `<HEAD COMPANY="Native Instruments" PROGRAM="Traktor"/>`, `<COLLECTION>`, `<ENTRY>`, `<LOCATION>`, `<ALBUM>`, `<INFO>`, `<TEMPO>`, `<PLAYLISTS>`).
  - Formats cross-platform Traktor file locations: `DIR` segments delimited by `/:` with volume root notation (e.g., `/:Users/:username/:Music/:` on POSIX or `/:C:/:Users/:...` on Windows), and standalone `FILE` attribute.
  - Maps track audio metadata: Track Name, Artist, Album, BitRate, SampleRate, File Size, Playtime/Duration, BPM, and Musical Key (Camelot tonality notation in both `KEY="..."` attribute and `<KEY>...</KEY>` child node).
  - Emits playlist tree nodes (`<NODE TYPE="PLAYLIST">`) matching the active playlist/setlist title with track primary key references.
  - IPC handler `crate:export-traktor` saving `collection.nml` to user's export folder with clean, non-intrusive UI feedback banner and suppression of involuntary Finder window focus disruption (`reveal && !isTest`).
  - Accessible button in `PlaylistReview.tsx` (`data-testid="export-traktor-button"`).
- **ReplayGain 2.0 / EBU R128 Non-Destructive Loudness Normalization Tagging (`MetadataService.ts`):**
  - Pure loudness peak and RMS/LUFS estimation module computing track volume adjustment in dB against standard -18.00 LUFS reference level.
  - Generates standard non-destructive ReplayGain metadata tags:
    - FLAC Vorbis comments: `REPLAYGAIN_TRACK_GAIN`, `REPLAYGAIN_TRACK_PEAK`, `REPLAYGAIN_ALBUM_GAIN`.
    - MP3 ID3v2.3/ID3v2.4 user-defined text frames: `TXXX:REPLAYGAIN_TRACK_GAIN`, `TXXX:REPLAYGAIN_TRACK_PEAK`.
  - Enables DJ software (Traktor, Rekordbox, Serato) and audiophile players to balance playback levels automatically without destructive audio re-encoding or clipping.
  - User preference toggle in `SettingsModal.tsx` (`data-testid="replaygain-toggle"`, `data-testid="replaygain-toggle-label"`, `enableReplayGain: boolean`, default: `true`) backed by `PreferencesService`.
- **Audiophile "Fake Lossless" Transcode & High-Frequency Cutoff Verification (`AudioInspection.ts`):**
  - High-frequency cutoff analysis using windowed 1024-point Radix-2 Cooley-Tukey FFT (`detectFrequencyCutoff`, `verifyAudioIntegrity`).
  - Compares high-frequency spectral energy roll-off against midband reference energy (2–10 kHz) to identify upsampled fake lossless files (e.g., 128 kbps MP3s padded into 16-bit/44.1kHz FLACs with ~16 kHz ceiling, 192 kbps with ~19 kHz ceiling, or genuine lossless with 22 kHz+ full spectrum).
  - Audio integrity status stored on `FormatInfo.integrity`: `'genuine' | 'suspect_transcode' | 'unverified'` and `FormatInfo.cutoffFrequency`.
  - Amber Matrix warning badges rendered in `Sidebar.tsx` and `AudioPlayer.tsx` (`[TRANSCODE WARNING: ~16kHz CUTOFF]`) with descriptive tooltips and ARIA accessibility attributes.
- **Full Localization (`es-CL` and `en`):**
  - 100% key parity across Chilean Spanish (`es-CL`) and English (`en`) message catalogs for all Traktor export controls, ReplayGain settings labels, and transcode warning badges.
- **Automated Verification:**
  - 214 green Vitest unit tests (18 test files; 4 new tests in `CrateExportService.spec.ts`, 3 new tests in `MetadataService.spec.ts`, 6 new tests in `AudioInspection.spec.ts`).
  - 53 green Playwright E2E tests (21 test files; 3 new tests in `tests/crate-export.spec.ts`).
  - Clean Husky pre-commit hook execution with zero errors and zero warnings.

## 21. soundcloud & bandcamp zero-login ingestion (playlists, albums & tracks)

- **Pure SoundCloud Parser Engine (`soundCloudParser.ts`):**
  - Pure, side-effect-free extraction engine extracting track and set/playlist metadata without user credentials or API tokens.
  - Parses `window.__sc_hydration` script JSON from public web pages:
    - Extracts `hydratable === "playlist"` for complete track collections, titles, durations in ms, and owner usernames.
    - Extracts `hydratable === "sound"` for individual track ingestion into 1-item review collections.
    - Automatically maps artwork to high-resolution 500x500 images via `normalizeArtworkUrl` (`-large.` -> `-t500x500.`).
    - Fallback extraction via OpenGraph meta tags (`og:title`, `og:image`, `og:description`) and public oEmbed endpoint (`https://soundcloud.com/oembed?format=json&url=...`).
    - Supports standard track URLs (`/:artist/:slug`), playlist/set URLs (`/:artist/sets/:slug`), mobile links (`m.soundcloud.com`), and shortlinks (`on.soundcloud.com`).
- **Pure Bandcamp Parser Engine (`bandcampParser.ts`):**
  - Pure, side-effect-free extraction engine parsing public Bandcamp release pages.
  - Parses Schema.org JSON-LD `<script type="application/ld+json">` for `MusicAlbum` and `MusicRecording`.
  - Extracts embedded `data-tralbum` JSON attributes for exact track numbers, track titles, and accurate floating-point second durations.
  - Pure ISO-8601 duration parser (`parseIsoDuration`) translating `PT3M45S`, `PT45S`, `PT1H2M3S` into milliseconds.
  - Fallback extraction via OpenGraph meta tags and custom domain Bandcamp releases (`/album/:slug`, `/track/:slug`).
- **Service Orchestration & URL Ingestion Pipeline (`SoundCloudService.ts`, `BandcampService.ts`, `SpotifyService.ts`):**
  - Dedicated `SoundCloudService` and `BandcampService` managing TTL-cached release metadata and track resolution.
  - Dynamic domain routing in `SpotifyService.getPlaylist` and `SpotifyService.getPlaylistTracks` routing Spotify, YouTube, SoundCloud, and Bandcamp URLs to their respective engines.
  - Normalizes tracks into Soulmate's standard track structure with `is_soundcloud` and `is_bandcamp` flags.
  - Preload and IPC channels (`soundcloud:getPlaylist`, `soundcloud:tracks`, `bandcamp:getPlaylist`, `bandcamp:tracks`).
  - Integrated into download queue matching against Soulseek peers in FLAC / 320kbps according to user audio quality preferences.
- **UI Platform Badges & Bilingual Parity (`TopBar.tsx`, `PlaylistSelector.tsx`, `PlaylistReview.tsx`):**
  - Updated search bar placeholder and labels across Chilean Spanish (`es-CL`) and English (`en`):
    - `en`: `"paste public spotify, youtube, soundcloud, or bandcamp url"`
    - `es-CL`: `"pega una url pública de spotify, youtube, soundcloud o bandcamp"`
  - Updated guidance cards in `PlaylistSelector.tsx` presenting Spotify, YouTube, SoundCloud, and Bandcamp examples.
  - Matrix platform badge rendered in `PlaylistReview.tsx` header toolbar (`[SOUNDCLOUD]`, `[BANDCAMP]`, `[SPOTIFY]`, `[YOUTUBE]`).
  - Silent off-screen automated testing configuration ensuring zero desktop screen popup disruption during Playwright test execution.
- **Automated Verification:**
  - 257 green Vitest unit tests (22 test files; 21 tests in `soundCloudParser.spec.ts`, 18 tests in `bandcampParser.spec.ts`, 2 tests in `SoundCloudService.spec.ts`, 2 tests in `BandcampService.spec.ts`).
  - 55 green Playwright E2E tests (22 test files; 2 new tests in `tests/soundcloud-bandcamp.spec.ts`).
  - Clean Husky pre-commit hook execution with zero errors and zero warnings.

## 22. Aesthetic & Native macOS Architecture (Phase 17)

- **Brutalist Terminal Palette & Atmospheric Ground (`tailwind.config.js`, `src/renderer/src/assets/index.css`, `Layout.tsx`):**
  - Void black (`#000000`) base with `.nocturne-ground` oxblood/cold-cyan ambient radial wash (without horizontal scanline grid) and carbon (`#08080a`) surfaces.
  - Bone primary text (`#d7d0c3`), oxidized silver secondary text (`#a9a19a` / `#8f8790`), phosphor green telemetry (`#65d685`), dried rose/crimson (`#c09a9f` / `#8e3948`), oxblood (`#36111d`), and cold cyan highlights (`#c5d7d4`).
  - Square `rounded-none` geometry with 1px structural borders and bone-on-void button inversion.
  - Editorial italic serif (`Fraunces` / `Cormorant Garamond` / `Georgia` local fallback under CSP) paired with monospace terminal typography (`JetBrains Mono` / `SFMono-Regular`).
- **Streamlined Settings & Queue Controls (`SettingsModal.tsx`, `FormatSelector.tsx`, `QueueService.ts`, `Sidebar.tsx`):**
  - Removed unused `region` selector and redundant `audioQuality` selector from `SettingsModal.tsx`; default format priority order is `["aiff", "wav", "flac", "mp3"]` in `QueueService.ts` and `FormatSelector.tsx`.
  - Clean download queue header in `Sidebar.tsx` without `$` prefix and trash icon button for clearing the queue.
- **ASCII Telemetry Progress Meters (`Sidebar.tsx`, `index.css`):**
  - Replaced pill progress bars with dual-layer block glyph ASCII meters (`░` empty / `█` filled scaled via `inlineSize: ${progress}%`, `data-testid="ascii-progress-${id}"`).
- **Playlist Table Artwork & Copy Discipline (`PlaylistReview.tsx`, `SpotifyService.ts`, `spotifyParser.ts`, `es-CL.ts`, `en.ts`, `i18n.spec.ts`, `index.html`):**
  - Rendered `32x32` (`w-8 h-8`) square track artwork thumbnails (`track-thumbnail-${track.id}`) with fallback glyphs (`track-thumbnail-fallback-${track.id}`), album/playlist cover fallback hydration for scraped tracks, and expanded CSP `img-src` for external artwork CDNs.
  - Removed redundant per-track platform badges (`track-platform-badge-${track.id}`) while keeping the single playlist-level `platform-badge` in the header.
  - Enforced strictly lowercase or strictly UPPERCASE visible UI copy across `es-CL` and `en` translation catalogs via unit tests in `i18n.spec.ts`.
- **Queue `clearCompleted` Reliability (`QueueService.ts`, `useQueue.ts`, `Sidebar.tsx`, `preload/index.d.ts`, `env.d.ts`):**
  - `QueueService.clearCompleted()` clears associated `lastSearchResults`, returns the remaining `DownloadItem[]` array directly, guards post-download `finally` blocks against stale deleted entries (`this.queue.has(item.id)`), and updates `useQueue` optimistically before IPC reconciliation.
  - Widened `Sidebar` (`w-72`) with `flex-wrap` action bar controls so `[clear completed]` remains legible and clickable.
- **Frameless macOS Titlebar, Squircle Icon & Dev Dock Identity (`src/main/index.ts`, `scripts/setup-mac-dev.ts`, `electron-builder.yml`, `package.json`):**
  - Configured macOS `BrowserWindow` with `titleBarStyle: "hiddenInset"`, `trafficLightPosition: { x: 16, y: 16 }`, `backgroundColor: "#000000"`, and CSS `-webkit-app-region: drag/no-drag` header integration (`Sidebar` & `TopBar`).
  - Added pure-TypeScript `scripts/setup-mac-dev.ts` (`npm run setup:mac`, wired into `dev`, `start`, and `postinstall`) to preserve `build/icon-raw.png`, rasterize the 1024x1024 macOS squircle `build/icon.png`, `src/renderer/src/assets/logo.png`, and `build/icon.icns`, and patch `Electron.app/Contents/Info.plist` (`CFBundleName` / `CFBundleDisplayName` = `"soulmate"`) for local dev Dock hover consistency alongside `electron-builder.yml` `mac.extendInfo`.

## 23. Security Hardening & macOS Curl Distribution (Phase 18)

- **Centralized Security Primitives (`src/main/utils/security.ts`, `src/main/utils/security.spec.ts`):**
  - `isPrivateOrLoopbackHost` & `isSafeRemoteUrl`: blocks non-HTTPS schemes, embedded URL credentials, loopback (`127.0.0.0/8`, `::1`, `localhost`), link-local / cloud metadata (`169.254.169.254`), and RFC1918 / ULA private ranges on remote fetches (`MetadataService.fetchAlbumArt`, `SoundCloudService`, `BandcampService`).
  - `isSafeExternalOpenUrl`: restricts `shell.openExternal` strictly to `https:` and `http:` schemes.
  - `isPathWithinDirectory` & `isAllowedMediaPath`: canonicalizes paths via `realpathSync` (walking up ancestors for not-yet-written files, handling macOS `/var` -> `/private/var` symlinks) to block `..` traversal and symlink escapes across `soulmate-media://`, `queue:open-folder`, and `CrateExportService`.
  - `sanitizeExportFileName`: strips directory components and enforces expected crate extensions (`.xml`, `.crate`, `.nml`).
  - `encryptSecret` / `decryptSecret`: encrypts stored Spotify OAuth tokens and Soulseek daemon passwords at rest via Electron `safeStorage` (OS keychain / DPAPI / libsecret) with seamless migration from legacy plaintext entries and safe headless fallback.
- **Electron Main Process & Preload Hardening (`src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`):**
  - Enabled renderer `sandbox: true`, `webSecurity: true`, and `allowRunningInsecureContent: false`.
  - Removed unused raw `window.electron` (`@electron-toolkit/preload`) exposure from preload and disallowed non-contextIsolated fallback execution.
  - Denied unsolicited Chromium permissions via `session.defaultSession.setPermissionRequestHandler`.
  - Added `will-navigate` origin restriction and gated `update:simulate-status` exclusively to test environments.
  - Tightened CSP to disallow plaintext `http:` image loads and added `form-action 'none'; frame-src 'none';`.
- **Daemon, Client & OAuth Hardening (`SlskdService.ts`, `SlskdClient.ts`, `SpotifyService.ts`, `scripts/afterSign.js`):**
  - Eliminated all shell-interpolated process execution (`spawn(..., { shell: true })`, `execSync`) in favor of argument-array `execFile` / `execFileSync`.
  - Bound `slskd` web API strictly to `127.0.0.1` (`ip_address: "127.0.0.1"`), wrote `slskd.yml` with `0600` owner-only permissions and JSON-escaped YAML values, increased API key entropy to 256-bit (32 bytes), and URL-encoded all `SlskdClient` REST path parameters with strict TypeScript types (zero `no-explicit-any` warnings).
  - Replaced `Math.random()` PKCE verifier generation with `crypto.randomBytes`, added cryptographic OAuth CSRF `state` verification, and sandboxed the Spotify OAuth `BrowserWindow`.
- **macOS One-Line `curl` Installer & Release Checksums (`install.sh`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`):**
  - Added POSIX/bash macOS installer at repo root (`curl -fsSL https://raw.githubusercontent.com/lhommeduchili/soulmate/main/install.sh | bash`) with Apple Silicon / Intel auto-detection (including Rosetta detection), HTTPS TLS 1.2+ downloads, `SHA256SUMS.txt` verification, `ditto` extraction, safe atomic replacement into `/Applications` (or `~/Applications`), and automatic `xattr -cr` quarantine removal.
  - Updated `release.yml` to generate and publish `SHA256SUMS.txt` alongside release assets with `draft: false` so `/releases/latest` is immediately installable.
  - Enforced strict lint and format checks in `ci.yml` (removed `continue-on-error: true`).
