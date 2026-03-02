# Soulmate Testing Strategy

## Overview

We follow a strict Test-Driven Development (TDD) approach, but we separate our testing tools based on the nature of the code being tested. Rapid iteration and maintaining a green test suite are critical.

## 1. End-to-End (E2E) Testing with Playwright

Playwright is our primary tool for verifying user flows and the integration between the Electron main process, the React renderer, and the background daemon (`slskd`).

**When to use Playwright:**
- **User Journeys:** Completing flows like logging in, selecting a playlist, and initiating a queue.
- **IPC Integration:** Testing that clicking a button correctly sends an IPC message that triggers a Main process action.
- **Component Rendering Constraints:** Ensuring elements appear exactly as required by specifications.

**Rule of Thumb:** If it requires clicking, navigating, or interacting with a full DOM, use Playwright.

## 2. Unit Testing with Vitest

While Playwright ensures the app works holistically, it is excessively slow for testing pure logic blocks (e.g., permutations of the search scoring algorithm). Vitest is built for Vite and runs instantly, making it perfect for our core logic.

**When to use Vitest:**
- **Pure Functions:** Functions that take an input and return an output without side effects (e.g., normalization strings).
- **Algorithms:** `QueueService` relevance scoring, bitrate comparison, and match prioritization.
- **Data Transformations:** Parsing scraped metadata from HTML chunks into standard `Track` objects.

**Rule of Thumb:** If a module in `src/lib/` or `src/services/` doesn't strictly depend on the UI or an active React context, it should have adjacent `.spec.ts` unit tests run by Vitest.

## 3. The TDD Cycle

1. **Plan:** Identify the feature. Determine if it's a UI Flow (E2E) or Logic (Unit).
2. **Fail:** Write the test in Playwright or Vitest. Watch it fail.
3. **Pass:** Write the minimum code required.
4. **Refactor:** Improve types, clean up names. Ensure the test remains green.
