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

test.describe("Settings localization persistence", () => {
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
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-locale-"));
  });

  test.afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test("persists language preference across relaunch", async () => {
    const firstRun = await launchApp();

    await firstRun.page.getByTestId("settings-trigger").click();
    await expect(firstRun.page.getByTestId("settings-modal")).toBeVisible();

    await firstRun.page.getByTestId("language-select").selectOption("es-CL");

    await firstRun.app.close();

    const secondRun = await launchApp();

    await expect(secondRun.page.locator("html")).toHaveAttribute(
      "lang",
      "es-CL",
    );

    await secondRun.page.getByTestId("settings-trigger").click();
    await expect(secondRun.page.getByTestId("language-select")).toHaveValue(
      "es-CL",
    );

    await secondRun.app.close();
  });
});
