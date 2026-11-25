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

test.describe("DJ Performance Crate Export & Camelot Wheel Tagging (E2E)", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;
  let customDownloadsDir: string;

  const launchWithLocale = async (
    locale: "en" | "es-CL" = "en",
  ): Promise<{ app: ElectronApplication; page: Page }> => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-crate-user-"));
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
          downloadSpeedLimit: 0,
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

  test("exports Rekordbox XML collection with Camelot key and BPM metadata", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    // Simulate completed track with formatInfo including Camelot key and BPM
    const artistFolder = join(customDownloadsDir, "Bicep", "Isles");
    mkdirSync(artistFolder, { recursive: true });
    const audioFile = join(artistFolder, "01 - Glue.flac");
    writeFileSync(audioFile, Buffer.from("fLaC_dummy_audio_stream"));

    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("spotify:tracks");
      ipcMain.handle("spotify:tracks", async () => [
        {
          id: "dj-track-rb",
          name: "Glue",
          artists: [{ name: "Bicep" }],
          album: { name: "Isles" },
          duration_ms: 269000,
          track_number: 1,
          year: 2017,
          formatInfo: {
            format: "FLAC",
            sampleRate: 44100,
            bitDepth: 24,
            bitrate: 1411,
            camelotKey: "8A",
            bpm: 126,
          },
        },
      ]);
    });

    await page.evaluate(() => {
      window.location.hash = "#/review/spotify/isles-album";
    });

    await expect(page.getByTestId("export-m3u-button")).toBeVisible({
      timeout: 15000,
    });

    // Check Camelot badge in table row
    const rowBadge = page.getByTestId("camelot-badge-dj-track-rb");
    await expect(rowBadge).toBeVisible();
    await expect(rowBadge).toContainText("[8A / 126 BPM]");

    // Check Rekordbox XML Export Button
    const rekordboxBtn = page.getByTestId("export-rekordbox-button");
    await expect(rekordboxBtn).toBeVisible();
    await rekordboxBtn.click();

    // Verify confirmation notice
    const notice = page.getByTestId("playlist-export-notice");
    await expect(notice).toBeVisible({ timeout: 5000 });

    // Verify XML file on disk
    const xmlPath = join(customDownloadsDir, "rekordbox.xml");
    expect(existsSync(xmlPath)).toBe(true);

    const xmlContent = readFileSync(xmlPath, "utf-8");
    expect(xmlContent).toContain('<DJ_PLAYLISTS Version="1.0.0">');
    expect(xmlContent).toContain("file://localhost/");
    expect(xmlContent).toContain('Tonality="8A"');
    expect(xmlContent).toContain('AverageBpm="126.00"');
  });

  test("exports Serato .crate binary subcrate with valid TLV structure", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("spotify:tracks");
      ipcMain.handle("spotify:tracks", async () => [
        {
          id: "dj-track-serato",
          name: "So U Kno",
          artists: [{ name: "Overmono" }],
          album: { name: "Good Lies" },
          duration_ms: 300000,
          track_number: 1,
          year: 2023,
          formatInfo: {
            format: "FLAC",
            sampleRate: 44100,
            bitDepth: 24,
            bitrate: 1411,
            camelotKey: "8A",
            bpm: 126,
          },
        },
      ]);
    });

    await page.evaluate(() => {
      window.location.hash = "#/review/spotify/good-lies";
    });

    const seratoBtn = page.getByTestId("export-serato-button");
    await expect(seratoBtn).toBeVisible({ timeout: 15000 });
    await seratoBtn.click();

    const notice = page.getByTestId("playlist-export-notice");
    await expect(notice).toBeVisible({ timeout: 5000 });

    // Verify .crate exists in export directory
    const crateFiles = [
      join(customDownloadsDir, "Good Lies.crate"),
      join(customDownloadsDir, "Soulmate Playlist.crate"),
    ];
    const createdCrate = crateFiles.find((p) => existsSync(p));
    expect(createdCrate).toBeDefined();

    if (createdCrate) {
      const crateBuffer = readFileSync(createdCrate);
      // First 4 bytes must be 'vrsn'
      expect(crateBuffer.toString("ascii", 0, 4)).toBe("vrsn");
    }
  });

  test("renders Matrix Camelot badges [8A / 126 BPM] in Sidebar and Audio Player", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    const artistFolder = join(customDownloadsDir, "Overmono", "Good Lies");
    mkdirSync(artistFolder, { recursive: true });
    const audioFile = join(artistFolder, "01 - So U Kno.flac");
    writeFileSync(audioFile, Buffer.from("fLaC_dummy_audio_stream"));

    await app.evaluate(async ({ BrowserWindow }, file) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "track-camelot-badge",
          track: {
            id: "track-camelot-badge",
            name: "So U Kno",
            artists: [{ name: "Overmono" }],
            album: { name: "Good Lies" },
            duration_ms: 300000,
            track_number: 1,
            filePath: file,
            targetPath: file,
          },
          status: "completed",
          progress: 100,
          targetPath: file,
          filePath: file,
          formatInfo: {
            format: "FLAC",
            sampleRate: 44100,
            bitDepth: 24,
            bitrate: 1411,
            camelotKey: "8A",
            bpm: 126,
          },
        },
      ]);
    }, audioFile);

    // Sidebar Camelot badge must be rendered
    const sidebarBadge = page.getByTestId("camelot-badge-track-camelot-badge");
    await expect(sidebarBadge).toBeVisible();
    await expect(sidebarBadge).toContainText("[8A / 126 BPM]");

    // Click play preview to audition and verify badge in player
    const playBtn = page.getByTestId("preview-track-track-camelot-badge");
    await expect(playBtn).toBeVisible();
    await playBtn.click();

    const playerBadge = page.getByTestId("player-camelot-badge");
    await expect(playerBadge).toBeVisible();
    await expect(playerBadge).toContainText("[8A / 126 BPM]");
  });

  test("allows configuring download bandwidth limit in settings and persists", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    // Open settings modal
    await page.getByTestId("settings-trigger").click();
    const modal = page.getByTestId("settings-modal");
    await expect(modal).toBeVisible();

    const bandwidthSelect = page.getByTestId("bandwidth-limit-select");
    await expect(bandwidthSelect).toBeVisible();
    await expect(bandwidthSelect).toHaveValue("0");

    // Change to 2000 KB/s (2 MB/s)
    await bandwidthSelect.selectOption("2000");
    await expect(bandwidthSelect).toHaveValue("2000");

    // Close settings modal
    await page.getByTestId("settings-close-button").click();
    await expect(modal).toBeHidden();

    // Verify persisted config on disk
    const configFile = join(userDataDir, "config.json");
    const raw = JSON.parse(readFileSync(configFile, "utf-8"));
    expect(raw.preferences.downloadSpeedLimit).toBe(2000);
  });

  test("exports Native Instruments Traktor Pro NML collection with valid XML hierarchy and Camelot key", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    const artistFolder = join(customDownloadsDir, "Mall Grab", "How the Dog");
    mkdirSync(artistFolder, { recursive: true });
    const audioFile = join(
      artistFolder,
      "01 - Liverpool Street In The Rain.flac",
    );
    writeFileSync(audioFile, Buffer.from("fLaC_dummy_traktor_audio"));

    await app.evaluate(({ ipcMain }, file) => {
      ipcMain.removeHandler("spotify:tracks");
      ipcMain.handle("spotify:tracks", async () => [
        {
          id: "dj-track-traktor",
          name: "Liverpool Street In The Rain",
          artists: [{ name: "Mall Grab" }],
          album: { name: "How the Dog" },
          duration_ms: 320000,
          track_number: 1,
          year: 2018,
          filePath: file,
          targetPath: file,
          formatInfo: {
            format: "FLAC",
            sampleRate: 44100,
            bitDepth: 24,
            bitrate: 1411,
            camelotKey: "8A",
            bpm: 126,
          },
        },
      ]);
    }, audioFile);

    await page.evaluate(() => {
      window.location.hash = "#/review/spotify/how-the-dog";
    });

    // Check Traktor NML Export Button
    const traktorBtn = page.getByTestId("export-traktor-button");
    await expect(traktorBtn).toBeVisible({ timeout: 15000 });
    await traktorBtn.click();

    // Verify confirmation notice
    const notice = page.getByTestId("playlist-export-notice");
    await expect(notice).toBeVisible({ timeout: 5000 });

    // Verify collection.nml file on disk
    const nmlPath = join(customDownloadsDir, "collection.nml");
    expect(existsSync(nmlPath)).toBe(true);

    const nmlContent = readFileSync(nmlPath, "utf-8");
    expect(nmlContent).toContain('<NML VERSION="19">');
    expect(nmlContent).toContain("<COLLECTION");
    expect(nmlContent).toContain(
      '<ENTRY ARTIST="Mall Grab" TITLE="Liverpool Street In The Rain">',
    );
    expect(nmlContent).toContain("<LOCATION");
    expect(nmlContent).toContain(
      'FILE="01 - Liverpool Street In The Rain.flac"',
    );
    expect(nmlContent).toContain('KEY="8A"');
    expect(nmlContent).toContain("<KEY>8A</KEY>");
    expect(nmlContent).toContain('<TEMPO BPM="126.000000"');
    expect(nmlContent).toContain("<PLAYLISTS>");
  });

  test("renders Fake Lossless transcode warning badge in Sidebar and Player for suspect audio", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    const artistFolder = join(customDownloadsDir, "Suspect", "Transcode");
    mkdirSync(artistFolder, { recursive: true });
    const audioFile = join(artistFolder, "01 - Upscaled.flac");
    writeFileSync(audioFile, Buffer.from("fLaC_dummy_upscaled"));

    await app.evaluate(async ({ BrowserWindow }, file) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "track-suspect-transcode",
          track: {
            id: "track-suspect-transcode",
            name: "Upscaled Track",
            artists: [{ name: "Suspect" }],
            album: { name: "Transcode" },
            duration_ms: 240000,
            track_number: 1,
            filePath: file,
            targetPath: file,
          },
          status: "completed",
          progress: 100,
          targetPath: file,
          filePath: file,
          formatInfo: {
            format: "FLAC",
            sampleRate: 44100,
            bitDepth: 16,
            bitrate: 1411,
            integrity: "suspect_transcode",
            cutoffFrequency: 16000,
            camelotKey: "11B",
            bpm: 128,
          },
        },
      ]);
    }, audioFile);

    // Sidebar Transcode Warning badge must be rendered
    const warningBadge = page.getByTestId(
      "transcode-warning-track-suspect-transcode",
    );
    await expect(warningBadge).toBeVisible();
    await expect(warningBadge).toContainText("16kHz");

    // Click play preview to audition and verify warning badge in player
    const playBtn = page.getByTestId("preview-track-track-suspect-transcode");
    await expect(playBtn).toBeVisible();
    await playBtn.click();

    const playerWarningBadge = page.getByTestId("player-transcode-warning");
    await expect(playerWarningBadge).toBeVisible();
    await expect(playerWarningBadge).toContainText("16kHz");
  });

  test("allows toggling ReplayGain loudness normalization in settings and persists", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    // Open settings modal
    await page.getByTestId("settings-trigger").click();
    const modal = page.getByTestId("settings-modal");
    await expect(modal).toBeVisible();

    const replayGainToggle = page.getByTestId("replaygain-toggle");
    await expect(replayGainToggle).toBeAttached();
    // Default must be true/checked
    await expect(replayGainToggle).toBeChecked();

    // Toggle off by clicking the visible label switch
    const toggleLabel = page.getByTestId("replaygain-toggle-label");
    await expect(toggleLabel).toBeVisible();
    await toggleLabel.click();
    await expect(replayGainToggle).not.toBeChecked();

    // Close settings modal
    await page.getByTestId("settings-close-button").click();
    await expect(modal).toBeHidden();

    // Verify persisted config on disk
    const configFile = join(userDataDir, "config.json");
    const raw = JSON.parse(readFileSync(configFile, "utf-8"));
    expect(raw.preferences.enableReplayGain).toBe(false);
  });
});
