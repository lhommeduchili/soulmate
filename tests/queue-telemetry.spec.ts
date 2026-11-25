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

test.describe("Real-Time Queue Telemetry & Retry Workflow", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-telemetry-"));

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

  test("renders real-time speed, formatted size, active peer and status transitions", async () => {
    // 1. Verify live region element exists
    const liveRegion = page.locator('aside [aria-live="polite"]');
    await expect(liveRegion).toBeAttached();

    // 2. Dispatch downloading state with real-time telemetry over IPC
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "telemetry-item-1",
          track: {
            id: "telemetry-item-1",
            name: "Hyperdrive Matrix",
            artists: [{ name: "Cyberpunk DJ" }],
            album: { name: "Neon City" },
            duration_ms: 240000,
          },
          status: "downloading",
          progress: 68,
          speed: 870400,
          formattedSpeed: "850 KB/s",
          bytesTransferred: 7130317,
          size: 10485760,
          formattedSize: "6.8 MB / 10.0 MB",
          username: "matrix_runner",
        },
      ]);
    });

    // 3. Assert downloading item rendering in sidebar
    const queueItem = page.locator('aside div[role="listitem"]').first();
    await expect(queueItem).toBeVisible({ timeout: 10000 });

    // Track name and artist
    await expect(queueItem).toContainText(/cyberpunk dj - hyperdrive matrix/i);

    // Real-time speed indicator
    await expect(queueItem.locator("text=850 KB/s")).toBeVisible();

    // Percentage
    await expect(queueItem.locator("text=68%")).toBeVisible();

    // Formatted byte size
    await expect(queueItem.locator("text=6.8 MB / 10.0 MB")).toBeVisible();

    // Active peer status
    await expect(queueItem.locator("text=@matrix_runner")).toBeVisible();

    // 4. Test Transition to Connecting State
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "telemetry-item-1",
          track: {
            id: "telemetry-item-1",
            name: "Hyperdrive Matrix",
            artists: [{ name: "Cyberpunk DJ" }],
            album: { name: "Neon City" },
            duration_ms: 240000,
          },
          status: "connecting",
          progress: 0,
        },
      ]);
    });

    await expect(queueItem.locator("text=CONNECTING...")).toBeVisible();

    // 5. Test Transition to Completed State
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "telemetry-item-1",
          track: {
            id: "telemetry-item-1",
            name: "Hyperdrive Matrix",
            artists: [{ name: "Cyberpunk DJ" }],
            album: { name: "Neon City" },
            duration_ms: 240000,
          },
          status: "completed",
          progress: 100,
          bytesTransferred: 10485760,
          size: 10485760,
          formattedSize: "10.0 MB / 10.0 MB",
          username: "matrix_runner",
        },
      ]);
    });

    await expect(queueItem.locator("text=COMPLETE")).toBeVisible();
    await expect(liveRegion).toContainText(
      "Hyperdrive Matrix download complete",
    );

    // 6. Test Failed State and Retry Capability
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "telemetry-item-1",
          track: {
            id: "telemetry-item-1",
            name: "Hyperdrive Matrix",
            artists: [{ name: "Cyberpunk DJ" }],
            album: { name: "Neon City" },
            duration_ms: 240000,
          },
          status: "failed",
          progress: 0,
          error: "No match found",
        },
      ]);
    });

    // Check failed status text and screen reader announcement
    await expect(queueItem.locator("text=NOT FOUND")).toBeVisible();
    await expect(liveRegion).toContainText("Hyperdrive Matrix download failed");

    // Assert retry button is visible with accessible aria-label
    const retryButton = queueItem.getByRole("button", {
      name: /retry download for hyperdrive matrix/i,
    });
    await expect(retryButton).toBeVisible();

    // Spy on queue:retry invocation or click retry
    await retryButton.click();

    // Verify clearQueue button cleans up queue
    const clearBtn = page.getByRole("button", {
      name: /clear download queue/i,
    });
    await expect(clearBtn).toBeAttached();
    await clearBtn.click();
  });
});
