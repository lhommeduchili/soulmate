# soulmate development todo

## priority: high (phase 4: packaging & distribution)

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
- [x] distribution strategy: Tier 1 ad-hoc signing (`identity: "-"`) + `afterSign.js` deep sign permanently adopted (Apple Developer Program enrollment bypassed).

## priority: medium

- [x] standardize error handling with `apperror` and `electron-log`.
- [x] implement react error boundaries in ui.
- [x] implement robust startup check to kill zombie `slskd` processes.
- [x] display real-time download speed, progress size, and status (`QueueService`, `telemetry.ts`, `Sidebar.tsx`).
- [x] make editable track cells keyboard-operable (`EditableCell.tsx`, `EditableCell.spec.ts`, `editable-cell-a11y.spec.ts`).
- [x] configure strict typescript (`strict: true`), eslint, and husky.

## completed

### phase 18: security hardening & macos curl distribution (`v2.0.0`)

- [x] centralized security utilities (`src/main/utils/security.ts`, 13 unit tests in `security.spec.ts`) covering SSRF host/URL validation, canonicalized symlink-safe directory containment, export filename sanitization, and Electron `safeStorage` encryption/decryption.
- [x] hardened Electron renderer & IPC boundary (`src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`): enabled `sandbox: true`, removed unused raw `window.electron` exposure, restricted `shell.openExternal` and `will-navigate`, denied unsolicited Chromium permissions, confined `soulmate-media://` and `queue:open-folder` to library/queue paths, gated `update:simulate-status` to test mode, and tightened CSP (`https:`-only images, `form-action 'none'`, `frame-src 'none'`).
- [x] hardened daemon, client, OAuth & remote fetchers (`SlskdService.ts`, `SlskdClient.ts`, `SpotifyService.ts`, `CrateExportService.ts`, `MetadataService.ts`, `SoundCloudService.ts`, `BandcampService.ts`, `scripts/afterSign.js`): eliminated shell-interpolated exec calls, bound `slskd` strictly to `127.0.0.1` with `0600` config permissions and 256-bit API keys, eliminated all 11 `no-explicit-any` ESLint warnings in `SlskdClient.ts`, added cryptographic PKCE + CSRF `state` verification + `safeStorage` token encryption, and guarded exports and remote fetches against traversal/SSRF.
- [x] added macOS one-line `curl` installer (`install.sh`) with Apple Silicon/Intel/Rosetta detection, `SHA256SUMS.txt` verification, `ditto` extraction, atomic `/Applications` install, and automatic quarantine clearing; updated `release.yml` to publish checksums (`draft: false`) and `ci.yml` to enforce strict lint and formatting.
- [x] updated `README.md` and `docs/` specifications, architecture, and manual testing guides for `v2.0.0`.

### phase 17: critical-nocturne visual architecture, ascii telemetry & macos native integration

- [x] `critical-nocturne` color palette & square brutalist UI without horizontal background scanlines (`tailwind.config.js`, `src/renderer/src/assets/index.css`, `Layout.tsx`, `TopBar.tsx`, `PlaylistSelector.tsx`, `SettingsModal.tsx`, `FormatSelector.tsx`, `PeerSelectionModal.tsx`, `SetlistImportModal.tsx`, `AudioPlayer.tsx`, `LoginButton.tsx`, `PageErrorFallback.tsx`, `EditableCell.tsx`, `LoadingOverlay.tsx`, `LoginPage.tsx`).
- [x] streamlined settings & sidebar refinements: removed `$` prefix from download queue header, switched `[limpiar]` to trash icon, removed unused `region` & redundant `audioQuality` controls from `SettingsModal.tsx`, and set default format priority order to `aiff, wav, flac, mp3` (`QueueService.ts`, `FormatSelector.tsx`).
- [x] ASCII block progress bars (`░`/`█` overlay meter via `ascii-meter-*` and `data-testid="ascii-progress-*"` in `Sidebar.tsx`).
- [x] frameless macOS `hiddenInset` titlebar + traffic-light inset & drag regions (`src/main/index.ts`, `Sidebar.tsx`, `TopBar.tsx`).
- [x] rounded macOS squircle app icon (`build/icon.png`, `build/icon.icns`, `src/renderer/src/assets/logo.png`) & Dock `"soulmate"` bundle identity (`scripts/setup-mac-dev.ts`, `package.json`, `electron-builder.yml`).
- [x] playlist row thumbnails with cover fallback hydration (`PlaylistReview.tsx`, `SpotifyService.ts`, `spotifyParser.ts`, `src/renderer/index.html`) and removal of redundant per-track platform tags.
- [x] `QueueService.clearCompleted()` + `useQueue` optimistic reconciliation & widened `w-72` wrapped queue toolbar (`QueueService.ts`, `useQueue.ts`, `Sidebar.tsx`, `preload/index.d.ts`, `env.d.ts`).
- [x] strictly lowercase or UPPERCASE visible UI copy enforcement across `es-CL` and `en` (`i18n.spec.ts`, `tests/dj-library-export.spec.ts`).

### phase 16: soundcloud & bandcamp zero-login ingestion (playlists, albums & tracks)

- [x] Pure SoundCloud Parser Engine (`src/main/utils/soundCloudParser.ts`): pure extraction engine parsing `window.__sc_hydration` script JSON from public SoundCloud pages (`hydratable === "playlist"` for tracklists and `"sound"` for individual tracks), `normalizeArtworkUrl` high-resolution 500x500 artwork replacement (`-large.` to `-t500x500.`), OpenGraph metadata and public oEmbed fallback (`/oembed?format=json&url=...`), supporting standard track URLs, set/playlist URLs, mobile URLs (`m.soundcloud.com`), and shortlinks (`on.soundcloud.com`).
- [x] Pure Bandcamp Parser Engine (`src/main/utils/bandcampParser.ts`): pure extraction engine parsing Schema.org JSON-LD `<script type="application/ld+json">` (`MusicAlbum`, `MusicRecording`) and embedded `data-tralbum` JSON attributes for exact track numbers, track titles, and accurate floating-point second durations; pure ISO-8601 duration parser (`parseIsoDuration`) translating `PT3M45S`, `PT45S`, `PT1H2M3S` into milliseconds; support for standard album/track URLs and custom domain releases.
- [x] Service Orchestration & Dynamic Domain URL Routing (`src/main/services/SoundCloudService.ts`, `src/main/services/BandcampService.ts`, `src/main/services/SpotifyService.ts`): dedicated TTL-cached services, dynamic domain routing in `SpotifyService` and `useLibrary.ts` seamlessly routing Spotify, YouTube, SoundCloud, and Bandcamp URLs to their respective engines and hydrating the review table and Soulseek download queue.
- [x] UI Platform Badges, Guidance Cards & Bilingual Parity (`src/renderer/src/components/PlaylistReview.tsx`, `PlaylistSelector.tsx`, `TopBar.tsx`): Matrix platform badges rendered in review table header toolbar and track rows (`[SOUNDCLOUD]`, `[BANDCAMP]`, `[SPOTIFY]`, `[YOUTUBE]`), 4-platform guidance cards in `PlaylistSelector.tsx`, search input placeholder updated across Chilean Spanish (`es-CL`) and English (`en`), 100% key parity verified by `i18n.spec.ts`.
- [x] Silent Off-Screen E2E Execution & Non-Intrusive Testing: configured Electron main window off-screen placement and `showInactive()` in test mode (`process.env.TEST_USER_DATA_DIR`) completely eliminating desktop screen popup and focus-stealing interruptions during automated test runs.
- [x] 100% automated test coverage: 257 Vitest unit tests (22 test files; 21 tests in `soundCloudParser.spec.ts`, 18 tests in `bandcampParser.spec.ts`, 2 tests in `SoundCloudService.spec.ts`, 2 tests in `BandcampService.spec.ts`) and 55 Playwright E2E tests (22 test files; 2 new tests in `tests/soundcloud-bandcamp.spec.ts`).

### phase 15: native instruments traktor pro nml exporter, replaygain 2.0 / ebu r128 loudness tagging & "fake lossless" transcode verification

- [x] Native Instruments Traktor Pro NML Collection Exporter (`src/main/services/CrateExportService.ts`): XML generator producing compliant Traktor Pro NML v19 (`<NML VERSION="19">`, `<HEAD COMPANY="Native Instruments" PROGRAM="Traktor"/>`, `<COLLECTION>`, `<ENTRY>`, `<LOCATION>`, `<ALBUM>`, `<INFO>`, `<TEMPO>`, `<PLAYLISTS>`), formatting cross-platform directory paths (`DIR` with `/:` notation), mapping track metadata (Name, Artist, Album, BitRate, SampleRate, Size, Duration, BPM, Camelot Key in `KEY="..."` and `<KEY>...</KEY>`), and emitting playlist trees.
- [x] Non-intrusive Traktor NML export workflow in `PlaylistReview.tsx` (`data-testid="export-traktor-button"`), `crate:export-traktor` IPC handler, and quiet file creation (`collection.nml`) without involuntary Finder window focus disruption.
- [x] ReplayGain 2.0 / EBU R128 Non-Destructive Loudness Normalization Tagging (`src/main/services/MetadataService.ts`): pure RMS/peak estimation against -18.00 LUFS target level, writing standard non-destructive ReplayGain tags for FLAC (Vorbis comments: `REPLAYGAIN_TRACK_GAIN`, `REPLAYGAIN_TRACK_PEAK`, `REPLAYGAIN_ALBUM_GAIN`) and MP3 (ID3v2 TXXX: `TXXX:REPLAYGAIN_TRACK_GAIN`, `TXXX:REPLAYGAIN_TRACK_PEAK`).
- [x] Accessible ReplayGain toggle switch in `SettingsModal.tsx` (`data-testid="replaygain-toggle"`, `data-testid="replaygain-toggle-label"`, `enableReplayGain: boolean`, default: `true`), backed by `PreferencesService`.
- [x] Audiophile "Fake Lossless" Transcode & High-Frequency Cutoff Verification (`src/main/services/AudioInspection.ts`): pure 1024-point Radix-2 Cooley-Tukey FFT roll-off analysis engine (`detectFrequencyCutoff`, `verifyAudioIntegrity`), detecting ~16 kHz (128 kbps transcode) and ~19 kHz (192 kbps transcode) cutoffs vs 22 kHz+ full-spectrum lossless audio.
- [x] Integrity telemetry and amber Matrix badges: `FormatInfo.integrity` (`'genuine' | 'suspect_transcode' | 'unverified'`), `cutoffFrequency`, and warning badges rendered in `Sidebar.tsx` and `AudioPlayer.tsx` (`[TRANSCODE WARNING: ~16kHz CUTOFF]`) with tooltips.
- [x] 100% Chilean Spanish (`es-CL`) and English (`en`) bilingual parity across all Phase 15 features (verified by `i18n.spec.ts`).
- [x] 100% test automation coverage: 214 Vitest unit tests (18 test files; 4 new tests in `CrateExportService.spec.ts`, 3 new tests in `MetadataService.spec.ts`, 6 new tests in `AudioInspection.spec.ts`) and 53 Playwright E2E tests (21 test files; 3 new tests in `tests/crate-export.spec.ts`).

### phase 14: dj performance crate export (rekordbox xml & serato subcrates), camelot key/bpm tagging & dynamic bandwidth throttling

- [x] Pioneer Rekordbox XML Collection Exporter (`src/main/services/CrateExportService.ts`) generating valid `<DJ_PLAYLISTS Version="1.0.0">` XML with full track metadata (Name, Artist, Album, BitRate, SampleRate, Size, TotalTime, Year, Location URI, AverageBpm, Tonality) and collection/playlist structures.
- [x] Serato Subcrate Binary Exporter (`src/main/services/CrateExportService.ts`) serializing Serato's standard Tag-Length-Value format (`vrsn`, `otrk`, `ptrk`) with UTF-16BE drive-root normalized file paths for direct placement into `<Music>/_Serato_/Subcrates/`.
- [x] Camelot Key & BPM Extraction and Normalization (`src/main/services/AudioInspection.ts`): pure converter `toCamelotKey` translating all 24 minor/major musical keys and Open Key notation into Camelot wheel format; `parseBpm` with range validation; ID3v2 (`TKEY`, `TBPM`) and FLAC Vorbis (`INITIALKEY`, `KEY`, `BPM`) tag extraction.
- [x] Matrix-styled Camelot badges (`[8A / 126 BPM]`, `[126 BPM]`, or `[8A]`) rendered in `Sidebar.tsx`, `PlaylistReview.tsx`, and `AudioPlayer.tsx`.
- [x] Dynamic Bandwidth Rate Limiting (`PreferencesService.ts`, `QueueService.ts`, `SlskdClient.ts`, `SettingsModal.tsx`): `downloadSpeedLimit` preference with instant `POST /options` daemon reconfiguration without restarts; accessible `<select data-testid="bandwidth-limit-select">` with instant persistence.
- [x] Non-intrusive UI export actions in `PlaylistReview.tsx` (`.m3u8`, `Rekordbox XML`, `Serato .crate`) with clean notification alerts and suppression of involuntary OS Finder window focus interruptions during automated testing and exports.
- [x] 100% Chilean Spanish (`es-CL`) and English (`en`) bilingual parity across all crate export options, success alerts, Camelot badges, and bandwidth speed-limit labels.
- [x] 100% test automation coverage: 201 Vitest unit tests (18 test files; 9 new tests in `CrateExportService.spec.ts`, 15 new tests in `AudioInspection.spec.ts`) and 50 Playwright E2E tests (21 test files; 4 new tests in `tests/crate-export.spec.ts`).

### phase 13: dj setlist batch import, smart search query cascade & stalled transfer auto-failover

- [x] DJ setlist batch import parser (`src/shared/setlistParser.ts` & `src/main/utils/setlistParser.ts`) supporting Rekordbox history (tab/comma `#\tTrack Title\tArtist\tAlbum`), Traktor history, Serato CSV exports, and 1001Tracklists plaintext with timestamps (`[00:00]`), numbers (`01.`), and mix suffixes.
- [x] Matrix-styled Setlist Import dialog (`SetlistImportModal.tsx`) supporting dual input modes (raw textarea paste and drag-and-drop CSV/TXT file dropzone), real-time detected track count telemetry, custom setlist naming, and strict WCAG dialog accessibility (focus trap, `Escape` key dismiss, and focus restoration to `[data-testid="import-setlist-trigger"]`).
- [x] Seamless hydration into `PlaylistReview.tsx` (`/review/setlist/:id`) with duplicate detection badges (`[IN LIBRARY]`), skip-in-library toggle, and one-click dispatch to download queue.
- [x] Automated Search Query Expansion Cascade (`MatchMaker.ts` & `QueueService.ts`): 3-tier cascade (`Tier 1: Exact`, `Tier 2: Cleaned`, `Tier 3: Minimalist`) when searches yield 0 matches, tracking progression on `DownloadItem.searchAttempt` (1/2/3) and displaying in `Sidebar.tsx` telemetry (`SEARCHING (ATTEMPT 2/3)...`).
- [x] User preference toggle in `SettingsModal.tsx` (`autoQueryCascade: boolean`, default: `true`) backed by `PreferencesService`.
- [x] Stalled Transfer & Peer Disconnect Auto-Failover (`QueueService.ts`): detects frozen transfers (speed drops to 0 B/s for >30s or remote peer disconnects/aborts), logs diagnostic `AppError("DOWNLOAD_STALLED", ...)`, auto-binds to the next highest-scoring cached peer with free upload slots, renders yellow `[FAILOVER: @peer]` badge in `Sidebar.tsx`, and announces source switch via `aria-live="polite"`.
- [x] 100% Chilean Spanish (`es-CL`) and English (`en`) bilingual parity across all setlist import, query cascade, and failover messages.
- [x] 100% test automation coverage: 183 Vitest unit tests (17 test files; 14 new tests in `setlistParser.spec.ts`) and 46 Playwright E2E tests (20 test files; 3 new tests in `tests/setlist-import.spec.ts`).

### phase 12: manual peer/source selection, query tuning for unmatched tracks & audiophile format verification

- [x] audiophile container inspection engine (`AudioInspection.ts`) parsing FLAC `STREAMINFO` blocks (sample rate, bit depth, channels) and MP3 MPEG-1/2 Layer III frame headers (sample rate, bitrate, CBR/VBR detection via Xing/Info tags) with ID3v2 syncsafe skip.
- [x] verified audio technical specifications stored in `DownloadItem.formatInfo` and rendered as Matrix-styled badges (`[24-BIT / 96kHz]`, `[16-BIT / 44.1kHz]`, `[320 KBPS]`) in `Sidebar.tsx` and `AudioPlayer.tsx`.
- [x] manual query tuning for failed and unmatched tracks via `[EDIT QUERY]` inline input in `Sidebar.tsx`, dispatching `queue:retry-with-query` IPC handler validated via Zod schema (`RetryWithQueryPayloadSchema`).
- [x] manual peer & source selection modal (`PeerSelectionModal.tsx`) showing live/cached Soulseek peer search results with full accessibility (`role="dialog"`, `aria-modal="true"`, focus trap on open, `Escape` dismissal, focus restoration).
- [x] one-click source binding (`queue:select-source` IPC handler) immediately downloading the chosen file and associating it with the queue item.
- [x] 100% bilingual parity across Chilean Spanish (`es-CL`) and English (`en`) message catalogs (23 new keys each, 100% key parity verified by `i18n.spec.ts`).
- [x] 100% test automation coverage: 158 Vitest unit tests (9 new tests in `AudioInspection.spec.ts`, 3 new tests in `QueueService.spec.ts`) and 43 Playwright E2E tests (3 new tests in `tests/peer-source-selection.spec.ts`).

### phase 11: persistent download queue, batch pause/resume, concurrency limiting & audiophile in-app audio preview

- [x] persistent download queue lifecycle (`QueuePersistence.ts`) serializing queue state transitions to `electron-store` with startup crash recovery transitioning interrupted active transfers (`downloading`, `searching`, `connecting`, `queued`, `tagging`) cleanly to `paused`.
- [x] batch transfer management IPC handlers (`queue:get`, `queue:pause-all`, `queue:resume-all`, `queue:clear-completed`) with remote Soulseek download abort via `slskdClient.cancelDownload`.
- [x] configurable download concurrency limiting (`maxConcurrentDownloads`: 1, 2, 3, or unlimited/0; default: 2) in schemas, `PreferencesService`, and enforcement in `QueueService.processQueue()`.
- [x] accessible "Max Concurrent Downloads" select dropdown in `SettingsModal.tsx` with instant preference persistence.
- [x] secure in-app audio audition preview player (`AudioPlayerContext.tsx`, `AudioPlayer.tsx`) streaming local `.flac` and `.mp3` files via custom privileged protocol `soulmate-media://` under strict CSP.
- [x] responsive Matrix-styled audio preview bar with play/pause, seek scrubber, elapsed/total time, volume slider, dismiss button, and keyboard shortcuts (`Space` to toggle playback, `Escape` to dismiss).
- [x] UI contextual actions in `Sidebar.tsx` (Queue action toolbar with Pause All / Resume All, Clear Completed, and audition triggers on completed items) and `PlaylistReview.tsx` (audition triggers on tracks in library).
- [x] 100% bilingual parity across Chilean Spanish (`es-CL`) and English (`en`) message catalogs.
- [x] 100% test automation coverage: 146 Vitest unit tests (5 new tests in `QueuePersistence.spec.ts`, updated tests in `QueueService.spec.ts`) and 40 Playwright E2E tests (4 new tests in `tests/queue-persistence.spec.ts`).

### phase 10: dj playlist manifest export (.m3u8), library duplicate detection & silent background updates

- [x] DJ playlist manifest generator (`PlaylistExportService.ts`) producing standard UTF-8 extended `#EXTM3U` and `#EXTINF` files with normalized relative paths to audio files for drag-and-drop DJ software import.
- [x] automatic `.m3u8` manifest creation/update upon completion of queue batches, and manual export trigger via `queue:export-playlist` IPC handler.
- [x] local library scanner (`LibraryService.ts`) detecting existing FLAC and MP3 files across flat and nested DJ hierarchies within the user's download directory.
- [x] playlist review duplicate indication (`PlaylistReview.tsx`) with Matrix-styled `[IN LIBRARY]` / `[EN BIBLIOTECA]` badges and keyboard-operable skip toggle.
- [x] instant deduplication in `QueueService.addToQueue` marking tracks completed with their existing paths without redundant network transfers.
- [x] silent background auto-updater (`UpdateService.ts`) using `electron-updater` configured for GitHub Releases (`lhommeduchili/soulmate`) with test-environment isolation and simulation hooks.
- [x] non-intrusive `update-available-pill` in `TopBar.tsx` and System Updates card in `SettingsModal.tsx` for one-click restart and update.
- [x] full bilingual parity across Chilean Spanish (`es-CL`) and English (`en`) message catalogs.
- [x] 100% test automation coverage: 135 Vitest unit tests (9 new tests in `PlaylistExportService.spec.ts` and `UpdateService.spec.ts`) and 36 Playwright E2E tests (4 new tests in `tests/dj-library-export.spec.ts`).

### phase 9: audiophile post-download pipeline: metadata tagging (id3v2 & vorbis comments), album art injection & dj file organization

- [x] native Node/TypeScript audio tagging service (`MetadataService.ts`) for FLAC (Vorbis comments: `TITLE`, `ARTIST`, `ALBUM`, `TRACKNUMBER`, `DATE`, and `METADATA_BLOCK_PICTURE`) and MP3 (`ID3v2.3`/`ID3v2.4`: `TIT2`, `TPE1`, `TALB`, `TRCK`, `APIC` via `node-id3`) without external Python or CLI dependencies.
- [x] zero-corruption graceful degradation preserving original audio intact on metadata or image download timeouts with structured `AppError` logging.
- [x] cross-platform filename sanitization (`sanitizeFilename`) eliminating forbidden characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) and control characters while preserving international Unicode characters (accents, Japanese, Cyrillic).
- [x] standard DJ file and folder organization hierarchy: `<DownloadDir>/<Artist>/<Album>/<TrackNumber> - <Title>.<ext>` or `<DownloadDir>/<Artist> - <Title>.<ext>`.
- [x] atomic file rename and staging transfer to avoid partial-read conflicts with DJ performance software (rekordbox, Traktor, Serato, Engine DJ).
- [x] queue lifecycle integration in `QueueService.ts` transitioning completed transfers through `tagging` -> `completed` and updating `targetPath`.
- [x] native OS folder reveal IPC handler `queue:open-folder` utilizing Electron's `shell.showItemInFolder`.
- [x] Matrix-themed sidebar telemetry rendering animated `TAGGING...` state and one-click folder reveal button with accessible tooltips and ARIA live announcements.
- [x] full localization across Chilean Spanish (`es-CL`) and English (`en`) message catalogs.
- [x] 100% test automation coverage: 126 Vitest unit tests (including `MetadataService.spec.ts`) and 32 Playwright E2E tests (including `tests/metadata-pipeline.spec.ts`).

### phase 8: standardized error architecture, react error boundaries & pre-commit tooling

- [x] strongly typed error domain (`AppError.ts`) with standardized error codes and safe serialization stripping internal paths & credentials.
- [x] hardened `logger.ts` with test-environment safe fallback and structured timestamp/level/scope formatting.
- [x] isolated React `ErrorBoundary.tsx` and Matrix-themed recovery cards in `PageErrorFallback.tsx` with Retry, Reset Workspace, and Reload actions.
- [x] isolated boundaries wrapping `Sidebar`, `PlaylistsPage`, and `ReviewPage` to eliminate whole-app white-screens.
- [x] localized recovery text across `es-CL` and `en` message catalogs via resilient `useSafeI18n()`.
- [x] actionable, localized UI toast/alert notifications for IPC failures without unhandled promise rejections.
- [x] husky pre-commit hook enforcing `npm run lint`, `npm run format:check`, and `npm run typecheck`.
- [x] modern ESLint flat configuration (`eslint.config.mjs`) compatible with ESLint 10 and `typescript-eslint`.
- [x] comprehensive test suites: 109 Vitest unit tests (including `AppError.spec.ts` and `ErrorBoundary.spec.ts`) and 29 Playwright E2E tests (including `tests/error-handling.spec.ts`).

### phase 7: real-time transfer telemetry, queue metrics & keyboard cell editing

- [x] real-time download speed tracking and human-readable formatting (B/s, KB/s, MB/s, GB/s) in `QueueService` and `telemetry.ts`.
- [x] bytes transferred vs total file size tracking (e.g. `4.2 MB / 10.5 MB`) with active peer status display.
- [x] robust transfer state mapping covering `queued`, `connecting`, `downloading`, `completed`, and `failed`.
- [x] safe retry capability for failed downloads over IPC (`queue:retry`) with remote transfer cleanup and re-queueing.
- [x] cyberpunk Matrix sidebar telemetry with real-time speed, peer badges, progress percentage, and retry button for failed items.
- [x] accessible ARIA live regions (`aria-live="polite"`) for screen reader announcements on status transitions.
- [x] keyboard-operable track cell editing (`EditableCell.tsx`): Enter/Space to edit, Escape to cancel, Enter to save, focus restoration to trigger button, and visible focus rings.
- [x] 100% green unit test coverage (`EditableCell.spec.ts`, `QueueService.spec.ts`) and Playwright E2E coverage (`queue-telemetry.spec.ts`, `editable-cell-a11y.spec.ts`).

### phase 5: preferences service, settings a11y & regional localization

- [x] implement typed preferences model for locale, region, download path, and format priority (`src/shared/schemas.ts`, `src/shared/preferences.ts`).
- [x] centralize settings persistence in a dedicated `PreferencesService` backed by `electron-store` with validated IPC handlers (`preferences:get`, `preferences:set`).
- [x] add renderer i18n foundation with `es-CL` (Chile default) and `en` message catalogs.
- [x] localize top bar, settings, playlist selector, review page, and queue sidebar surfaces.
- [x] make settings modal a fully accessible dialog with focus trap on open, escape close, and focus restoration to trigger button.
- [x] standardize visible focus rings (`focus-visible:ring-2 focus-visible:ring-soul-green`) across interactive modal and UI elements.
- [x] wire Chile (`CL`) default market preferences into market-aware fetch requests.
- [x] add Playwright E2E test coverage for preferences persistence, language switching, and settings accessibility (`tests/settings-preferences.spec.ts`).
- [x] add Vitest unit test coverage for preference defaults, schema validation, and persistence (`src/main/services/PreferencesService.spec.ts`, `src/shared/preferences.spec.ts`).

### phase 6: zero-login spotify & youtube ingestion (playlists, albums, tracks & videos)

- [x] implement pure extractor engine for Spotify public HTML payloads (`spotifyParser.ts` + `spotifyParser.spec.ts`).
- [x] integrate multi-tier fallback cascade in `SpotifyService` (embed -> open page -> oembed with URL normalization).
- [x] verify queue pipeline & Playwright E2E ingestion (`tests/playlist-add.spec.ts`, `QueueService.spec.ts`, schema & HTML entity cleaning).
- [x] sprint 4: streamline UI & demote login (welcoming zero-login workspace, demote Spotify connect to Settings modal, matrix decrypting indicator, inline error feedback, Playwright tests).
- [x] sprint 5: zero-login album and single-track ingestion (`parseAlbumHtml`, `parseTrackHtml`, cascade resolution, Playwright E2E `tests/album-add.spec.ts`).
- [x] support youtube public playlists and single videos (oEmbed & watch-page fallback, `extractYoutubeVideoId`, unit tests).

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
