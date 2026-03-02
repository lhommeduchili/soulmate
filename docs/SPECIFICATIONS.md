# Soulmate Specifications

## 1. Objective
Develop "Soulmate" from scratch—a high-quality, zero-configuration desktop application that allows users (specifically DJs and audiophiles) to download high-quality audio from Soulseek via a Spotify interface.

## 2. Core Philosophy
- **Simplicity First (KISS):** The end user is non-technical. One file, open it, and it works. No terminal, no Docker.
- **Robustness:** Handle network flakiness, crashes, and rate limits gracefully.
- **Code Quality:** SOLID principles, DRY, clean architecture.

## 3. Technology Stack
- **Runtime:** Electron (Main Process) + Node.js.
- **Frontend:** React + Vite + TypeScript (Renderer Process).
- **Language:** TypeScript (BOTH Main and Renderer). Strict mode (`strict: true`), no `any` types. **No Python.**
- **Testing:** Playwright (End-to-End) and Vitest (Unit tests for pure functions).
- **Tooling:** Husky pre-commit hooks running ESLint and Prettier.
- **Core Dependency:** `slskd` (Soulseek Daemon) - managed as a child process.

## 4. Architecture (MVC)
### Model (Data & Logic)
- **Store:** `electron-store` or SQLite.
- **State Management:** Zustand for global UI state.
- **Services:**
    - `SlskdService`: Binary lifecycle, config injection, health checks.
    - `SpotifyService`: Oauth2 PKCE flow using **Embedded Window** for auto-closing login experience.
    - `QueueService`: Ranking and prioritizing downloads.

### View (UI)
- **Top Bar:** Configuration, Search (Cosmetic), Home.
- **Sidebar:** Matrix-style Download Queue with **Clear** functionality and marquee text.
- **Main View:** Playlist Grid (Images), Playlist Review (Table).
- **Components:** Must implement React Error Boundaries and strict Accessibility (a11y) standards (ARIA labels, keyboard navigation).
- **Styling:** Tailwind CSS (Dark/Matrix aesthetic).

### Controller (Main Process)
- **IPC Handlers:** Main orchestration. Frontend sends IPC messages (e.g., `download.start`), Main calls Services. Input payloads must be validated/sanitized.

### Security
- **BrowserWindow:** `nodeIntegration: false` and `contextIsolation: true`.
- **CSP:** Strict Content Security Policy in renderer.

## 5. Zero-Config Requirement
1.  **Binary Management:**
    - **Dev:** `scripts/download-binaries.ts` fetches platform-specific `slskd`.
    - **Prod:** `electron-builder` bundles the OS-specific binary into `resources/`.
    - `SlskdService` detects environment and paths automatically.
2.  **Auto-Updates:**
    - Silent background auto-updates via `electron-updater`.
    - GitHub Actions pipeline for CI/CD (lint, test, build, release).
3.  **Dynamic Configuration:**
    - Find random free port.
    - Generate temp `slskd.yml`.
    - Launch `slskd` with this config.
    - Never ask user for ports/keys.

## 6. Development Workflow (TDD)
1.  Define Requirement.
2.  Write Playwright Test (fail).
3.  Run & Fail.
4.  Implement minimal code.
5.  Refactor.
