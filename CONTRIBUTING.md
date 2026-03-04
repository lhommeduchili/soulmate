# contributing to soulmate

we welcome contributions to soulmate. please follow the development workflow below to ensure code quality and stability.

## development workflow (test-driven development)

we enforce strict test-driven development (tdd) using playwright.

1.  **define requirement**: choose an issue or define a new feature.
2.  **write the test**: create a playwright e2e test (e.g. `tests/feature.spec.ts`) asserting the expected behavior.
3.  **run & fail**: confirm the test fails (`npm run test:e2e`).
4.  **implement**: write the minimal typescript code required to pass the test.
5.  **refactor**: clean up the code, adhering to solid principles and clean architecture while keeping the tests green.

## code standards

- **language**: typescript only (both main and renderer processes). strict mode is required (`strict: true`). no `any` types allowed.
- **linting**: husky pre-commit hooks running eslint and prettier are mandatory. ensure your code passes `npm run lint` and `npm run format`.
- **architecture**: strict separation of concerns. frontend never talks to the daemon directly; all communication must go through ipc handlers in the main process.

## getting help

if you have any doubts about architecture or design patterns, open an issue for discussion before implementing massive changes.
