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

test.describe("Queue Persistence, Batch Pause/Resume & Audio Preview (E2E)", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;
  let customDownloadsDir: string;
  const unhandledErrors: Error[] = [];

  const launchApp = async (
    initialQueue: unknown[] = [],
    locale: "en" | "es-CL" = "en",
  ): Promise<{ app: ElectronApplication; page: Page }> => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-qpersist-"));
    customDownloadsDir = join(userDataDir, "Audio_Library");
    mkdirSync(customDownloadsDir, { recursive: true });

    // Seed dummy audio file for audition preview
    const sampleAudioPath = join(customDownloadsDir, "sample_track.flac");
    writeFileSync(sampleAudioPath, "fLaCfake_audio_content_for_testing");

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

  test("persists queue items and recovers interrupted active transfers cleanly as PAUSED on startup", async () => {
    const sampleAudioPath = join(tmpdir(), "sample_completed.flac");
    writeFileSync(sampleAudioPath, "fLaCmock_audio_data");

    const initialQueue = [
      {
        id: "active-transfer-1",
        track: {
          id: "active-transfer-1",
          name: "Interrupted Beat",
          artists: [{ name: "DJ Crash" }],
          album: { name: "Recovery EP" },
          duration_ms: 210000,
        },
        status: "downloading",
        progress: 42,
        filename: "Interrupted Beat.flac",
        username: "soul_peer",
        transferId: "tx-recover-1",
      },
      {
        id: "completed-track-1",
        track: {
          id: "completed-track-1",
          name: "Finished Master",
          artists: [{ name: "DJ Success" }],
          album: { name: "Vault Vol 1" },
          duration_ms: 195000,
        },
        status: "completed",
        progress: 100,
        targetPath: sampleAudioPath,
        filePath: sampleAudioPath,
      },
    ];

    const launched = await launchApp(initialQueue, "en");
    app = launched.app;
    page = launched.page;

    // Verify both items rendered in the sidebar queue
    await expect(
      page.getByTestId("queue-item-active-transfer-1"),
    ).toBeVisible();
    await expect(
      page.getByTestId("queue-item-completed-track-1"),
    ).toBeVisible();

    // Verify crash recovery transitioned "downloading" to "PAUSED"
    await expect(page.getByText("PAUSED", { exact: true })).toBeVisible();

    // Verify ASCII progress meter is rendered
    const asciiProgress = page.getByTestId("ascii-progress-active-transfer-1");
    await expect(asciiProgress).toBeVisible();
    await expect(asciiProgress).toContainText("█");
    await expect(asciiProgress).toContainText("░");

    // Verify completed item is COMPLETE
    await expect(page.getByText("COMPLETE", { exact: true })).toBeVisible();

    // Verify no unhandled page errors
    expect(unhandledErrors).toEqual([]);
  });

  test("handles Pause All / Resume All toggle states and Clear Completed action", async () => {
    const initialQueue = [
      {
        id: "item-active",
        track: {
          id: "item-active",
          name: "Active Track",
          artists: [{ name: "Producer A" }],
          album: { name: "EP A" },
          duration_ms: 180000,
        },
        status: "pending",
        progress: 0,
      },
      {
        id: "item-done",
        track: {
          id: "item-done",
          name: "Done Track",
          artists: [{ name: "Producer B" }],
          album: { name: "EP B" },
          duration_ms: 180000,
        },
        status: "completed",
        progress: 100,
      },
    ];

    const launched = await launchApp(initialQueue, "en");
    app = launched.app;
    page = launched.page;

    // Verify queue toolbar exists
    const toolbar = page.getByTestId("queue-toolbar");
    await expect(toolbar).toBeVisible();

    // Click "Pause All"
    const pauseAllButton = page.getByTestId("queue-pause-all");
    await expect(pauseAllButton).toBeVisible();
    await pauseAllButton.click();

    // Button flips to "Resume All" and item displays PAUSED
    const resumeAllButton = page.getByTestId("queue-resume-all");
    await expect(resumeAllButton).toBeVisible();
    await expect(page.getByText("PAUSED", { exact: true })).toBeVisible();

    // Click "Resume All"
    await resumeAllButton.click();

    // Click "Clear Completed"
    const clearCompletedButton = page.getByTestId("queue-clear-completed");
    await expect(clearCompletedButton).toBeVisible();
    await clearCompletedButton.click();

    // "Done Track" should be removed from the sidebar
    await expect(page.getByTestId("queue-item-item-done")).toBeHidden();
    // "Active Track" should still be in the queue
    await expect(page.getByTestId("queue-item-item-active")).toBeVisible();

    expect(unhandledErrors).toEqual([]);
  });

  test("launches in-app audio preview player on completed tracks with keyboard controls (Space / Escape)", async () => {
    const dummyAudioPath = join(tmpdir(), "sample_audition.flac");
    writeFileSync(dummyAudioPath, "fLaCaudiophile_stream_preview_data");

    const initialQueue = [
      {
        id: "preview-target-track",
        track: {
          id: "preview-target-track",
          name: "Peak Time Anthem",
          artists: [{ name: "Resident DJ" }],
          album: { name: "Club Nights" },
          duration_ms: 240000,
        },
        status: "completed",
        progress: 100,
        targetPath: dummyAudioPath,
        filePath: dummyAudioPath,
      },
    ];

    const launched = await launchApp(initialQueue, "en");
    app = launched.app;
    page = launched.page;

    // Preview trigger on completed track in sidebar
    const previewButton = page.getByTestId(
      "preview-track-preview-target-track",
    );
    await expect(previewButton).toBeVisible();
    await previewButton.click();

    // Audio preview player bar should appear docked at the bottom
    const player = page.getByTestId("audio-preview-player");
    await expect(player).toBeVisible();

    // Verify track information rendered
    await expect(player.getByText("Peak Time Anthem")).toBeVisible();
    await expect(player.getByText("Resident DJ")).toBeVisible();

    // Verify controls are present and accessible
    const playPauseBtn = page.getByTestId("player-play-pause");
    await expect(playPauseBtn).toBeVisible();
    await expect(page.getByTestId("player-seek")).toBeVisible();
    await expect(page.getByTestId("player-volume")).toBeVisible();
    await expect(page.getByTestId("player-time")).toBeVisible();

    // Press Space to toggle play/pause
    await page.keyboard.press("Space");

    // Press Escape to dismiss the player
    await page.keyboard.press("Escape");
    await expect(player).toBeHidden();

    expect(unhandledErrors).toEqual([]);
  });

  test("persists concurrency limit setting in SettingsModal", async () => {
    const launched = await launchApp([], "en");
    app = launched.app;
    page = launched.page;

    // Open settings modal
    const settingsTrigger = page.getByTestId("settings-trigger");
    await settingsTrigger.click();

    const concurrencySelect = page.getByTestId("concurrency-select");
    await expect(concurrencySelect).toBeVisible();

    // Initial default should be 2
    await expect(concurrencySelect).toHaveValue("2");

    // Change to 1 concurrent download
    await concurrencySelect.selectOption("1");
    await expect(concurrencySelect).toHaveValue("1");

    // Close settings modal
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings-modal")).toBeHidden();

    // Re-open settings to verify immediate persistence
    await settingsTrigger.click();
    await expect(page.getByTestId("concurrency-select")).toHaveValue("1");

    expect(unhandledErrors).toEqual([]);
  });
});
