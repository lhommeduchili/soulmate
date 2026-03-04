# soulmate testing strategy

## overview

we follow a strict test-driven development (tdd) approach, but we separate our testing tools based on the nature of the code being tested. rapid iteration and maintaining a green test suite are critical.

## 1. end-to-end (e2e) testing with playwright

playwright is our primary tool for verifying user flows and the integration between the electron main process, the react renderer, and the background daemon (`slskd`).

**when to use playwright:**
- **user journeys:** completing flows like logging in, selecting a playlist, and initiating a queue.
- **ipc integration:** testing that clicking a button correctly sends an ipc message that triggers a main process action.
- **component rendering constraints:** ensuring elements appear exactly as required by specifications.

**rule of thumb:** if it requires clicking, navigating, or interacting with a full dom, use playwright.

## 2. unit testing with vitest

while playwright ensures the app works holistically, it is excessively slow for testing pure logic blocks (e.g., permutations of the search scoring algorithm). vitest is built for vite and runs instantly, making it perfect for our core logic.

**when to use vitest:**
- **pure functions:** functions that take an input and return an output without side effects (e.g., normalization strings).
- **algorithms:** `queueservice` relevance scoring, bitrate comparison, and match prioritization.
- **data transformations:** parsing scraped metadata from html chunks into standard `track` objects.

**rule of thumb:** if a module in `src/lib/` or `src/services/` doesn't strictly depend on the ui or an active react context, it should have adjacent `.spec.ts` unit tests run by vitest.

## 3. the tdd cycle

1. **plan:** identify the feature. determine if it's a ui flow (e2e) or logic (unit).
2. **fail:** write the test in playwright or vitest. watch it fail.
3. **pass:** write the minimum code required.
4. **refactor:** improve types, clean up names. ensure the test remains green.
