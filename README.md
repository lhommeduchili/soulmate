# soulmate

a zero-configuration desktop application for djs and audiophiles to download lossless and high-bitrate audio from soulseek via public spotify, youtube, soundcloud, bandcamp, and dj setlist imports. it manages its own bundled `slskd` daemon in the background.

## install (macos)

install the latest release on macos (apple silicon or intel) in one command:

```bash
curl -fsSL https://raw.githubusercontent.com/lhommeduchili/soulmate/main/install.sh | bash
```

the installer automatically detects your mac architecture (`arm64` / `x64`), downloads the latest release from github releases, verifies its `SHA256SUMS.txt` checksum, installs `soulmate.app` into `/Applications`, and clears the macos quarantine flag so the app launches cleanly.

optional environment variables:

```bash
# pin a specific release version
SOULMATE_VERSION=v2.0.0 curl -fsSL https://raw.githubusercontent.com/lhommeduchili/soulmate/main/install.sh | bash

# install into a custom applications directory
SOULMATE_INSTALL_DIR="$HOME/Applications" curl -fsSL https://raw.githubusercontent.com/lhommeduchili/soulmate/main/install.sh | bash
```

for manual installers (`.dmg`, `.zip`, windows `.exe`, linux `.AppImage`), see [github releases](https://github.com/lhommeduchili/soulmate/releases).

## core features

- **zero-login ingestion:** paste public spotify (playlists, albums, tracks), youtube (playlists, single videos), soundcloud (tracks, sets), or bandcamp (albums, tracks) urls with no account or api keys required. optional spotify oauth pkce sync is available in settings for private playlists.
- **dj setlist batch import:** import tracklists directly from rekordbox, traktor, serato csv/tsv/txt exports, or raw setlist text.
- **smart soulseek matching & failover:** 3-tier query expansion cascade, customizable format priority (`aiff`, `wav`, `flac`, `mp3`), manual peer/source selection, inline query editing, configurable concurrency and bandwidth throttling, crash-safe queue persistence, and automatic failover on stalled peers.
- **audiophile verification & tagging:** binary flac/mp3 header inspection (bit depth, sample rate, bitrate), fft-based fake-lossless transcode detection, camelot key & bpm parsing, native flac vorbis comment & mp3 id3v2 tagging with embedded album art, replaygain 2.0 / ebu r128 loudness tags, and clean dj folder organization.
- **dj software crate exports:** one-click export to `.m3u8` manifests, pioneer rekordbox xml, serato `.crate` subcrates, and native instruments traktor pro `.nml` collections, plus local library duplicate detection and an in-app audio preview player.
- **bundled daemon & auto-updates:** automatically spawns and cleans up a loopback-bound `slskd` process on random ports with a generated 256-bit api key, and supports silent background updates via github releases.
- **bilingual & accessible ui:** critical-nocturne terminal aesthetic with full `es-CL` (chile) and `en` localization, keyboard-navigable dialogs/cells, and isolated react error boundaries.

## security posture

- **strict electron isolation:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, least-privilege `window.api` preload bridge (no raw `ipcRenderer`), strict content security policy (`https:`-only images, `form-action 'none'`, `frame-src 'none'`), and denied unsolicited browser permissions.
- **path & protocol containment:** `soulmate-media://` streaming, os folder reveals, and dj crate exports are strictly confined to the user's download library via canonicalized symlink-safe checks.
- **daemon & secret protection:** `slskd` binds strictly to `127.0.0.1` with `0600` config permissions, zero-shell process execution (`execFile`/`execFileSync`), cryptographic oauth pkce + csrf `state` verification, ssrf guards on remote fetches, and os keychain encryption via electron `safeStorage`.

## getting started (development)

prerequisites:

- node.js (v20+)

```bash
# clone repository
git clone https://github.com/lhommeduchili/soulmate.git
cd soulmate

# install dependencies (also generates macos squircle icons in dev)
npm install

# configure local environment (optional for zero-login; required for spotify oauth builds)
cp .env.example .env
# edit .env and set VITE_SPOTIFY_CLIENT_ID

# fetch os-specific slskd binaries
npm run binaries:download

# start development server
npm run dev

# run quality checks & tests
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run test:e2e

# build release (mac)
npm run build:mac
```

for github actions releases, define `VITE_SPOTIFY_CLIENT_ID` in repository secrets so packaged builds include optional spotify oauth support.

## documentation

see the [`docs/`](./docs) directory for:

- [`SPECIFICATIONS.md`](docs/SPECIFICATIONS.md): complete software requirements, architecture, and security constraints.
- [`PLAN.md`](docs/PLAN.md): phased implementation roadmap.
- [`TODO.md`](docs/TODO.md): development tracking and completed milestones.
- [`HOW_DOES_IT_WORK.md`](docs/HOW_DOES_IT_WORK.md): system architecture and end-to-end workflow overview.
- [`TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md) & [`MANUAL_TESTING.md`](docs/MANUAL_TESTING.md): automated and manual verification guides.
- [`SPOTIFY_SETUP.md`](docs/SPOTIFY_SETUP.md): optional spotify developer dashboard configuration.

## contributing

please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for details on our code of conduct and development process.

## license

this project is licensed under the gnu general public license v3.0 - see the [`LICENSE`](LICENSE) file for details.
