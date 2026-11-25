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

test.describe("Phase 16 — SoundCloud & Bandcamp Zero-Login Ingestion (E2E)", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-sc-bc-"));

    writeFileSync(
      join(userDataDir, "config.json"),
      JSON.stringify({
        preferences: {
          downloadPath: "",
          formatPriority: "flac",
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

    page = await app.firstWindow();

    // Mock SoundCloud & Bandcamp IPC in Main process for deterministic E2E assertions
    await app.evaluate(async ({ ipcMain }) => {
      // Mock Bandcamp
      ipcMain.removeHandler("bandcamp:getPlaylist");
      ipcMain.handle("bandcamp:getPlaylist", async () => ({
        id: "three-album",
        name: "Three",
        description: "Bandcamp album by Four Tet",
        tracks: { total: 2 },
        owner: { display_name: "Four Tet" },
        images: [{ url: "https://f4.bcbits.com/img/three.jpg" }],
        type: "bandcamp",
        original_url: "https://fourtet.bandcamp.com/album/three",
      }));

      ipcMain.removeHandler("bandcamp:tracks");
      ipcMain.handle("bandcamp:tracks", async () => [
        {
          id: "bc-track-1",
          name: "Loved",
          artists: [{ name: "Four Tet" }],
          album: { name: "Three" },
          duration_ms: 242000,
          track_number: 1,
          is_bandcamp: true,
        },
        {
          id: "bc-track-2",
          name: "Gliding Through Everything",
          artists: [{ name: "Four Tet" }],
          album: { name: "Three" },
          duration_ms: 308000,
          track_number: 2,
          is_bandcamp: true,
        },
      ]);

      // Mock SoundCloud
      ipcMain.removeHandler("soundcloud:getPlaylist");
      ipcMain.handle("soundcloud:getPlaylist", async () => ({
        id: "joy-orbison-flight-fm",
        name: "Joy Orbison - flight fm",
        description: "SoundCloud release by Joy Orbison",
        tracks: { total: 1 },
        owner: { display_name: "Joy Orbison" },
        images: [{ url: "https://i1.sndcdn.com/artworks-flight.jpg" }],
        type: "soundcloud",
        original_url: "https://soundcloud.com/joy-orbison/flight-fm",
      }));

      ipcMain.removeHandler("soundcloud:tracks");
      ipcMain.handle("soundcloud:tracks", async () => [
        {
          id: "sc-track-1",
          name: "flight fm",
          artists: [{ name: "Joy Orbison" }],
          album: { name: "Joy Orbison - flight fm" },
          duration_ms: 240000,
          track_number: 1,
          is_soundcloud: true,
        },
      ]);
    });
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

  test("ingests public Bandcamp album URL, hydrates review table with [BANDCAMP] badge, and queues downloads", async () => {
    const topBarSearch = page.locator("#playlist-search");
    await expect(topBarSearch).toBeVisible({ timeout: 10000 });

    // 1. Enter Bandcamp album URL
    const bandcampUrl = "https://fourtet.bandcamp.com/album/three";
    await topBarSearch.fill(bandcampUrl);
    await topBarSearch.press("Enter");

    // 2. Assert added playlist card appears
    const addedCard = page
      .locator('div[role="listitem"] button')
      .filter({ hasText: /Three/i });
    await expect(addedCard).toBeVisible({ timeout: 10000 });
    await expect(addedCard).toContainText(/2\s*tracks/i);

    // 3. Click card to navigate to review page
    await addedCard.click();
    await expect(page).toHaveURL(/.*\/review\/bandcamp\/three-album/, {
      timeout: 10000,
    });

    // 4. Assert review table loads with platform badge [BANDCAMP]
    const platformBadge = page.locator('[data-testid="platform-badge"]');
    await expect(platformBadge).toBeVisible({ timeout: 10000 });
    await expect(platformBadge).toContainText(/BANDCAMP/i);

    // 5. Assert individual tracks appear in review table with thumbnails and without per-track platform tags
    const trackRows = page.locator("table tbody tr");
    await expect(trackRows).toHaveCount(2, { timeout: 10000 });
    await expect(trackRows.first()).toContainText(/Loved/i);
    await expect(trackRows.last()).toContainText(/Gliding Through Everything/i);
    await expect(
      trackRows.first().locator('[data-testid^="track-thumbnail-"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid^="track-platform-badge-"]'),
    ).toHaveCount(0);

    // 6. Click "DOWNLOAD SELECTED" and assert items are added to sidebar queue
    const downloadBtn = page.getByRole("button", {
      name: /download.*selected/i,
    });
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();
    await downloadBtn.click();

    const queueItems = page.locator('aside div[role="listitem"]');
    await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
    const count = await queueItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("ingests public SoundCloud URL, hydrates review table with [SOUNDCLOUD] badge, and queues downloads", async () => {
    // 1. Navigate back to Home
    const homeBtn = page.locator('nav[aria-label="Main navigation"] button');
    await homeBtn.click();
    await expect(page).toHaveURL(/.*#\/$/, { timeout: 10000 });

    const topBarSearch = page.locator("#playlist-search");
    await expect(topBarSearch).toBeVisible({ timeout: 10000 });

    // 2. Enter SoundCloud track URL
    const scUrl = "https://soundcloud.com/joy-orbison/flight-fm";
    await topBarSearch.fill(scUrl);
    await topBarSearch.press("Enter");

    // 3. Assert SoundCloud card appears in added section
    const scCard = page
      .locator('div[role="listitem"] button')
      .filter({ hasText: /flight fm/i });
    await expect(scCard).toBeVisible({ timeout: 10000 });
    await expect(scCard).toContainText(/1\s*tracks/i);

    // 4. Click card to open review table
    await scCard.click();
    await expect(page).toHaveURL(
      /.*\/review\/soundcloud\/joy-orbison-flight-fm/,
      {
        timeout: 10000,
      },
    );

    // 5. Assert platform badge [SOUNDCLOUD] is present
    const platformBadge = page.locator('[data-testid="platform-badge"]');
    await expect(platformBadge).toBeVisible({ timeout: 10000 });
    await expect(platformBadge).toContainText(/SOUNDCLOUD/i);

    // 6. Assert track details in review table
    const trackRows = page.locator("table tbody tr");
    await expect(trackRows).toHaveCount(1, { timeout: 10000 });
    await expect(trackRows.first()).toContainText(/flight fm/i);
    await expect(trackRows.first()).toContainText(/Joy Orbison/i);

    // 7. Click download selected
    const downloadBtn = page.getByRole("button", {
      name: /download.*selected/i,
    });
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();
    await downloadBtn.click();

    // 8. Queue updates in sidebar
    const queueItems = page.locator('aside div[role="listitem"]');
    await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
  });
});
