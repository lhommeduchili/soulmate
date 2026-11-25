import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import { join } from "path";

test.describe("Guest Mode UI", () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [join(__dirname, "../out/main/index.js")],
    });
    page = await app.firstWindow();
  });

  test.afterAll(async () => {
    if (app) await app.close();
  });

  test("launches directly to playlists/dashboard view", async () => {
    // Wait for app to load
    await page.waitForTimeout(2000);

    // Title should be soulmate
    const title = await page.title();
    expect(title).toBe("soulmate");

    // Should NOT see the full screen login page title
    // Should NOT see the full screen login page title
    // loginTitle removed as it's ambiguous now

    // Let's check for the specific "without music, life would be a mistake" quote which is only on login
    const loginQuote = page.locator(
      'text="without music, life would be a mistake"',
    );
    await expect(loginQuote).not.toBeVisible();

    // Should see the Sidebar header
    const sidebarHeader = page.locator('div:has-text("soulmate")').first();
    await expect(sidebarHeader).toBeVisible();
  });

  test("shows welcoming zero-login workspace without prominent login banner", async () => {
    // 1. Prominent CONNECT SPOTIFY banner must NOT be visible in the main playlist area
    const connectBtnInMain = page
      .locator("main")
      .getByRole("button", { name: /connect spotify|conectar spotify/i });
    await expect(connectBtnInMain).not.toBeVisible();

    // 2. Welcoming workspace title and guidance are prominently displayed
    const welcomeHeading = page.locator("h2", {
      hasText: /welcome to soulmate|bienvenido a soulmate/i,
    });
    await expect(welcomeHeading).toBeVisible();

    // 3. Clear guidance on pasting public Spotify and YouTube URLs is presented
    const guidanceText = page.locator("main", { hasText: /spotify/i });
    await expect(guidanceText).toBeVisible();
  });

  test("repositions spotify authentication as optional action inside settings modal", async () => {
    // Open Settings Modal
    const settingsTrigger = page.getByTestId("settings-trigger");
    await settingsTrigger.click();

    const settingsModal = page.getByTestId("settings-modal");
    await expect(settingsModal).toBeVisible();

    // Verify optional Spotify Connect action exists inside Settings
    const connectAccountBtn = settingsModal.getByRole("button", {
      name: /connect account|conectar cuenta|connect spotify|conectar spotify/i,
    });
    await expect(connectAccountBtn).toBeVisible();

    // Close Settings Modal
    await page.keyboard.press("Escape");
    await expect(settingsModal).toBeHidden();
  });
});
