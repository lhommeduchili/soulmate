import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import { join } from "path";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "fs";
import { tmpdir } from "os";

test.describe("DJ Playlist Export, Library Duplicate Detection & Auto-Updater (E2E)", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;
  let customDownloadsDir: string;
  const unhandledErrors: Error[] = [];

  const launchWithLocale = async (
    locale: "en" | "es-CL" = "en",
  ): Promise<{ app: ElectronApplication; page: Page }> => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-dj-user-"));
    customDownloadsDir = join(userDataDir, "DJ_Vault");
    mkdirSync(customDownloadsDir, { recursive: true });

    writeFileSync(
      join(userDataDir, "config.json"),
      JSON.stringify({
        preferences: {
          downloadPath: customDownloadsDir,
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
      unhandledErrors.push(err);
    });

    await window.waitForLoadState("domcontentloaded");
    await expect(window.locator("#playlist-search")).toBeVisible({
      timeout: 15000,
    });

    return { app: electronApp, page: window };
  };

  test.afterEach(async () => {
    if (app) await app.close();
    if (userDataDir) {
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    }
  });

  test("completed playlist generates .m3u8 manifest file with valid extended formatting and relative paths", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    // 1. Simulate completed track with target path in customDownloadsDir
    const artistFolder = join(customDownloadsDir, "Daft Punk", "Discovery");
    mkdirSync(artistFolder, { recursive: true });
    const audioFile = join(artistFolder, "01 - One More Time.flac");
    writeFileSync(audioFile, Buffer.from("fLaC_dummy_audio_stream"));

    await app.evaluate(async ({ BrowserWindow }, file) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "dj-track-1",
          track: {
            id: "dj-track-1",
            name: "One More Time",
            artists: [{ name: "Daft Punk" }],
            album: { name: "Discovery" },
            duration_ms: 320000,
            track_number: 1,
            year: 2001,
          },
          status: "completed",
          progress: 100,
          targetPath: file,
          filePath: file,
          playlistName: "Club Anthems",
        },
      ]);
    }, audioFile);

    // 2. Completed playlist banner should appear in the sidebar
    const banner = page.getByTestId("completed-playlist-banner");
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText("playlist ready");

    // 3. Click .M3U8 button to trigger export and reveal
    const revealManifestBtn = page.getByTestId("reveal-playlist-manifest");
    await expect(revealManifestBtn).toBeVisible();
    await revealManifestBtn.click();

    // 4. Verify file was created at <customDownloadsDir>/Playlists/Club Anthems.m3u8
    const expectedManifestPath = join(
      customDownloadsDir,
      "Playlists",
      "Club Anthems.m3u8",
    );
    expect(existsSync(expectedManifestPath)).toBe(true);

    const manifestContent = readFileSync(expectedManifestPath, "utf-8");
    expect(manifestContent).toContain("#EXTM3U");
    expect(manifestContent).toContain("#EXTINF:320,Daft Punk - One More Time");
    // Verify cross-platform relative path
    expect(manifestContent).toContain(
      "../Daft Punk/Discovery/01 - One More Time.flac",
    );

    expect(unhandledErrors).toHaveLength(0);
  });

  test("existing tracks display [IN LIBRARY] / [EN BIBLIOTECA] badges and allow skipping already-downloaded tracks in review table", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    // 1. Create a pre-existing FLAC file on disk for "Get Lucky"
    const artistFolder = join(
      customDownloadsDir,
      "Daft Punk, Pharrell Williams",
      "Random Access Memories",
    );
    mkdirSync(artistFolder, { recursive: true });
    const existingFile = join(
      artistFolder,
      "08 - Get Lucky (feat. Pharrell Williams).flac",
    );
    writeFileSync(existingFile, Buffer.from("fLaC_existing_audio"));

    // 2. Mock spotify:tracks IPC handler in the Main process for review navigation
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("spotify:tracks");
      ipcMain.handle("spotify:tracks", async () => [
        {
          id: "lib-track-1",
          name: "Get Lucky (feat. Pharrell Williams)",
          artists: [{ name: "Daft Punk" }, { name: "Pharrell Williams" }],
          album: { name: "Random Access Memories" },
          duration_ms: 369000,
          track_number: 8,
          year: 2013,
        },
        {
          id: "lib-track-2",
          name: "Instant Crush (feat. Julian Casablancas)",
          artists: [{ name: "Daft Punk" }, { name: "Julian Casablancas" }],
          album: { name: "Random Access Memories" },
          duration_ms: 337000,
          track_number: 5,
          year: 2013,
        },
      ]);
    });

    // 3. Navigate directly to review page
    await page.evaluate(() => {
      window.location.hash = "#/review/spotify/ram-album";
    });

    // 4. Assert review table loads
    const reviewRegion = page.locator(
      'div[role="region"][aria-label="Playlist editor"]',
    );
    await expect(reviewRegion).toBeVisible({ timeout: 10000 });

    // 5. Assert [IN LIBRARY] badge is rendered for existing track 1
    const inLibraryBadge = page.getByTestId("in-library-badge-lib-track-1");
    await expect(inLibraryBadge).toBeVisible();
    await expect(inLibraryBadge).toHaveText("[IN LIBRARY]");

    // Track 2 should NOT have the in-library badge
    const badgeTrack2 = page.getByTestId("in-library-badge-lib-track-2");
    await expect(badgeTrack2).not.toBeVisible();

    // 6. Test "Skip tracks in library" toggle
    const skipToggle = page.getByTestId("skip-in-library-toggle");
    await expect(skipToggle).toBeVisible();

    // Initially 2 tracks selected: "2 / 2 selected"
    const reviewHeader = reviewRegion.locator("header");
    await expect(reviewHeader).toContainText("2 / 2 selected");

    // Click skip toggle: deselects track 1, leaving only track 2 selected
    await skipToggle.click();
    await expect(reviewHeader).toContainText("1 / 2 selected");

    // 7. Click "export playlist (.m3u8)" button
    const exportBtn = page.getByTestId("export-m3u-button");
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    // Verify export feedback notice is shown
    const notice = page.getByTestId("playlist-export-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("playlist exported (.m3u8)");

    // Verify .m3u8 was created on disk
    const exportedFile = join(
      customDownloadsDir,
      "Playlists",
      "Random Access Memories.m3u8",
    );
    expect(existsSync(exportedFile)).toBe(true);

    expect(unhandledErrors).toHaveLength(0);
  });

  test("update status indicators render properly without breaking guest workflows", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    // 1. Initial guest state: idle updater, no update pill
    const updatePill = page.getByTestId("update-available-pill");
    await expect(updatePill).not.toBeVisible();

    // 2. Simulate update downloaded state
    await page.evaluate(async () => {
      await window.api.update.simulateStatus({
        status: "downloaded",
        version: "1.2.0",
        progress: 100,
      });
    });

    // 3. Assert update notification pill appears in TopBar
    await expect(updatePill).toBeVisible({ timeout: 5000 });
    await expect(updatePill).toContainText("update ready v1.2.0");

    // 4. Open Settings Modal
    const settingsBtn = page.getByTestId("settings-trigger");
    await settingsBtn.click();

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    // 5. Assert Software Updates section and "Install & Restart" button exist
    const installBtn = page.getByTestId("install-update-button");
    await expect(installBtn).toBeVisible();
    await expect(installBtn).toHaveText("install & restart");

    expect(unhandledErrors).toHaveLength(0);
  });

  test("renders localized [EN BIBLIOTECA] badges and Chilean Spanish actions under es-CL locale", async () => {
    const launched = await launchWithLocale("es-CL");
    app = launched.app;
    page = launched.page;

    // 1. Create existing track on disk
    const artistFolder = join(
      customDownloadsDir,
      "Los Prisioneros",
      "Corazones",
    );
    mkdirSync(artistFolder, { recursive: true });
    const existingFile = join(artistFolder, "01 - Tren Al Sur.flac");
    writeFileSync(existingFile, Buffer.from("fLaC_chilean_rock"));

    // 2. Mock spotify:tracks IPC in Main process
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("spotify:tracks");
      ipcMain.handle("spotify:tracks", async () => [
        {
          id: "track-cl-1",
          name: "Tren Al Sur",
          artists: [{ name: "Los Prisioneros" }],
          album: { name: "Corazones" },
          duration_ms: 334000,
          track_number: 1,
          year: 1990,
        },
      ]);
    });

    // 3. Navigate to review
    await page.evaluate(() => {
      window.location.hash = "#/review/spotify/corazones";
    });

    // 4. Assert [EN BIBLIOTECA] badge
    const badge = page.getByTestId("in-library-badge-track-cl-1");
    await expect(badge).toBeVisible({ timeout: 10000 });
    await expect(badge).toHaveText("[EN BIBLIOTECA]");

    // 5. Assert localized Export action
    const exportBtn = page.getByTestId("export-m3u-button");
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    const notice = page.getByTestId("playlist-export-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("playlist exportada (.m3u8)");

    const expectedFile = join(
      customDownloadsDir,
      "Playlists",
      "Corazones.m3u8",
    );
    expect(existsSync(expectedFile)).toBe(true);

    // 6. Simulate update and check localized pill
    await page.evaluate(async () => {
      await window.api.update.simulateStatus({
        status: "downloaded",
        version: "1.2.0",
      });
    });

    const updatePill = page.getByTestId("update-available-pill");
    await expect(updatePill).toBeVisible({ timeout: 5000 });
    await expect(updatePill).toContainText("actualización lista v1.2.0");

    expect(unhandledErrors).toHaveLength(0);
  });
});
