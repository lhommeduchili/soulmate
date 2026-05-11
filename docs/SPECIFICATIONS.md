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
- **preferences:** app preferences must be strongly typed and centralized behind a dedicated preferences/settings service. locale, region, download path, and format priority must share one validated model.
- **services:**
  - `slskdservice`: binary lifecycle, config injection, health checks.
  - `spotifyservice`: oauth2 pkce flow using **embedded window** for auto-closing login experience.
  - `queueservice`: ranking and prioritizing downloads.

### view (ui)

- **top bar:** configuration, search (cosmetic), home.
- **sidebar:** matrix-style download queue with **clear** functionality and marquee text.
- **main view:** playlist grid (images), playlist review (table).
- **components:** must implement react error boundaries and strict accessibility (a11y) standards (aria labels, keyboard navigation).
- **localization:** renderer copy must come from translation catalogs, not inline strings. first iteration supports `es-CL` and `en` with a scalable key-based translation layer.
- **regionalization:** chile (`CL`) is the default market/region profile. user-facing preferences must allow language override while keeping region-aware service behavior and formatting.
- **styling:** tailwind css (dark/matrix aesthetic).

### controller (main process)

- **ipc handlers:** main orchestration. frontend sends ipc messages (e.g., `download.start`), main calls services. input payloads must be validated/sanitized.

### security

- **browserwindow:** `nodeintegration: false` and `contextisolation: true`.
- **csp:** strict content security policy in renderer.

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

- **macOS (tier 1 — current):** ad-hoc signed (`identity: "-"` in `electron-builder.yml`). the `afterSign.js` hook deep-signs the `.app` bundle including nested binaries (e.g., `slskd`). users must approve the app once via System Settings → Privacy & Security → Open Anyway, or strip the quarantine flag with `xattr -cr`.
- **macOS (tier 2 — future):** Developer ID signing + Apple notarization. requires Apple Developer Program enrollment ($99/year). the `afterSign.js` hook already supports notarization when `APPLE_ID`, `APPLE_ID_PASSWORD`, and `APPLE_TEAM_ID` env vars are set.
- **Windows:** unsigned (nsis installer). windows SmartScreen may show a warning on first run.
- **Linux:** unsigned AppImage. no platform-level signing required.
- **distribution channel:** GitHub Releases. artifacts are uploaded automatically by the `release.yml` workflow.

## 9. ci/cd

- **ci (`ci.yml`):** runs on every push to `main` and on pull requests. validates lint, typecheck, and unit tests.
- **release (`release.yml`):** triggered by pushing a version tag (`v*`). builds platform-specific artifacts on native runners (macOS, Linux, Windows), uploads them as a draft GitHub Release via `softprops/action-gh-release`.
- **binary management in ci:** the `slskd` binaries are gitignored and downloaded at build time via `npm run binaries:download`. each platform runner downloads only the binaries it needs.
- **notarization in ci (tier 2):** when `APPLE_ID`, `APPLE_ID_PASSWORD`, and `APPLE_TEAM_ID` are configured as GitHub repository secrets, the macOS build job will automatically notarize the app.
