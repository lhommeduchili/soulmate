# Soulmate Implementation Plan

## Phase 1: Foundation & Lifecycle
- [x] Set up Electron + Vite + TypeScript boilerplate.
- [x] Implement `SlskdService` to spawn and kill binary.
- [x] Implement robust zombie process cleanup in `SlskdService` (Auto-kill on start).
- **Goal:** App opens, slskd starts, App closes -> slskd dies.

## Phase 2: Authentication & Data
- [x] Implement Spotify OAuth via Deep Linking (`soulmate://callback`).
- **Goal:** Login opens browser, captures token.

## Phase 3: The Core & Queue
- [x] Implement search and download logic.
    - [x] Backend: Dynamic Slskd Config (with Auto-Creds) & API Client (API v0).
    - [x] Frontend: Playlist Selector (Matrix Aesthetic).
    - [x] Logic: Playlist -> Search -> Poll -> Filter -> Download.
    - [x] Feature: Real-time Search Bar (Cosmetic/Prepared).
    - [x] Feature: Embedded Spotify Login (Auto-close).
    - [x] Feature: Real-time Search Bar (Cosmetic/Prepared).
    - [x] Feature: Embedded Spotify Login (Auto-close).
    - [x] UI: Matrix-style Sidebar Queue.
    - [x] **Fix:** Map `slotsFree` correctly in QueueService (solves "No match found").
    - [x] **Refinement:** Parallelize download queue processing.
- **Goal:** Selecting a playlist queues items in slskd.

## Phase 4: Packaging & Distribution
- [x] Configure `electron-builder` for cross-platform support (Mac/Win/Linux).
- [x] Create `scripts/download-binaries.ts` for automated binary fetching.
- [x] Verify integration with real `slskd` binary (E2E Tests Passed).
- [ ] Integrate `electron-updater` for silent auto-updates.
- [ ] Set up GitHub Actions CI/CD (lint, test, build, release).
- **Goal:** Production-ready `Soulmate.app` (Mac) and auto-updating infrastructure.
