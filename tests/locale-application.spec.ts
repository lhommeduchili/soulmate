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

test.describe("Locale application", () => {
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
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-lang-"));
  });

  test.afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test("applies Spanish UI copy when es-CL is selected", async () => {
    const { app, page } = await launchApp();

    await page.getByTestId("settings-trigger").click();
    await page.getByTestId("language-select").selectOption("es-CL");
    await page.getByTestId("settings-dismiss-button").click();

    await expect(page.locator("html")).toHaveAttribute("lang", "es-CL");
    await expect(
      page.getByPlaceholder(
        "pega una url publica de playlist de spotify o youtube",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Explorar playlist" }),
    ).toBeVisible();

    await app.close();
  });
});
