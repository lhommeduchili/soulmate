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
- **services:**
    - `slskdservice`: binary lifecycle, config injection, health checks.
    - `spotifyservice`: oauth2 pkce flow using **embedded window** for auto-closing login experience.
    - `queueservice`: ranking and prioritizing downloads.

### view (ui)
- **top bar:** configuration, search (cosmetic), home.
- **sidebar:** matrix-style download queue with **clear** functionality and marquee text.
- **main view:** playlist grid (images), playlist review (table).
- **components:** must implement react error boundaries and strict accessibility (a11y) standards (aria labels, keyboard navigation).
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
