# manual testing guide - soulmate v2.0.0

this guide covers manual verification of soulmate's zero-login ingestion, download pipeline, dj exports, security controls, and macos `curl` installer.

## 1. development launch

```bash
npm install
npm run binaries:download
npm run dev
```

- **verify:** the app launches with the frameless dark critical-nocturne window, macos dock label `soulmate`, squircle icon, and `slskd` connecting in the background (`SYSTEM_ONLINE`).

## 2. zero-login ingestion (spotify, youtube, soundcloud, bandcamp & setlists)

1. paste a public spotify playlist, album, or track url into the top search bar and press enter.
   - **verify:** review table loads with `32x32` square track artwork, `[SPOTIFY]` playlist header badge, and `[IN LIBRARY]` badges for any tracks already in your download directory.
2. test a public youtube playlist/video url, soundcloud set/track url, and bandcamp album/track url.
3. click the setlist import button, paste a rekordbox/1001tracklists tracklist (or drop a `.csv`/`.txt` file), and confirm track count telemetry and review hydration.

## 3. queue, telemetry, preview & exports

1. select tracks and click download; verify real-time ascii progress meters (`░`/`█`), speed readout, pause/resume all, and clear completed controls.
2. test keyboard cell editing (`Enter`/`Space` to edit, `Escape` to cancel, `Enter` to save) and settings modal accessibility (`Tab` focus trap, `Escape` close, focus restoration).
3. on a completed track:
   - verify format badge (e.g. `[16-BIT / 44.1kHz]`), camelot/bpm badge when present, and reveal-in-folder action.
   - click preview to open the bottom audio player; verify `Space` play/pause and `Escape` dismiss.
4. export `.m3u8`, rekordbox xml, serato `.crate`, and traktor `.nml` from the review toolbar and confirm files are created inside your configured download directory.

## 4. optional spotify oauth (settings)

1. ensure `VITE_SPOTIFY_CLIENT_ID` is set in `.env` and `soulmate://callback` is registered in the spotify developer dashboard.
2. open settings -> connect spotify -> authorize in the sandboxed oauth window -> confirm private playlists load.

## 5. packaging & macos curl installer verification

1. **local build:**
   ```bash
   npm run build:mac
   open dist/mac-arm64/soulmate.app
   ```
2. **curl installer (after publishing a github release):**

   ```bash
   curl -fsSL https://raw.githubusercontent.com/lhommeduchili/soulmate/main/install.sh | bash
   open -a soulmate
   ```

   - **verify:** architecture is auto-detected, `SHA256SUMS.txt` is verified, `soulmate.app` is installed into `/Applications` (or `~/Applications`), quarantine is cleared, and the app opens cleanly without gatekeeper errors.
