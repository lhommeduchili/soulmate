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
- [x] integrate `electron-updater` for silent auto-updates.
- [x] distribution strategy: Tier 1 ad-hoc signing (`identity: "-"`) + `afterSign.js` deep sign permanently adopted (Apple Developer Program enrollment bypassed).
- **goal:** production-ready `soulmate.app` (mac) and auto-updating infrastructure.

## phase 5: accessibility & regional localization

- [x] add typed app preferences for locale, region, download path, and format priority.
- [x] centralize settings persistence behind validated main-process preferences service and preload api.
- [x] add renderer preferences/i18n provider with `es-CL` and `en` catalogs.
- [x] upgrade settings modal to accessible dialog behavior with focus trap and keyboard support.
- [x] localize core shell surfaces (top bar, login, settings, playlist and queue status text).
- [x] wire chile (`CL`) region into spotify market-aware requests.
- [x] add playwright coverage for preferences persistence, locale application, and settings accessibility.
- [x] add vitest coverage for preference schema and locale fallback logic.
- **goal:** accessible, keyboard-navigable, chile-first multilingual foundation that scales to more locales and regions.

## phase 6: zero-login spotify & youtube ingestion (playlists, albums, tracks & videos)

- [x] **sprint 1:** pure extractor engine (`spotifyParser.ts` + `spotifyParser.spec.ts` 100% green).
- [x] **sprint 2:** service integration & multi-tier cascade (`SpotifyService.ts` embed -> open page -> oembed with URL normalization and unit tests).
- [x] **sprint 3:** end-to-end verification & queue pipeline validation (`tests/playlist-add.spec.ts`, `QueueService.spec.ts`, schema & HTML entity cleaning).
- [x] **sprint 4:** ui streamlining & login demotion (removal of prominent login banner, welcoming zero-login import workspace, spotify sync demoted to settings modal, matrix decrypting feedback, inline error alerts, and playwright e2e validation).
- [x] **sprint 5:** album, single-track & youtube single-video ingestion (extended `extractSpotifyEntity`, `parseAlbumHtml`, `parseTrackHtml`, `extractYoutubeVideoId`, YouTube single-video resolution, TTL cache, unit test coverage in `spotifyParser.spec.ts`, `SpotifyService.spec.ts`, `YoutubeService.spec.ts`, and Playwright E2E coverage in `tests/album-add.spec.ts`).
- **goal:** zero-configuration public playlist, album, single-track, and YouTube video downloads without Spotify accounts or API tokens.

## phase 7: real-time transfer telemetry, queue metrics & keyboard cell editing

- [x] **sprint 1:** pure telemetry & speed calculations (`telemetry.ts`, `QueueService.ts`, speed/size formatting, slskd state mapping).
- [x] **sprint 2:** controller & queue telemetry orchestration (`queue:retry` IPC handler, preload API, `useQueue` hook, cancellation of active transfers on retry/cancel).
- [x] **sprint 3:** cyberpunk Matrix sidebar updates (`Sidebar.tsx` real-time speed, peer badge, progress %, remaining size, retry button, localized strings across `es-CL` and `en`, ARIA live region `aria-live="polite"`).
- [x] **sprint 4:** keyboard-operable track cell editing (`EditableCell.tsx`: Enter/Space to edit, Escape to cancel, Enter to save, focus restoration to button, focus visible rings).
- [x] **sprint 5:** comprehensive test automation (Vitest unit tests in `EditableCell.spec.ts` and `QueueService.spec.ts`, Playwright E2E tests in `queue-telemetry.spec.ts` and `editable-cell-a11y.spec.ts`).
- **goal:** full visibility into download speeds, progress, active peers, and accessible, WCAG-compliant track review editing with zero mouse requirement.

## phase 8: standardized error architecture, react error boundaries & pre-commit tooling

- [x] **sprint 1:** error domain & serialization (`src/main/utils/AppError.ts`, strongly typed `AppErrorCode`, safe IPC serialization stripping file paths & credentials, `AppError.spec.ts`).
- [x] **sprint 2:** logging hardening (`src/main/utils/logger.ts`, safe test-environment fallback, structured timestamp/level/scope format, `createComponentLogger`).
- [x] **sprint 3:** react error boundaries & matrix recovery (`ErrorBoundary.tsx`, `PageErrorFallback.tsx`, localized `es-CL`/`en` recovery cards with Retry and Reset Workspace, isolated boundaries around `Sidebar`, `PlaylistsPage`, and `ReviewPage`).
- [x] **sprint 4:** mandatory pre-commit tooling & git hygiene (Husky pre-commit hook executing `npm run lint`, `npm run format:check`, and `npm run typecheck`, modern ESLint flat config with `typescript-eslint`).
- [x] **sprint 5:** rigorous test verification (19 Vitest unit tests in `AppError.spec.ts` and `ErrorBoundary.spec.ts`, 4 Playwright E2E tests in `tests/error-handling.spec.ts`).
- **goal:** end-to-end desktop stability, complete avoidance of blank/white screens on component failure, and automated git hygiene enforcement.

## phase 9: audiophile post-download pipeline: metadata tagging, album art injection & dj file organization

- [x] **sprint 1:** pure audio tagging engine (`MetadataService.ts`, FLAC Vorbis comments `TITLE`, `ARTIST`, `ALBUM`, `TRACKNUMBER`, `DATE`, embedded `METADATA_BLOCK_PICTURE`, MP3 ID3v2.3/ID3v2.4 `TIT2`, `TPE1`, `TALB`, `TRCK`, `APIC` via `node-id3`).
- [x] **sprint 2:** filename sanitization & dj directory hierarchy (`sanitizeFilename` eliminating forbidden characters `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` while preserving Unicode accents, Japanese, and Cyrillic; `buildTargetFilePath` implementing `<DownloadDir>/<Artist>/<Album>/<TrackNumber> - <Title>.<ext>` or `<DownloadDir>/<Artist> - <Title>.<ext>`).
- [x] **sprint 3:** queue completion lifecycle & atomic transfer (`QueueService.ts` hooking post-download transition `downloading` -> `tagging` -> `completed`, atomic staging rename, `queue:open-folder` IPC handler via `shell.showItemInFolder`).
- [x] **sprint 4:** ui telemetry & reveal action (`Sidebar.tsx` real-time `TAGGING...` indicator, accessible "Reveal in Folder" button on completed items, full localization across `es-CL` and `en` message catalogs).
- [x] **sprint 5:** comprehensive test automation (17 Vitest unit tests in `MetadataService.spec.ts`, 3 Playwright E2E tests in `metadata-pipeline.spec.ts`, 100% green suite).
- **goal:** downloads are instantly library-ready for DJ performance software (rekordbox, Traktor, Serato, Engine DJ) with pristine metadata and one-click folder access.

## phase 10: dj playlist manifest export (.m3u8), library duplicate detection & silent background updates

- [x] **sprint 1:** playlist export service (`PlaylistExportService.ts`, standard UTF-8 `#EXTM3U` and `#EXTINF` generation, cross-platform relative path resolution, automatic post-batch export, manual `queue:export-playlist` IPC handler, 6 Vitest unit tests).
- [x] **sprint 2:** local library duplicate detection (`LibraryService.ts`, scanning `<DownloadDir>` for existing FLAC/MP3 files across flat and nested DJ hierarchies, `library:check-tracks` IPC handler, immediate queue deduplication in `QueueService`).
- [x] **sprint 3:** silent background auto-updater (`UpdateService.ts`, `electron-updater` integration targeting GitHub Releases, decoupled lazy loading with test-environment isolation, IPC channels for status/check/install/simulate, 3 Vitest unit tests).
- [x] **sprint 4:** ui telemetry & contextual actions (`PlaylistReview.tsx` with `[IN LIBRARY]` badges, skip toggle checkbox, export manifest button; `Sidebar.tsx` completed playlist manifest banner with reveal action; `TopBar.tsx` update notification pill; `SettingsModal.tsx` System Updates card; full `es-CL`/`en` localization).
- [x] **sprint 5:** comprehensive test automation & verification (9 new Vitest unit tests in `PlaylistExportService.spec.ts` and `UpdateService.spec.ts`, 4 new Playwright E2E tests in `tests/dj-library-export.spec.ts`, 0 regression across entire test suite).
- **goal:** seamless integration with DJ performance software (rekordbox, Traktor, Serato, Engine DJ) via single drag-and-drop `.m3u8` playlists, zero duplicate downloads, and background auto-updating.

## phase 11: persistent download queue, batch pause/resume, concurrency limiting & audiophile in-app audio preview

- [x] **sprint 1:** persistent queue & crash recovery (`QueuePersistence.ts`, `QueuePersistence.spec.ts`, serialization to `electron-store`, interrupted download recovery to `paused`, IPC handlers `queue:get`, `queue:pause-all`, `queue:resume-all`, `queue:clear-completed`).
- [x] **sprint 2:** configurable download concurrency & bandwidth throttling (`maxConcurrentDownloads` preference schema, `PreferencesService`, concurrency enforcement in `QueueService.processQueue()`, select dropdown in `SettingsModal.tsx`).
- [x] **sprint 3:** audiophile in-app audio preview player (`soulmate-media://` protocol handler in `main/index.ts`, CSP config in `index.html`, `AudioPlayerContext.tsx`, `AudioPlayer.tsx` bar with seek/volume/stop/time, `Space`/`Escape` keyboard shortcuts, ARIA live region).
- [x] **sprint 4:** ui telemetry & contextual actions (`Sidebar.tsx` queue toolbar with Pause All/Resume All, Clear Completed, audition trigger buttons on completed items; `PlaylistReview.tsx` audition buttons on in-library tracks; 100% bilingual parity across `es-CL` and `en`).
- [x] **sprint 5:** comprehensive test automation & verification (5 Vitest unit tests in `QueuePersistence.spec.ts`, updated unit tests in `QueueService.spec.ts`, 4 Playwright E2E tests in `tests/queue-persistence.spec.ts`, 100% green test suite across 146 unit tests and 40 E2E tests).
- **goal:** DJs can manage long batch transfers without data loss on crashes, control download bandwidth, and preview tracks in-app before DJ software export.

## phase 12: manual peer/source selection, query tuning for unmatched tracks & audiophile format verification

- [x] **sprint 1:** audiophile container inspection engine (`AudioInspection.ts`, `AudioInspection.spec.ts`, FLAC STREAMINFO 34-byte block parser, MP3 MPEG-1/2 Layer III frame header parser with ID3v2 syncsafe skip and Xing/Info/VBRI VBR detection, 9 Vitest unit tests).
- [x] **sprint 2:** manual query tuning & IPC orchestration (`queue:retry-with-query` IPC handler, `RetryWithQueryPayloadSchema`, `QueueService.retryWithQuery` aborting active downloads, updating `customQuery`, and initiating a fresh Soulseek search, 3 new unit tests in `QueueService.spec.ts`).
- [x] **sprint 3:** manual peer selection modal & source binding (`PeerSelectionModal.tsx`, `queue:search-sources` with caching/flattening, `queue:select-source` with `SelectSourcePayloadSchema`, WCAG dialog accessibility with focus trap and Escape handler).
- [x] **sprint 4:** ui telemetry, audiophile badges & audio player integration (`Sidebar.tsx` with inline query editor, choose source triggers, audiophile format badges `[24-BIT / 96kHz]`, `[16-BIT / 44.1kHz]`, `[320 KBPS]`; `AudioPlayer.tsx` badge rendering; 100% bilingual parity across Chilean Spanish `es-CL` and `en`).
- [x] **sprint 5:** comprehensive test automation & verification (158 Vitest unit tests, 43 Playwright E2E tests including `tests/peer-source-selection.spec.ts`, 0 type errors, 0 linter warnings).
- **goal:** empower DJs with granular control over failed/unmatched tracks, peer selection transparency, and guaranteed audio stream technical specifications.

## phase 13: dj setlist batch import, smart search query cascade & stalled transfer auto-failover

- [x] **sprint 1:** pure setlist parsing engine (`src/shared/setlistParser.ts` + `src/main/utils/setlistParser.ts`, Rekordbox history tab/comma tables, Traktor history, Serato CSV, 1001Tracklists timestamps/number prefixes, 14 Vitest unit tests in `setlistParser.spec.ts`).
- [x] **sprint 2:** automated search query expansion cascade (`MatchMaker.ts` Tier 1 Exact -> Tier 2 Cleaned -> Tier 3 Minimalist cascade generator, clean relevance matching, `QueueService.ts` search attempt progression, `autoQueryCascade` user preference in `SettingsModal.tsx`, 6 unit tests in `MatchMaker.spec.ts`).
- [x] **sprint 3:** stalled transfer auto-failover (`QueueService.ts` 0 B/s stalled transfer detection for >30s and remote abort detection, auto-binding to next best scoring cached peer with free upload slots, diagnostic `AppError("DOWNLOAD_STALLED", ...)`, `QueueService.spec.ts` unit tests).
- [x] **sprint 4:** ui components, telemetry & bilingual parity (`SetlistImportModal.tsx` Matrix dialog with plaintext paste, CSV dropzone, track counter, accessibility focus trap and escape dismiss; `Sidebar.tsx` cascade attempt label `SEARCHING (ATTEMPT 2/3)...`, `[FAILOVER: @peer]` badge, and `aria-live="polite"` failover announcement; 100% `es-CL`/`en` parity).
- [x] **sprint 5:** comprehensive test automation & verification (183 green Vitest unit tests across 17 files, 46 green Playwright E2E tests across 20 files including `tests/setlist-import.spec.ts`, 0 errors/warnings on typecheck and husky pre-commit).
- **goal:** empower DJs to batch import tracklists from DJ software history or raw text notes, eliminate stuck transfers with automatic peer failover, and avoid missing tracks with query cascade expansion.

## phase 14: dj performance crate export (rekordbox xml & serato subcrates), camelot key/bpm tagging & dynamic bandwidth throttling

- [x] **sprint 1:** pure crate export engine (`CrateExportService.ts`, Pioneer Rekordbox XML v1.0.0 serializer with `COLLECTION` and `PLAYLISTS` nodes, Serato `.crate` big-endian TLV binary serializer with `vrsn`/`otrk`/`ptrk` blocks and drive-root normalized paths, 9 Vitest unit tests in `CrateExportService.spec.ts`).
- [x] **sprint 2:** camelot key & bpm extraction and normalization (`AudioInspection.ts`, `toCamelotKey` supporting all 24 musical keys and Open Key notation, `parseBpm` with range validation, ID3v2 `TKEY`/`TBPM` and FLAC Vorbis `INITIALKEY`/`KEY`/`BPM` tagging extraction, 15 Vitest unit tests in `AudioInspection.spec.ts`).
- [x] **sprint 3:** dynamic bandwidth rate limiting (`PreferencesService.ts`, `QueueService.ts`, `SlskdClient.ts`, `downloadSpeedLimit` preference with instant `POST /options` daemon reconfiguration without restarts, accessible dropdown in `SettingsModal.tsx`).
- [x] **sprint 4:** ui components, camelot badges & non-intrusive export feedback (`PlaylistReview.tsx` crate export buttons for `.m3u8`, `Rekordbox XML`, `Serato .crate`, non-intrusive alert toasts, Matrix-styled Camelot badges `[8A / 126 BPM]` across `Sidebar.tsx`, `PlaylistReview.tsx`, `AudioPlayer.tsx`, 100% `es-CL`/`en` parity).
- [x] **sprint 5:** comprehensive test automation & verification (201 green Vitest unit tests across 18 files, 50 green Playwright E2E tests across 21 files including `tests/crate-export.spec.ts`, 0 errors/warnings on typecheck and husky pre-commit).
- **goal:** empower DJs to seamlessly export downloaded libraries directly into Pioneer Rekordbox and Serato DJ, standardize harmonic mixing metadata via Camelot notation, and give users full control over network bandwidth.

## phase 15: native instruments traktor pro nml exporter, replaygain 2.0 / ebu r128 loudness tagging & "fake lossless" transcode verification

- [x] **sprint 1:** traktor nml export engine (`CrateExportService.ts`, Traktor Pro NML v19 XML serializer with `COLLECTION`, `ENTRY`, `LOCATION`, `ALBUM`, `INFO`, `TEMPO`, and `PLAYLISTS` nodes, cross-platform `DIR` formatting with `/:` notation, 4 Vitest unit tests in `CrateExportService.spec.ts`).
- [x] **sprint 2:** replaygain 2.0 / ebu r128 loudness normalization tagging (`MetadataService.ts`, RMS/LUFS -18.00 loudness calculation, FLAC Vorbis comments `REPLAYGAIN_TRACK_GAIN`/`PEAK`/`ALBUM_GAIN`, MP3 ID3v2 `TXXX:REPLAYGAIN_TRACK_GAIN`/`PEAK`, `enableReplayGain` preference with toggle in `SettingsModal.tsx`, 3 Vitest unit tests in `MetadataService.spec.ts`).
- [x] **sprint 3:** audiophile fake lossless transcode detection (`AudioInspection.ts`, 1024-point Radix-2 Cooley-Tukey FFT roll-off analysis, ~16 kHz & ~19 kHz cutoffs vs 22 kHz+ full-spectrum identification, `FormatInfo.integrity` status, 6 Vitest unit tests in `AudioInspection.spec.ts`).
- [x] **sprint 4:** ui components, badges & non-intrusive export feedback (`PlaylistReview.tsx` with Traktor NML export button and alert banner; `Sidebar.tsx` and `AudioPlayer.tsx` with amber Matrix transcode warning badges `[TRANSCODE WARNING: ~16kHz CUTOFF]`; 100% bilingual parity across `es-CL` and `en`).
- [x] **sprint 5:** comprehensive test automation & verification (214 green Vitest unit tests across 18 files, 53 green Playwright E2E tests across 21 files including Traktor NML export, ReplayGain toggle persistence, and transcode warning badges in `tests/crate-export.spec.ts`, 0 errors/warnings on typecheck and husky pre-commit).
- **goal:** complete the holy trinity of DJ performance software export (Rekordbox, Serato, Traktor), protect audiophiles against upscaled low-bitrate MP3s disguised as FLACs, and prevent volume jumps between tracks with standard ReplayGain 2.0 metadata tags.

## phase 16: soundcloud & bandcamp zero-login ingestion (playlists, albums & tracks)

- [x] **sprint 1:** pure soundcloud parser engine (`soundCloudParser.ts`, hydration parser extracting `hydratable === "playlist"` and `"sound"`, `normalizeArtworkUrl` high-res 500x500 mapping, oEmbed fallback, URL slug/track/set extraction, 21 Vitest unit tests in `soundCloudParser.spec.ts`).
- [x] **sprint 2:** pure bandcamp parser engine (`bandcampParser.ts`, Schema.org JSON-LD `MusicAlbum`/`MusicRecording` parser, `data-tralbum` attribute parser, `parseIsoDuration` ISO-8601 millisecond converter, custom domain support, 18 Vitest unit tests in `bandcampParser.spec.ts`).
- [x] **sprint 3:** service orchestration & dynamic url routing (`SoundCloudService.ts`, `BandcampService.ts`, dynamic domain routing in `SpotifyService.ts` and `useLibrary.ts`, IPC channels `soundcloud:*` and `bandcamp:*`, 4 unit tests across `SoundCloudService.spec.ts` and `BandcampService.spec.ts`).
- [x] **sprint 4:** ui platform badges, guidance cards & bilingual parity (`PlaylistReview.tsx` with `[SOUNDCLOUD]`, `[BANDCAMP]`, `[SPOTIFY]`, `[YOUTUBE]` header and track badges; `PlaylistSelector.tsx` 4-card guidance grid; `TopBar.tsx` search input placeholder; 100% Chilean Spanish `es-CL` and `en` key parity verified by `i18n.spec.ts`).
- [x] **sprint 5:** comprehensive test automation & silent off-screen e2e execution (257 green Vitest unit tests across 22 files, 55 green Playwright E2E tests across 22 files including `tests/soundcloud-bandcamp.spec.ts`, silent off-screen window configuration eliminating desktop popup interruptions, 0 errors/warnings on typecheck and husky pre-commit).
- **goal:** empower DJs and audiophiles to ingest underground dance music, DJ mixes, self-released albums, and exclusive tracks from SoundCloud and Bandcamp with zero login required.

## phase 17: critical-nocturne visual overhaul, ascii telemetry & macos native integration

- [x] **sprint 1:** replace generic zinc/neon palette and rounded pill geometry with the `critical-nocturne` void-black/bone/oxblood/phosphor-green design system (`tailwind.config.js`, `src/renderer/src/assets/index.css`, `Layout.tsx`, all UI components) plus dual-layer ASCII block (`░`/`█`) download progress bars (`Sidebar.tsx`).
- [x] **sprint 2:** eliminate macOS default titlebar border (`titleBarStyle: "hiddenInset"`, `trafficLightPosition`, `-webkit-app-region: drag/no-drag`), implement pure-TS `scripts/setup-mac-dev.ts` generating Apple squircle `build/icon.png` / `build/icon.icns` and patching dev `Info.plist` + `electron-builder.yml` so macOS Dock displays `"soulmate"`, not `"Electron"`.
- [x] **sprint 3:** add `32x32` track thumbnails with album/playlist cover fallback hydration (`PlaylistReview.tsx`, `SpotifyService.ts`, `spotifyParser.ts`, expanded CSP `img-src`), remove redundant per-track platform tags, harden `QueueService.clearCompleted()` + `useQueue` state reconciliation, streamline `SettingsModal` (drop unused `region` & redundant `audioQuality`, default format order `aiff, wav, flac, mp3`), polish sidebar header (`$`, trash icon) & background (remove horizontal grid), and enforce strictly lowercase / strictly UPPERCASE visible UI copy across `es-CL` and `en` (`i18n.spec.ts`).
- **goal:** deliver an authentic underground brutalist-terminal desktop aesthetic with seamless macOS integration and zero visual clutter.

## phase 18: security hardening & macos curl distribution (`v2.0.0`)

- [x] **sprint 1:** centralized security utilities (`src/main/utils/security.ts`, `src/main/utils/security.spec.ts`) providing SSRF URL validation, canonicalized symlink-safe path containment, export filename sanitization, and Electron `safeStorage` credential encryption.
- [x] **sprint 2:** Electron BrowserWindow, preload, CSP & IPC hardening (`sandbox: true`, least-privilege `window.api` preload without raw `window.electron`, `shell.openExternal` protocol validation, `will-navigate` guards, permission request denial, `soulmate-media://` & `queue:open-folder` path containment, production gating on `update:simulate-status`, tightened `https:`-only CSP).
- [x] **sprint 3:** daemon, client, OAuth & export hardening (`SlskdService` loopback `127.0.0.1` binding + `0600` config + zero-shell `execFile`/`execFileSync` + 256-bit API key; `SlskdClient` strict types + URL-encoded path params; `SpotifyService` `crypto.randomBytes` PKCE + CSRF `state` verification + sandboxed auth window + encrypted tokens; `CrateExportService` traversal sanitization; `MetadataService`/`SoundCloudService`/`BandcampService` SSRF & size caps).
- [x] **sprint 4:** macOS one-line `curl` installer (`install.sh` with arch/Rosetta detection, `SHA256SUMS.txt` verification, `ditto` extraction, `/Applications` atomic install, and `xattr -cr` quarantine removal), CI strict lint/format enforcement (`ci.yml`), and automated release checksums + publication (`release.yml`).
- [x] **sprint 5:** full documentation alignment (`README.md`, `SPECIFICATIONS.md`, `PLAN.md`, `TODO.md`, `HOW_DOES_IT_WORK.md`, `MANUAL_TESTING.md`), version bump to `v2.0.0`, and end-to-end verification.
- **goal:** ship `v2.0.0` with defense-in-depth desktop security and frictionless one-command macOS installation.
