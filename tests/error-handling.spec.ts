import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";

test.describe("Error Architecture & React Error Boundary Resilience", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;
  const unhandledErrors: Error[] = [];

  const launchApp = async (
    locale: "en" | "es-CL" = "en",
  ): Promise<{ app: ElectronApplication; page: Page }> => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-errors-"));

    writeFileSync(
      join(userDataDir, "config.json"),
      JSON.stringify({
        preferences: {
          downloadPath: "",
          formatPriority: "flac",
          locale,
          region: "CL",
        },
      }),
    );

    const electronApp = await electron.launch({
      args: [join(__dirname, "../out/main/index.js")],
      env: {
        ...process.env,
        TEST_USER_DATA_DIR: userDataDir,
      },
    });

    const window = await electronApp.firstWindow();

    window.on("pageerror", (err) => {
      // Collect unhandled rejections or uncaught page errors
      unhandledErrors.push(err);
    });

    return { app: electronApp, page: window };
  };

  test.afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (userDataDir) {
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    }
  });

  test("isolates sidebar crash within its ErrorBoundary while keeping main application intact", async () => {
    const launched = await launchApp("en");
    app = launched.app;
    page = launched.page;

    // Wait for initial connection overlay to clear and main UI to be visible
    const searchInput = page.locator("#playlist-search");
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    const queueHeader = page.getByRole("heading", { name: /download queue/i });
    await expect(queueHeader).toBeVisible({ timeout: 15000 });

    // Trigger simulated crash strictly in Sidebar subsystem
    await page.evaluate(() => {
      (
        window as unknown as { __simulateComponentCrash?: string }
      ).__simulateComponentCrash = "sidebar";
      window.dispatchEvent(new Event("resize"));
    });

    // Wait for the fallback card to appear inside Sidebar
    const fallback = page.getByTestId("page-error-fallback");
    await expect(fallback).toBeVisible({ timeout: 10000 });
    await expect(fallback).toHaveAttribute("role", "alert");
    await expect(fallback).toHaveAttribute("aria-live", "assertive");

    // Check Matrix-themed recovery badge and title
    await expect(
      fallback.getByText(/\[system fault: recovery matrix\]/i),
    ).toBeVisible();
    await expect(fallback.getByText(/subsystem error: sidebar/i)).toBeVisible();

    // The main search input and workspace MUST NOT be crashed or white-screened
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Ambient Chill");
    await expect(searchInput).toHaveValue("Ambient Chill");

    // Test recovery via Retry button
    const retryBtn = page.getByTestId("error-retry-button");
    await expect(retryBtn).toBeVisible();
    await expect(retryBtn).toHaveText(/retry/i);

    // Clicking retry restores the sidebar
    await retryBtn.click();
    await expect(queueHeader).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("page-error-fallback")).toHaveCount(0);
  });

  test("isolates playlist view crash within its ErrorBoundary while keeping sidebar and topbar intact", async () => {
    const launched = await launchApp("en");
    app = launched.app;
    page = launched.page;

    const searchInput = page.locator("#playlist-search");
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // Verify queue in sidebar
    const queueHeader = page.getByRole("heading", { name: /download queue/i });
    await expect(queueHeader).toBeVisible({ timeout: 15000 });

    // Arm simulated crash in Playlists subsystem
    await page.evaluate(() => {
      (
        window as unknown as { __simulateComponentCrash?: string }
      ).__simulateComponentCrash = "playlists";
    });

    // Cause PlaylistsPage to re-render by typing in search
    await searchInput.fill("Ambient Chill");

    // Main workspace renders the ErrorBoundary fallback
    const fallback = page.getByTestId("page-error-fallback");
    await expect(fallback).toBeVisible({ timeout: 10000 });
    await expect(
      fallback.getByText(/subsystem error: playlists/i),
    ).toBeVisible();

    // Sidebar MUST remain fully intact
    await expect(queueHeader).toBeVisible();

    // Click "Reset Workspace" button to recover
    const resetBtn = page.getByTestId("error-reset-workspace-button");
    await expect(resetBtn).toBeVisible();
    await expect(resetBtn).toHaveText(/reset workspace/i);

    await resetBtn.click();

    // Workspace returns to clean zero-login state without white-screening
    await expect(page.getByTestId("page-error-fallback")).toHaveCount(0);
    await expect(queueHeader).toBeVisible();
  });

  test("handles invalid URL and IPC errors with actionable, localized UI alert notifications without unhandled rejections", async () => {
    unhandledErrors.length = 0;
    const launched = await launchApp("en");
    app = launched.app;
    page = launched.page;

    const searchInput = page.locator("#playlist-search");
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // 1. Enter an invalid non-Spotify/non-YouTube URL
    await searchInput.fill("https://example.com/unsupported-music-source");
    await searchInput.press("Enter");

    // Assert localized inline error alert appears
    const alertBox = page.locator('div[role="alert"]');
    await expect(alertBox).toBeVisible({ timeout: 10000 });
    await expect(alertBox).toContainText(
      /please enter a valid public (spotify|youtube|soundcloud|bandcamp).*url/i,
    );

    // Dismiss alert
    const dismissBtn = page.getByTestId("error-alert-dismiss");
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();
    await expect(alertBox).toHaveCount(0);

    // 2. Test nonexistent / private playlist resolution failure
    await searchInput.fill(
      "https://open.spotify.com/playlist/0000000000000000000000",
    );
    await searchInput.press("Enter");

    // Actionable localized error is shown instead of crashing
    await expect(alertBox).toBeVisible({ timeout: 15000 });
    await expect(alertBox).toContainText(
      /(playlist could not be resolved or is private|failed to import playlist)/i,
    );

    // Dismiss alert cleanly
    await dismissBtn.click();
    await expect(alertBox).toHaveCount(0);

    // Confirm 0 unhandled promise rejections reached pageerror
    expect(unhandledErrors).toHaveLength(0);
  });

  test("renders localized Matrix recovery card in Spanish (es-CL)", async () => {
    const launched = await launchApp("es-CL");
    app = launched.app;
    page = launched.page;

    // Wait for UI to load
    await expect(page.locator("#playlist-search")).toBeVisible({
      timeout: 15000,
    });

    // Trigger simulated crash
    await page.evaluate(() => {
      (
        window as unknown as { __simulateComponentCrash?: string }
      ).__simulateComponentCrash = "sidebar";
      window.dispatchEvent(new Event("resize"));
    });

    const fallback = page.getByTestId("page-error-fallback");
    await expect(fallback).toBeVisible({ timeout: 10000 });

    // Assert Spanish localized recovery strings
    await expect(
      fallback.getByText(/\[fallo de sistema: matriz de recuperación\]/i),
    ).toBeVisible();
    await expect(fallback.getByTestId("error-retry-button")).toHaveText(
      /reintentar/i,
    );
    await expect(
      fallback.getByTestId("error-reset-workspace-button"),
    ).toHaveText(/reiniciar espacio/i);
    await expect(fallback.getByTestId("error-reload-button")).toHaveText(
      /recargar/i,
    );
  });
});
