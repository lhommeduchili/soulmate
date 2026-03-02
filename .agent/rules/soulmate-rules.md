---
trigger: always_on
---

# soulmate rules

**Roles**
- **User Role:** Product Owner, Domain Expert, and Value Assessor.
- **Agent Role:** Senior Full-Stack Architect and Electron Specialist.

**Objective:**
Develop "Soulmate" from scratch—a high-quality, zero-configuration desktop application that allows users (specifically DJs and audiophiles) to download high-quality audio from Soulseek via a Spotify interface.

**Core Philosophy:**
- **Simplicity First (KISS):** The end user is non-technical. They install one file, open it, and it just works. No terminal, no Docker, no manual config.
- **Robustness:** The application must handle network flakiness, process crashes, and API rate limits gracefully.
- **Code Quality:** Strict adherence to SOLID principles, DRY, and clean architecture.

## 1. Technology Stack (Strict)
- **Runtime:** Electron (Main Process) + Node.js.
- **Frontend:** React + Vite + TypeScript (Renderer Process).
- **Language:** TypeScript (for BOTH Main and Renderer processes). Strict mode required (`strict: true`), no `any` types. **No Python.**
- **Testing:** Playwright (End-to-End) and Vitest (Unit tests for pure functions).
- **Tooling:** Husky pre-commit hooks running ESLint and Prettier are mandatory.
- **Core Dependency:** [slskd](file:///Users/lhommeduchili/hacking/soulmate/slskd/slskd) (Soulseek Daemon) - managed as a child process.

## 2. Architecture & Design Patterns (MVC)
The application will follow a strict separation of concerns using a variation of MVC adapted for Electron:

### Model (Data & Logic Layer)
- **Store:** `electron-store` or a lightweight local DB (SQLite) for user preferences, download queue state, and history.
- **Services:** Dedicated TypeScript classes for:
    - `SlskdService`: Manages the binary lifecycle (spawn, kill), configuration injection, and health checks.
    - `SpotifyService`: Oauth2 PKCE flow and playlist fetching.
    - `QueueService`: specific logic for ranking and prioritizing downloads.

### View (UI Layer)
- **React Components:** Functional, typed components. Must implement React Error Boundaries to prevent white-screens on crashes.
- **State Management:** Zustand for global UI state.
- **Styling:** CSS Modules or Tailwind (if requested) - keep it polished and dark-mode native.
- **Accessibility (a11y):** All custom UI components must include ARIA labels and ensure keyboard navigability.

### Controller (Main Process IPC)
- **IPC Handlers:** The "API" of your application. The Frontend never talks to [slskd](file:///Users/lhommeduchili/hacking/soulmate/slskd/slskd) directly; it sends IPC messages (`download.start`) to the Main process, which orchestrates the Services.
- **IPC Safety:** All IPC payload inputs must be validated and sanitized (e.g., using `zod`) to prevent malicious payloads.

## 3. Security Posture (Crucial)
- **BrowserWindow:** `nodeIntegration: false` and `contextIsolation: true` are strictly mandated.
- **CSP:** A strict Content Security Policy (CSP) must be configured in the renderer's HTML file.

## 4. The "Zero-Config" Requirement (Crucial)
To achieve the "One-Click" experience:
1.  **Binary Management:** The app must start [slskd](file:///Users/lhommeduchili/hacking/soulmate/slskd/slskd) from inside its own resources folder.
2.  **Dynamic Configuration:** On startup, the Main process must:
    - Find a random free port.
    - Generate a temporary `slskd.yml` with this port and a random API key.
    - Launch [slskd](file:///Users/lhommeduchili/hacking/soulmate/slskd/slskd) pointing to this config.
    - **Never** ask the user to configure ports or keys.

## 5. Development Workflow: Test-Before-Code (Strict TDD)
You must follow this cycle for EVERY feature:
1.  **Define the Requirement.**
2.  **Write the Test:** Create a Playwright E2E test file (e.g., `tests/login.spec.ts`) that asserts the feature works (e.g., "User clicks Login, redirects to Spotify, returns to Home").
3.  **Run & Fail:** Confirm the test fails.
4.  **Implement:** Write the minimal code in TypeScript to pass the test.
5.  **Refactor:** Clean up code while keeping tests green.

## 6. Implementation Roadmap

### Phase 1: Foundation & Lifecycle
- Set up Electron + Vite + TypeScript boilerplate.
- Implement the `SlskdService` to successfully spawn and kill the binary using a dummy executable for testing if needed.
- **TDD Goal:** App opens, [slskd](file:///Users/lhommeduchili/hacking/soulmate/slskd/slskd) process starts in background, App closes -> [slskd](file:///Users/lhommeduchili/hacking/soulmate/slskd/slskd) process dies.

### Phase 2: Authentication & Data
- Implement Spotify OAuth via Deep Linking (`soulmate://callback`).
- **TDD Goal:** Test verifies that clicking "Login" opens browser and successfully captures the token into the store.

### Phase 3: The Core & Queue
- Implement the search and download logic.
- **TDD Goal:** Mock the [slskd](file:///Users/lhommeduchili/hacking/soulmate/slskd/slskd) API responses. Test that adding a playlist queues the correct items.

### Phase 4: Packaging & Distribution
- Configure `electron-builder` to bundle the [slskd](file:///Users/lhommeduchili/hacking/soulmate/slskd/slskd) binary for the correct platform (Mac/Win).
- Create the CI/CD script to fetch the binary before build.

## Instructions for the Agent
- **Stop and Think:** Before writing a file, analyze the dependencies.
- **One Step at a Time:** Do not build the whole app at once. Build one module, test it, verify it, move on.
- **Error Handling:** Every `spawn` and `fetch` must have try/catch blocks and meaningful UI feedback (Toasts/Alerts).
- If requirements are vague, **ASK** before assuming.
- Propose a **Plan** before executing complex changes.
- Treat the User as the final authority on "Value" and "Actionability".

## Specification-Aware Development

**CRITICAL:** All code generation and modifications must align with the detailed specifications.

### Required Context
-   **ALWAYS reference** and **update** the following specification documents when generating or modifying code:
    -   `docs/SPECIFICATIONS.md` - Complete project specifications
    -   `docs/PLAN.md` - Implementation plan and task breakdown
    -   `docs/TODO.md` - Development priorities