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

test.describe("Audiophile Metadata Pipeline & DJ Organization (E2E)", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;
  let customDownloadsDir: string;
  const unhandledErrors: Error[] = [];

  const launchWithLocale = async (
    locale: "en" | "es-CL" = "en",
  ): Promise<{ app: ElectronApplication; page: Page }> => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-meta-user-"));
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

  test("displays 'TAGGING...' during metadata injection and exposes accessible 'Reveal in Folder' action upon completion", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    const liveRegion = page.locator('aside [aria-live="polite"]');
    await expect(liveRegion).toBeAttached();

    // 1. Initial downloading status
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "meta-track-1",
          track: {
            id: "meta-track-1",
            name: "Get Lucky (feat. Pharrell Williams)",
            artists: [{ name: "Daft Punk" }, { name: "Pharrell Williams" }],
            album: { name: "Random Access Memories" },
            duration_ms: 369000,
            track_number: 8,
            year: 2013,
          },
          status: "downloading",
          progress: 85,
        },
      ]);
    });

    const queueItem = page.locator('aside div[role="listitem"]').first();
    await expect(queueItem).toBeVisible({ timeout: 10000 });

    // 2. Transition to 'tagging' status
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "meta-track-1",
          track: {
            id: "meta-track-1",
            name: "Get Lucky (feat. Pharrell Williams)",
            artists: [{ name: "Daft Punk" }, { name: "Pharrell Williams" }],
            album: { name: "Random Access Memories" },
            duration_ms: 369000,
            track_number: 8,
            year: 2013,
          },
          status: "tagging",
          progress: 100,
        },
      ]);
    });

    // Assert 'TAGGING...' badge is visible
    await expect(queueItem.locator("text=TAGGING...")).toBeVisible();
    await expect(liveRegion).toContainText(
      "Get Lucky (feat. Pharrell Williams) tagging metadata",
    );

    // 3. Create target file on disk to simulate completed enrichment
    const targetFolder = join(
      customDownloadsDir,
      "Daft Punk, Pharrell Williams",
      "Random Access Memories",
    );
    mkdirSync(targetFolder, { recursive: true });
    const targetFile = join(
      targetFolder,
      "08 - Get Lucky (feat. Pharrell Williams).flac",
    );
    writeFileSync(targetFile, Buffer.from("fLaC_dummy_tagged_stream"));

    // 4. Transition to 'completed' status with targetPath
    await app.evaluate(async ({ BrowserWindow }, file) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "meta-track-1",
          track: {
            id: "meta-track-1",
            name: "Get Lucky (feat. Pharrell Williams)",
            artists: [{ name: "Daft Punk" }, { name: "Pharrell Williams" }],
            album: { name: "Random Access Memories" },
            duration_ms: 369000,
            track_number: 8,
            year: 2013,
          },
          status: "completed",
          progress: 100,
          targetPath: file,
          filePath: file,
          formattedSize: "42.5 MB",
        },
      ]);
    }, targetFile);

    // Assert 'COMPLETE' status
    await expect(queueItem.locator("text=COMPLETE")).toBeVisible();
    await expect(liveRegion).toContainText(
      "Get Lucky (feat. Pharrell Williams) download complete",
    );

    // Assert 'Reveal in Folder' button exists with accessible attributes
    const revealButton = page.getByTestId("reveal-in-folder-meta-track-1");
    await expect(revealButton).toBeVisible();
    await expect(revealButton).toHaveAttribute("title", "Reveal in folder");
    await expect(revealButton).toHaveAttribute(
      "aria-label",
      "Reveal Get Lucky (feat. Pharrell Williams) in folder",
    );

    // 5. Click 'Reveal in Folder' action to trigger IPC safely
    await revealButton.click();

    // Verify 0 unhandled errors occurred
    expect(unhandledErrors).toHaveLength(0);
  });

  test("handles queue:open-folder IPC calls safely without error", async () => {
    const launched = await launchWithLocale("en");
    app = launched.app;
    page = launched.page;

    // Direct invocation of openFolder IPC through preload API
    const resultExisting = await page.evaluate(async (dir) => {
      return await window.api.queue.openFolder(dir);
    }, customDownloadsDir);
    expect(resultExisting).toBe(true);

    const resultFallback = await page.evaluate(async () => {
      return await window.api.queue.openFolder(undefined);
    });
    expect(resultFallback).toBe(true);

    expect(unhandledErrors).toHaveLength(0);
  });

  test("renders localized 'ETIQUETANDO...' and Spanish folder reveal tooltips under es-CL locale", async () => {
    const launched = await launchWithLocale("es-CL");
    app = launched.app;
    page = launched.page;

    // 1. Send tagging status
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "meta-track-cl",
          track: {
            id: "meta-track-cl",
            name: "Tren Al Sur",
            artists: [{ name: "Los Prisioneros" }],
            album: { name: "Corazones" },
            duration_ms: 334000,
          },
          status: "tagging",
          progress: 100,
        },
      ]);
    });

    const queueItem = page.locator('aside div[role="listitem"]').first();
    await expect(queueItem).toBeVisible({ timeout: 10000 });
    await expect(queueItem.locator("text=ETIQUETANDO...")).toBeVisible();

    // 2. Send completed status
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send("queue:update", [
        {
          id: "meta-track-cl",
          track: {
            id: "meta-track-cl",
            name: "Tren Al Sur",
            artists: [{ name: "Los Prisioneros" }],
            album: { name: "Corazones" },
            duration_ms: 334000,
          },
          status: "completed",
          progress: 100,
        },
      ]);
    });

    await expect(queueItem.locator("text=COMPLETO")).toBeVisible();
    const revealBtn = page.getByTestId("reveal-in-folder-meta-track-cl");
    await expect(revealBtn).toBeVisible();
    await expect(revealBtn).toHaveAttribute("title", "Mostrar en carpeta");
    await expect(revealBtn).toHaveAttribute(
      "aria-label",
      "Mostrar Tren Al Sur en la carpeta",
    );
  });
});
