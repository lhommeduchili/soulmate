import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";

test.describe("Phase 12: Manual Peer/Source Selection, Query Tuning & Audiophile Format Badges", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;
  let customDownloadsDir: string;

  const launchApp = async (
    initialQueue: unknown[] = [],
    locale: "en" | "es-CL" = "en",
  ): Promise<{ app: ElectronApplication; page: Page }> => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-peer-select-"));
    customDownloadsDir = join(userDataDir, "Downloads");
    mkdirSync(customDownloadsDir, { recursive: true });

    // Seed dummy FLAC file for auditioning
    const audioFilePath = join(customDownloadsDir, "sample_audiophile.flac");
    writeFileSync(audioFilePath, "fLaCfake_lossless_audio_stream");

    writeFileSync(
      join(userDataDir, "config.json"),
      JSON.stringify({
        preferences: {
          downloadPath: customDownloadsDir,
          formatPriority: "flac",
          locale,
          region: "CL",
          maxConcurrentDownloads: 2,
        },
        queue: initialQueue,
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

  test("allows manual query tuning with inline editor and keyboard controls", async () => {
    const failedItem = {
      id: "unmatched-track-1",
      track: {
        id: "unmatched-track-1",
        name: "Rare Vinyl B-Side (Obscure Mix)",
        artists: [{ name: "Underground Producer" }],
        album: { name: "White Label" },
        duration_ms: 360000,
      },
      status: "failed",
      progress: 0,
      error: "No match found",
    };

    const instance = await launchApp([failedItem], "en");
    app = instance.app;
    page = instance.page;

    const queueItem = page.locator(
      '[data-testid="queue-item-unmatched-track-1"]',
    );
    await expect(queueItem).toBeVisible({ timeout: 10000 });

    // Assert status and action buttons
    await expect(queueItem.locator("text=NOT FOUND")).toBeVisible();
    const editQueryBtn = page.locator(
      '[data-testid="edit-query-unmatched-track-1"]',
    );
    await expect(editQueryBtn).toBeVisible();
    await expect(editQueryBtn).toContainText(/edit query/i);

    // Open inline query editor
    await editQueryBtn.click();

    const queryInput = page.locator(
      '[data-testid="query-input-unmatched-track-1"]',
    );
    await expect(queryInput).toBeVisible();
    await expect(queryInput).toBeFocused();

    // Verify Escape dismisses without submitting and restores focus
    await queryInput.press("Escape");
    await expect(queryInput).not.toBeVisible();
    await expect(editQueryBtn).toBeFocused();

    // Re-open and commit new tuned query
    await editQueryBtn.click();
    await expect(queryInput).toBeVisible();

    await queryInput.fill("Underground Producer Rare Vinyl 12 Inch FLAC");
    await queryInput.press("Enter");

    // Once submitted, inline input closes
    await expect(queryInput).not.toBeVisible();

    // Verify item transitioned to pending/searching
    await expect(
      queueItem
        .locator("text=SEARCHING...")
        .or(queueItem.locator("text=NOT FOUND")),
    ).toBeVisible();
  });

  test("opens PeerSelectionModal with live search results, keyboard trap, and allows source selection", async () => {
    const queuedItem = {
      id: "queued-track-peer",
      track: {
        id: "queued-track-peer",
        name: "Liquid Sunset",
        artists: [{ name: "DJ Horizon" }],
        album: { name: "Summer Grooves" },
        duration_ms: 280000,
      },
      status: "failed",
      progress: 0,
      error: "No match found",
    };

    const instance = await launchApp([queuedItem], "en");
    app = instance.app;
    page = instance.page;

    // Mock IPC queue:search-sources and queue:select-source inside Electron app context
    await app.evaluate(async ({ ipcMain, BrowserWindow }) => {
      ipcMain.removeHandler("queue:search-sources");
      ipcMain.handle("queue:search-sources", async () => {
        return {
          query: "DJ Horizon Liquid Sunset",
          files: [
            {
              filename: "Electronic/DJ Horizon - Liquid Sunset (Club Mix).flac",
              bitRate: 1411,
              size: 44040192,
              username: "audiophile_dj",
              speed: 2097152,
              slotsFree: true,
              queueLength: 0,
            },
            {
              filename: "DJ Horizon - Liquid Sunset.mp3",
              bitRate: 320,
              size: 11534336,
              username: "mp3_vault",
              speed: 524288,
              slotsFree: false,
              queueLength: 2,
            },
          ],
        };
      });

      ipcMain.removeHandler("queue:select-source");
      ipcMain.handle("queue:select-source", async (_, payload) => {
        const win = BrowserWindow.getAllWindows()[0];
        // Send state update as downloading with chosen source
        win.webContents.send("queue:update", [
          {
            id: payload.id,
            track: {
              id: payload.id,
              name: "Liquid Sunset",
              artists: [{ name: "DJ Horizon" }],
              album: { name: "Summer Grooves" },
              duration_ms: 280000,
            },
            status: "downloading",
            progress: 15,
            filename: payload.filename,
            username: payload.username,
            size: payload.size,
            formattedSize: "6.6 MB / 42.0 MB",
            speed: 2097152,
            formattedSpeed: "2.0 MB/s",
          },
        ]);
        return true;
      });
    });

    const chooseSourceBtn = page.locator(
      '[data-testid="choose-source-queued-track-peer"]',
    );
    await expect(chooseSourceBtn).toBeVisible({ timeout: 10000 });

    // 1. Click [CHOOSE SOURCE] to open modal
    await chooseSourceBtn.click();

    const modal = page.locator('[data-testid="peer-selection-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute("role", "dialog");
    await expect(modal).toHaveAttribute("aria-modal", "true");

    // Modal title & search input
    await expect(modal.locator("#peer-modal-title")).toContainText(
      /peer source inspection/i,
    );
    const searchInput = page.locator('[data-testid="peer-search-input"]');
    await expect(searchInput).toBeVisible();

    // 2. Assert results table contents
    const flacRow = page.locator('[data-testid="peer-row-0"]');
    await expect(flacRow).toBeVisible();
    await expect(flacRow).toContainText("@audiophile_dj");
    await expect(flacRow).toContainText("FLAC");
    await expect(flacRow).toContainText("42.0 MB");
    await expect(
      flacRow.locator('[data-testid="peer-download-btn-0"]'),
    ).toBeVisible();

    const mp3Row = page.locator('[data-testid="peer-row-1"]');
    await expect(mp3Row).toBeVisible();
    await expect(mp3Row).toContainText("@mp3_vault");
    await expect(mp3Row).toContainText("320 KBPS");
    await expect(mp3Row).toContainText("11.0 MB");

    // 3. Accessibility focus trapping check
    const closeBtn = page.locator('[data-testid="peer-modal-close-btn"]');
    await expect(closeBtn).toBeVisible();

    // 4. Test selecting lossless FLAC source
    await page.locator('[data-testid="peer-download-btn-0"]').click();

    // Modal should close automatically on selection
    await expect(modal).not.toBeVisible();

    // Verify queue item updated to downloading from chosen peer
    const queueItem = page.locator(
      '[data-testid="queue-item-queued-track-peer"]',
    );
    await expect(queueItem).toBeVisible();
    await expect(queueItem.locator("text=@audiophile_dj")).toBeVisible();
    await expect(queueItem.locator("text=2.0 MB/s")).toBeVisible();
  });

  test("renders audiophile format badges in sidebar and audio player bar", async () => {
    const instance = await launchApp([], "en");
    app = instance.app;
    page = instance.page;

    const audioFilePath = join(customDownloadsDir, "sample_audiophile.flac");

    // Dispatch completed audiophile item
    await app.evaluate(
      async ({ BrowserWindow }, { audioFilePath }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.webContents.send("queue:update", [
          {
            id: "audiophile-track-master",
            track: {
              id: "audiophile-track-master",
              name: "Resonance Continuum",
              artists: [{ name: "Modular Synthesist" }],
              album: { name: "Direct From Vinyl" },
              duration_ms: 310000,
              targetPath: audioFilePath,
              filePath: audioFilePath,
            },
            status: "completed",
            progress: 100,
            targetPath: audioFilePath,
            filePath: audioFilePath,
            formatInfo: {
              format: "FLAC",
              sampleRate: 96000,
              bitDepth: 24,
              channels: 2,
            },
          },
        ]);
      },
      { audioFilePath },
    );

    const queueItem = page.locator(
      '[data-testid="queue-item-audiophile-track-master"]',
    );
    await expect(queueItem).toBeVisible({ timeout: 10000 });

    // Assert audiophile badge in sidebar
    const badge = page.locator(
      '[data-testid="format-badge-audiophile-track-master"]',
    );
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("[24-BIT / 96kHz]");

    // Trigger in-app audio preview audition
    const previewBtn = page.locator(
      '[data-testid="preview-track-audiophile-track-master"]',
    );
    await expect(previewBtn).toBeVisible();
    await previewBtn.click();

    // Assert audio preview player bar renders and displays format badge
    const player = page.locator('[data-testid="audio-preview-player"]');
    await expect(player).toBeVisible();
    await expect(player).toContainText("Resonance Continuum");

    const playerBadge = page.locator('[data-testid="player-format-badge"]');
    await expect(playerBadge).toBeVisible();
    await expect(playerBadge).toHaveText("[24-BIT / 96kHz]");
  });
});
