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

test.describe("Zero-Login Album & Track Ingestion Pipeline", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-album-"));

    // Pre-configure English locale for consistent assertions
    writeFileSync(
      join(userDataDir, "config.json"),
      JSON.stringify({
        preferences: {
          downloadPath: "",
          formatPriority: ["aiff", "wav", "flac", "mp3"],
          locale: "en",
          region: "CL",
        },
      }),
    );

    app = await electron.launch({
      args: [join(__dirname, "../out/main/index.js")],
      env: {
        ...process.env,
        TEST_USER_DATA_DIR: userDataDir,
      },
    });

    // Pipe Main process logs for debugging
    app.process().stdout?.on("data", (data) => {
      console.log(`[Main]: ${data}`);
    });
    app.process().stderr?.on("data", (data) => {
      console.error(`[Main Error]: ${data}`);
    });

    page = await app.firstWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
    if (userDataDir) {
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    }
  });

  test("ingests public Spotify album, displays review table, and queues downloads without login", async () => {
    const topBarSearch = page.locator("#playlist-search");
    await expect(topBarSearch).toBeVisible({ timeout: 10000 });

    // Enter public Spotify album URL into import bar
    const albumUrl = "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy";
    await topBarSearch.fill(albumUrl);
    await topBarSearch.press("Enter");

    // Assert album card appears under "playlists added"
    const addedSectionHeading = page.locator(
      'h2#added-playlists-heading, h2:has-text("playlists added")',
    );
    await expect(addedSectionHeading).toBeVisible({ timeout: 15000 });

    const albumCard = page.locator('div[role="listitem"] button').first();
    await expect(albumCard).toBeVisible({ timeout: 10000 });
    await expect(albumCard).toContainText(/Global Warming/i);
    await expect(albumCard).toContainText(/\d+\s*tracks/i);

    // Navigate to /review/spotify/:id by clicking album card
    await albumCard.click();
    await expect(page).toHaveURL(
      /.*\/review\/spotify\/4aawyAB9vmqN3uQ7FjRGTy/,
      {
        timeout: 10000,
      },
    );

    // Assert track review table loads with real tracks
    const trackTable = page.locator("table");
    await expect(trackTable).toBeVisible({ timeout: 15000 });

    const trackRows = page.locator("table tbody tr");
    await expect(trackRows.first()).toBeVisible({ timeout: 15000 });

    const rowCount = await trackRows.count();
    expect(rowCount).toBeGreaterThan(0);

    const firstRowTitle = trackRows.first().locator("td").nth(1);
    await expect(firstRowTitle).not.toBeEmpty();

    // Click "DOWNLOAD SELECTED" to queue tracks
    const downloadBtn = page.getByRole("button", {
      name: /download.*selected/i,
    });
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();

    await downloadBtn.click();

    // Assert that the sidebar download queue updates with queued items
    const queueItems = page.locator('aside div[role="listitem"]');
    await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
    const queueCount = await queueItems.count();
    expect(queueCount).toBeGreaterThan(0);
  });

  test("ingests public Spotify single track into 1-item review collection and queues it", async () => {
    // Navigate back to home via top bar navigation
    const homeBtn = page.locator('nav[aria-label="Main navigation"] button');
    await homeBtn.click();
    await expect(page).toHaveURL(/.*#\/$/, { timeout: 10000 });

    const topBarSearch = page.locator("#playlist-search");
    await expect(topBarSearch).toBeVisible({ timeout: 10000 });

    // Enter public Spotify track URL
    const trackUrl = "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl";
    await topBarSearch.fill(trackUrl);
    await topBarSearch.press("Enter");

    // Assert single track card appears under added collection
    const trackCard = page
      .locator('div[role="listitem"] button')
      .filter({ hasText: /Cut To The Feeling/i });
    await expect(trackCard).toBeVisible({ timeout: 15000 });
    await expect(trackCard).toContainText(/1\s*tracks/i);

    // Click card to open review
    await trackCard.click();
    await expect(page).toHaveURL(
      /.*\/review\/spotify\/11dFghVXANMlKmJXsNCbNl/,
      {
        timeout: 10000,
      },
    );

    // Assert review table has exactly 1 track
    const trackRows = page.locator("table tbody tr");
    await expect(trackRows.first()).toBeVisible({ timeout: 15000 });
    const rowCount = await trackRows.count();
    expect(rowCount).toBe(1);

    const titleCell = trackRows.first().locator("td").nth(1);
    await expect(titleCell).toContainText(/Cut To The Feeling/i);

    // Queue download
    const downloadBtn = page.getByRole("button", {
      name: /download.*selected/i,
    });
    await expect(downloadBtn).toBeVisible();
    await downloadBtn.click();

    // Assert queued
    const queueItems = page.locator('aside div[role="listitem"]');
    await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
  });
});
