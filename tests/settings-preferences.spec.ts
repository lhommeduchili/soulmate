import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

test.describe("Settings & Preferences E2E", () => {
  let userDataDir: string;

  const launchApp = async (): Promise<{
    app: ElectronApplication;
    page: Page;
  }> => {
    const app = await electron.launch({
      args: [join(__dirname, "../out/main/index.js")],
      env: {
        ...process.env,
        TEST_USER_DATA_DIR: userDataDir,
      },
    });

    const page = await app.firstWindow();
    return { app, page };
  };

  test.beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-prefs-"));
  });

  test.afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test("traps focus on open, dismisses with Escape, and returns focus to trigger", async () => {
    const { app, page } = await launchApp();

    const trigger = page.getByTestId("settings-trigger");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const modal = page.getByTestId("settings-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute("role", "dialog");
    await expect(modal).toHaveAttribute("aria-modal", "true");

    // Close button should be initially focused
    await expect(page.getByTestId("settings-close-button")).toBeFocused();
    await page.waitForTimeout(50);

    // Tab through modal interactive elements - focus must stay inside modal
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("downloads-directory-button")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("language-select")).toBeFocused();

    // Verify focus remains trapped inside dialog
    await page.keyboard.press("Tab");
    const isFocusInside = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="settings-modal"]');
      return !!dialog?.contains(document.activeElement);
    });
    expect(isFocusInside).toBe(true);

    // Escape dismisses modal and restores focus to trigger button
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(trigger).toBeFocused();

    await app.close();
  });

  test("changing language immediately updates UI text and persists across relaunch", async () => {
    const firstRun = await launchApp();

    // Initially Spanish by default (Chile default)
    await expect(firstRun.page.locator("html")).toHaveAttribute(
      "lang",
      "es-CL",
    );
    await expect(
      firstRun.page.getByPlaceholder(
        "pega una url pública de spotify, youtube, soundcloud o bandcamp",
      ),
    ).toBeVisible();

    // Open settings and change language to English
    await firstRun.page.getByTestId("settings-trigger").click();
    await expect(firstRun.page.getByTestId("settings-modal")).toBeVisible();
    await firstRun.page.getByTestId("language-select").selectOption("en");

    // Check immediate UI text update
    await expect(firstRun.page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      firstRun.page.getByPlaceholder(
        "paste public spotify, youtube, soundcloud, or bandcamp url",
      ),
    ).toBeVisible();

    // Region and redundant Audio Quality selectors should not be rendered
    await expect(firstRun.page.getByTestId("region-select")).toHaveCount(0);
    await expect(firstRun.page.getByTestId("audio-quality-select")).toHaveCount(
      0,
    );

    // Format priority should default to aiff, wav, flac, mp3
    const formatList = firstRun.page.getByTestId("format-priority-list");
    await expect(formatList).toBeVisible();
    await expect(formatList).toHaveText("aiffwavflacmp3");

    // Dismiss settings
    await firstRun.page.getByTestId("settings-dismiss-button").click();
    await expect(firstRun.page.getByTestId("settings-modal")).toBeHidden();

    // Allow atomic disk persistence to flush
    await firstRun.page.waitForTimeout(500);

    // Close application
    await firstRun.app.close();

    // Relaunch app with same userDataDir
    const secondRun = await launchApp();

    // Language should persist as English
    await expect(secondRun.page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      secondRun.page.getByPlaceholder(
        "paste public spotify, youtube, soundcloud, or bandcamp url",
      ),
    ).toBeVisible();

    // Settings dialog should reflect persisted values
    await secondRun.page.getByTestId("settings-trigger").click();
    await expect(secondRun.page.getByTestId("language-select")).toHaveValue(
      "en",
    );

    await secondRun.app.close();
  });
});
