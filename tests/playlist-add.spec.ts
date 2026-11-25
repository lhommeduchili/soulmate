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

test.describe("Zero-Login Public Playlist Ingestion & Queue Pipeline", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-playlist-"));

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

  test("ingests public Spotify playlist, displays review table, and queues downloads without login", async () => {
    // 1. Locate search/import bar without requiring user login
    const topBarSearch = page.locator("#playlist-search");
    await expect(topBarSearch).toBeVisible({ timeout: 10000 });

    // Verify user is in zero-login mode (welcoming workspace visible, no connect prompt banner)
    const welcomeWorkspace = page.locator("h2", {
      hasText: /welcome to soulmate|bienvenido a soulmate/i,
    });
    await expect(welcomeWorkspace).toBeVisible();

    const connectButtonInMain = page.locator("main").getByRole("button", {
      name: /connect spotify/i,
    });
    await expect(connectButtonInMain).not.toBeVisible();

    // 2. Enter public Spotify playlist URL into search/import bar
    const playlistUrl =
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";
    await topBarSearch.fill(playlistUrl);
    await topBarSearch.press("Enter");

    // 3. Assert playlist card appears under "playlists added" with correct metadata
    const addedSectionHeading = page.locator(
      'h2#added-playlists-heading, h2:has-text("playlists added")',
    );
    await expect(addedSectionHeading).toBeVisible({ timeout: 15000 });

    const playlistCard = page.locator('div[role="listitem"] button').first();
    await expect(playlistCard).toBeVisible({ timeout: 10000 });
    await expect(playlistCard).toContainText(/Today.*Top Hits/i);
    await expect(playlistCard).toContainText(/\d+\s*tracks/i);

    // 4. Navigate to /review/spotify/:id by clicking the playlist card
    await playlistCard.click();
    await expect(page).toHaveURL(
      /.*\/review\/spotify\/37i9dQZF1DXcBWIGoYBM5M/,
      {
        timeout: 10000,
      },
    );

    // 5. Assert that the track review table loads with real tracks, titles, and artists
    const trackTable = page.locator("table");
    await expect(trackTable).toBeVisible({ timeout: 15000 });

    const trackRows = page.locator("table tbody tr");
    await expect(trackRows.first()).toBeVisible({ timeout: 15000 });

    const rowCount = await trackRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify first row contains real title and artist strings
    const firstRowTitle = trackRows.first().locator("td").nth(1);
    const firstRowArtist = trackRows.first().locator("td").nth(2);
    await expect(firstRowTitle).not.toBeEmpty();
    await expect(firstRowArtist).not.toBeEmpty();

    const titleText = await firstRowTitle.textContent();
    const artistText = await firstRowArtist.textContent();
    expect(titleText?.trim().length).toBeGreaterThan(0);
    expect(artistText?.trim().length).toBeGreaterThan(0);

    // 6. Assert clicking "DOWNLOAD SELECTED" successfully dispatches tracks to the download queue
    const downloadBtn = page.getByRole("button", {
      name: /download.*selected/i,
    });
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();

    // Verify sidebar queue was initially empty
    const emptyQueueStatus = page.locator('aside [role="status"]');
    await expect(emptyQueueStatus).toBeVisible();

    // Click "DOWNLOAD SELECTED"
    await downloadBtn.click();

    // Assert that the sidebar download queue updates with queued items
    const queueItems = page.locator('aside div[role="listitem"]');
    await expect(queueItems.first()).toBeVisible({ timeout: 10000 });

    // Assert empty queue status is gone
    await expect(emptyQueueStatus).not.toBeVisible();

    const queueCount = await queueItems.count();
    expect(queueCount).toBeGreaterThan(0);
  });
});
