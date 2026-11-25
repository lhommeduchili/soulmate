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

test.describe("DJ Setlist Batch Import & Queue Pipeline (E2E)", () => {
  let app: ElectronApplication;
  let page: Page;
  let userDataDir: string;
  let tempCsvPath: string;

  test.beforeAll(async () => {
    userDataDir = mkdtempSync(join(tmpdir(), "soulmate-e2e-setlist-"));

    // Pre-configure English locale for consistent assertions
    writeFileSync(
      join(userDataDir, "config.json"),
      JSON.stringify({
        preferences: {
          downloadPath: "",
          formatPriority: ["aiff", "wav", "flac", "mp3"],
          locale: "en",
          region: "CL",
          autoQueryCascade: true,
        },
      }),
    );

    // Create a temporary Rekordbox-style history CSV export file
    tempCsvPath = join(userDataDir, "rekordbox_history.csv");
    writeFileSync(
      tempCsvPath,
      "#\tTrack Title\tArtist\tAlbum\n1\tEnergy Flash\tJoey Beltram\tClassics\n2\tAge of Love\tAge of Love\tThe Age of Love\n",
      "utf-8",
    );

    app = await electron.launch({
      args: [join(__dirname, "../out/main/index.js")],
      env: {
        ...process.env,
        TEST_USER_DATA_DIR: userDataDir,
      },
    });

    // Pipe Main process logs for debugging
    app.process().stdout?.on("data", (data) => {
      console.log(`[Main]: ${data}`);
    });
    app.process().stderr?.on("data", (data) => {
      console.error(`[Main Error]: ${data}`);
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

  test("imports setlist via plaintext paste, hydrates review table, and queues downloads", async () => {
    // 1. Ensure homepage is loaded
    const trigger = page.locator('[data-testid="import-setlist-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 15000 });

    // 2. Open Setlist Import Modal
    await trigger.click();
    const modal = page.locator('[data-testid="setlist-import-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 3. Enter custom setlist name
    const nameInput = page.locator('[data-testid="setlist-name-input"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Summer Fest 2026");

    // 4. Paste setlist lines into raw textarea
    const rawInput = page.locator('[data-testid="setlist-paste-textarea"]');
    await expect(rawInput).toBeVisible();
    const rawSetlist = [
      "01. Bicep - Glue",
      "02. Overmono - So U Kno",
      "[00:10:45] Four Tet - Baby",
    ].join("\n");
    await rawInput.fill(rawSetlist);

    // 5. Verify real-time detected track count
    const trackCount = page.locator('[data-testid="setlist-track-count"]');
    await expect(trackCount).toBeVisible();
    await expect(trackCount).toContainText(/3 tracks detected/i);

    // 6. Submit setlist
    const submitBtn = page.locator('[data-testid="setlist-submit-btn"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 7. Assert modal closes and navigates to review page
    await expect(modal).not.toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/.*\/review\/setlist\/.*/, { timeout: 10000 });

    // 8. Assert review table loads parsed tracks
    const trackTable = page.locator("table");
    await expect(trackTable).toBeVisible({ timeout: 15000 });

    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    expect(await rows.count()).toBe(3);

    // Verify row contents
    await expect(rows.nth(0)).toContainText("Glue");
    await expect(rows.nth(0)).toContainText("Bicep");

    await expect(rows.nth(1)).toContainText("So U Kno");
    await expect(rows.nth(1)).toContainText("Overmono");

    await expect(rows.nth(2)).toContainText("Baby");
    await expect(rows.nth(2)).toContainText("Four Tet");

    // 9. Download selected tracks to queue
    const downloadBtn = page.getByRole("button", {
      name: /download.*selected/i,
    });
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();
    await downloadBtn.click();

    // 10. Assert sidebar queue receives items
    const queueItems = page.locator('aside div[role="listitem"]');
    await expect(queueItems.first()).toBeVisible({ timeout: 10000 });
    expect(await queueItems.count()).toBeGreaterThan(0);
  });

  test("imports setlist via CSV file drop/upload and hydrates review table", async () => {
    // 1. Navigate back to Home if on review page
    if (page.url().includes("/review/")) {
      const homeBtn = page.locator('[data-testid="topbar-home-button"]');
      await expect(homeBtn).toBeEnabled({ timeout: 10000 });
      await homeBtn.click();
    }

    const trigger = page.locator('[data-testid="import-setlist-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 15000 });

    // 2. Open Setlist Import Modal
    await trigger.click();
    const modal = page.locator('[data-testid="setlist-import-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 3. Switch to File Upload tab
    const fileTab = page.locator('[data-testid="setlist-tab-file"]');
    await fileTab.click();

    // 4. Set input files on file drop input
    const fileInput = page.locator('[data-testid="setlist-file-input"]');
    await fileInput.setInputFiles(tempCsvPath);

    // 5. Verify real-time detected track count
    const trackCount = page.locator('[data-testid="setlist-track-count"]');
    await expect(trackCount).toBeVisible();
    await expect(trackCount).toContainText(/2 tracks detected/i);

    // 6. Submit setlist
    const submitBtn = page.locator('[data-testid="setlist-submit-btn"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 7. Assert modal closes and navigates to review page
    await expect(modal).not.toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/.*\/review\/setlist\/.*/, { timeout: 10000 });

    // 8. Assert review table loads parsed tracks from CSV
    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 15000 });
    expect(await rows.count()).toBe(2);

    await expect(rows.nth(0)).toContainText("Energy Flash");
    await expect(rows.nth(0)).toContainText("Joey Beltram");

    await expect(rows.nth(1)).toContainText("Age of Love");
  });

  test("supports accessible keyboard dismiss and restores focus to trigger", async () => {
    // 1. Navigate back to Home if on review page
    if (page.url().includes("/review/")) {
      const homeBtn = page.locator('[data-testid="topbar-home-button"]');
      await expect(homeBtn).toBeEnabled({ timeout: 10000 });
      await homeBtn.click();
    }

    const trigger = page.locator('[data-testid="import-setlist-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 15000 });

    // 2. Open modal via trigger
    await trigger.click();
    const modal = page.locator('[data-testid="setlist-import-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 3. Press Escape to dismiss
    await page.keyboard.press("Escape");

    // 4. Verify modal is closed and trigger has focus restored
    await expect(modal).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
});
