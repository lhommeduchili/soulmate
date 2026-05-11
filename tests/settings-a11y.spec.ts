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

test.describe("Settings accessibility", () => {
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
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-a11y-"));
  });

  test.afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test("traps focus, closes on escape, and restores focus to trigger", async () => {
    const { app, page } = await launchApp();

    const trigger = page.getByTestId("settings-trigger");
    await trigger.click();

    const dialog = page.getByTestId("settings-modal");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    await expect(page.getByTestId("settings-close-button")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("downloads-directory-button")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("language-select")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(
      page.evaluate(() => {
        const modal = document.querySelector('[data-testid="settings-modal"]');
        return !!modal?.contains(document.activeElement);
      }),
    ).resolves.toBe(true);

    await page.keyboard.press("Tab");
    await expect(
      page.evaluate(() => {
        const modal = document.querySelector('[data-testid="settings-modal"]');
        return !!modal?.contains(document.activeElement);
      }),
    ).resolves.toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await app.close();
  });
});
