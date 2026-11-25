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

test.describe("Keyboard-Operable Track Cell Editing (A11y)", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-cell-a11y-"));

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

    // Mock Spotify API in Main process for fast, deterministic review table loading
    await app.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler("spotify:getPlaylist");
      ipcMain.handle("spotify:getPlaylist", async () => ({
        id: "a11y-test-playlist",
        name: "Accessible Test Playlist",
        tracks: { total: 1 },
        owner: { display_name: "Soulmate Tester" },
        images: [{ url: "https://example.com/cover.jpg" }],
        type: "spotify",
      }));

      ipcMain.removeHandler("spotify:tracks");
      ipcMain.handle("spotify:tracks", async () => [
        {
          id: "track-a11y-1",
          name: "Original Track Title",
          artists: [{ name: "Original Artist" }],
          album: { name: "Original Album" },
          duration_ms: 210000,
        },
      ]);
    });
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

  test("edits and saves track cell using only the keyboard", async () => {
    // 1. Ingest playlist to populate review page
    const topBarSearch = page.locator("#playlist-search");
    await expect(topBarSearch).toBeVisible({ timeout: 10000 });

    await topBarSearch.fill(
      "https://open.spotify.com/playlist/a11y-test-playlist",
    );
    await topBarSearch.press("Enter");

    // 2. Click playlist card to navigate to review page
    const playlistCard = page.locator('div[role="listitem"] button').first();
    await expect(playlistCard).toBeVisible({ timeout: 10000 });
    await playlistCard.click();

    await expect(page).toHaveURL(/.*\/review\/spotify\/a11y-test-playlist/, {
      timeout: 10000,
    });

    // 3. Locate track row and title button
    const trackRow = page.locator("table tbody tr").first();
    await expect(trackRow).toBeVisible({ timeout: 10000 });

    const titleCellButton = trackRow.locator("td").nth(1).locator("button");
    await expect(titleCellButton).toBeVisible();
    await expect(titleCellButton).toHaveText("Original Track Title");

    // 4. Test Visible Focus Styling
    await titleCellButton.focus();
    await expect(titleCellButton).toBeFocused();
    const classList = await titleCellButton.getAttribute("class");
    expect(classList).toContain("focus-visible:ring-2");
    expect(classList).toContain("focus-visible:ring-soul-green");

    // 5. Test Cancel via Escape
    // Press Enter to start editing
    await page.keyboard.press("Enter");

    const titleInput = trackRow.locator("td").nth(1).locator("input");
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeFocused();

    // Type draft text (text was auto-selected so typing replaces it)
    await page.keyboard.type("Accidentally Typed Draft");
    await expect(titleInput).toHaveValue("Accidentally Typed Draft");

    // Press Escape to cancel edits
    await page.keyboard.press("Escape");

    // Assert edit mode exited and original value is preserved
    await expect(titleInput).not.toBeVisible();
    await expect(titleCellButton).toBeVisible();
    await expect(titleCellButton).toHaveText("Original Track Title");

    // 6. Test Confirm & Save via Enter
    // Focus button again and press Enter to enter edit mode
    await titleCellButton.focus();
    await page.keyboard.press("Enter");
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeFocused();

    // Type new title using only the keyboard
    await page.keyboard.type("Keyboard Edited Master Track");
    await expect(titleInput).toHaveValue("Keyboard Edited Master Track");
    await page.keyboard.press("Enter");

    // Assert input is closed and button now displays saved title
    await expect(titleInput).not.toBeVisible();
    await expect(titleCellButton).toBeVisible();
    await expect(titleCellButton).toHaveText("Keyboard Edited Master Track");

    // 7. Test Space key activation on Artist cell
    const artistCellButton = trackRow.locator("td").nth(2).locator("button");
    await expect(artistCellButton).toBeVisible();
    await expect(artistCellButton).toHaveText("Original Artist");

    await artistCellButton.focus();
    await page.keyboard.press("Space");

    const artistInput = trackRow.locator("td").nth(2).locator("input");
    await expect(artistInput).toBeVisible();
    await expect(artistInput).toBeFocused();

    await page.keyboard.type("Daft Punk & Pharrell");
    await expect(artistInput).toHaveValue("Daft Punk & Pharrell");
    await page.keyboard.press("Enter");

    await expect(artistInput).not.toBeVisible();
    await expect(artistCellButton).toHaveText("Daft Punk & Pharrell");
  });
});
