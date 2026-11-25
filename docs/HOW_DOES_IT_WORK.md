# soulmate: system architecture & workflow overview

## 1. core architecture (mvc-electron)

the application uses an **electron main process** as the central controller, orchestrating communication between the sandboxed react renderer and backend services over zod-validated ipc.

- **frontend (renderer):** react + vite + typescript in a sandboxed `BrowserWindow` (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`). communicates exclusively through the scoped `window.api` preload bridge.
- **controller (main ipc):** `ipcMain.handle` handlers in `src/main/index.ts`, validating every payload with `zod` schemas (`src/shared/schemas.ts`, `src/shared/preferences.ts`).
- **model / services (`src/main/services/`):**
  - `SlskdService`: manages the bundled `slskd` daemon lifecycle, loopback-only config (`127.0.0.1`, `0600` permissions, 256-bit api key), and zero-shell zombie cleanup (`execFile`/`execFileSync`).
  - `SlskdClient`: typed loopback http client (`127.0.0.1`) for `slskd` api v0 with sqlite `search.db` fallback.
  - `SpotifyService`, `YoutubeService`, `SoundCloudService`, `BandcampService`: zero-login public ingestion with 5-minute ttl caching and optional spotify oauth pkce sync.
  - `QueueService` & `QueuePersistence`: concurrent download orchestration, 3-tier search query expansion cascade (`MatchMaker`), stalled-transfer auto-failover, manual peer selection, inline query retry, bandwidth throttling, and crash-safe persistence.
  - `AudioInspection`: binary flac/mp3 header verification, camelot key & bpm extraction, and 1024-point fft fake-lossless transcode detection.
  - `MetadataService`: native flac vorbis comment + picture injection, mp3 id3v2 tagging, replaygain 2.0 / ebu r128 loudness tags, and atomic dj folder organization.
  - `LibraryService`, `PlaylistExportService`, `CrateExportService`: local duplicate detection and exports for `.m3u8`, pioneer rekordbox xml, serato `.crate` binary subcrates, and native instruments traktor pro `.nml`.
  - `UpdateService`: silent background updates from github releases via `electron-updater`.
- **security & errors (`src/main/utils/`):** `security.ts` (ssrf guards, symlink-safe path containment, `safeStorage` credential encryption), `AppError.ts` (path/credential-redacting ipc errors), and `logger.ts` (`electron-log`).

## 2. bundled daemon (`slskd`)

- **startup:** `SlskdService` locates the platform binary in `resources/` (dev) or `process.resourcesPath` (packaged), ensures executable permissions and removes macos quarantine via argument-array `execFileSync` (never shell strings).
- **dynamic config:** selects free random tcp/udp ports, generates a 32-byte api key and encrypted soulseek credentials (stored via `safeStorage`), and writes `slskd.yml` with `mode: 0o600` bound strictly to `127.0.0.1`.
- **shutdown:** cleanly kills the child process on `before-quit`, `SIGTERM`, and `SIGINT`.

## 3. zero-login multi-platform ingestion

users paste any public url into `TopBar` or import a dj setlist without logging in:

1. **spotify (`spotifyParser.ts`):** 3-tier cascade — embed html -> open web player `initialState` -> oembed fallback (playlists, albums, single tracks).
2. **youtube (`YoutubeService.ts`):** playlist and single-video ingestion with oembed & watch-page fallback.
3. **soundcloud (`soundCloudParser.ts`):** `window.__sc_hydration` extraction with high-res `500x500` artwork normalization and oembed fallback.
4. **bandcamp (`bandcampParser.ts`):** schema.org json-ld + `data-tralbum` extraction supporting custom domains.
5. **dj setlists (`setlistParser.ts`):** parses rekordbox, traktor, serato csv/tsv/txt exports and plaintext setlists into reviewable track tables.
6. **optional spotify oauth:** available inside settings modal using cryptographic `crypto.randomBytes` pkce + csrf `state` verification in a sandboxed auth window via `soulmate://callback`.

## 4. search, matching, download & failover pipeline

1. **search cascade (`MatchMaker.ts`):** tries tier 1 (exact `Artist Title`), then tier 2 (stripped remix/remaster tags), then tier 3 (minimalist primary artist + title) if enabled.
2. **hybrid result retrieval:** polls `slskd` api v0 and falls back to read-only sqlite inspection of `search.db` when large result sets return empty json arrays.
3. **ranking:** scores relevance (artist + title + album, remix mismatch penalties), enforces format priority (default: `aiff`, `wav`, `flac`, `mp3` >= 320 kbps), prefers free upload slots, higher bitrate, and shorter queues.
4. **stalled failover & manual overrides:** detects frozen peers (0 B/s > 30s or remote abort) and fails over to the next best cached peer automatically; users can also edit queries inline or choose peers manually in `PeerSelectionModal`.

## 5. post-download audiophile pipeline & exports

1. **inspect (`AudioInspection.ts`):** verifies container specs (bit depth, sample rate, bitrate), extracts camelot key & bpm, and flags suspected upsampled fake-lossless transcodes via fft cutoff analysis.
2. **organize & tag (`MetadataService.ts`):** atomically moves the file into `<DownloadDir>/<Artist>/<Album>/<TrackNumber> - <Title>.<ext>`, fetches https-validated album art (10 mb cap), computes replaygain 2.0 tags, and writes flac vorbis comments or mp3 id3v2 tags.
3. **preview & export:** users can audition tracks in-app over the path-confined `soulmate-media://` protocol and export `.m3u8`, rekordbox xml, serato `.crate`, or traktor `.nml` files.

## 6. distribution & macos curl installer

- pushing a `v*` tag triggers `.github/workflows/release.yml`, building macos (`arm64` & `x64`), linux (`AppImage`), and windows (`nsis`), generating `SHA256SUMS.txt`, and publishing a github release.
- macos users install in one command via `curl -fsSL https://raw.githubusercontent.com/lhommeduchili/soulmate/main/install.sh | bash`, which verifies `SHA256SUMS.txt`, extracts via `ditto`, installs into `/Applications`, and clears `com.apple.quarantine`.
