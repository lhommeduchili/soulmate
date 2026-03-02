
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { join } from 'path'

test.describe('Guest Mode UI', () => {
    let app: ElectronApplication
    let page: Page

    test.beforeAll(async () => {
        app = await electron.launch({
            args: [join(__dirname, '../out/main/index.js')]
        })
        page = await app.firstWindow()
    })

    test.afterAll(async () => {
        if (app) await app.close()
    })

    test('launches directly to playlists/dashboard view', async () => {
        // Wait for app to load
        await page.waitForTimeout(2000)

        // Title should be soulmate
        const title = await page.title()
        expect(title).toBe('soulmate')

        // Should NOT see the full screen login page title
        // Should NOT see the full screen login page title
        // loginTitle removed as it's ambiguous now

        // Let's check for the specific "without music, life would be a mistake" quote which is only on login
        const loginQuote = page.locator('text="without music, life would be a mistake"')
        await expect(loginQuote).not.toBeVisible()

        // Should see the Sidebar header
        const sidebarHeader = page.locator('div:has-text("soulmate")').first()
        await expect(sidebarHeader).toBeVisible()
    })

    test('shows CONNECT SPOTIFY button in playlist area when logged out', async () => {
        // We look for the "CONNECT SPOTIFY" button in the main area (PlaylistSelector)
        // The button text was specifically requested to be "CONNECT SPOTIFY"
        const connectBtn = page.locator('button:has-text("CONNECT SPOTIFY")')
        await expect(connectBtn).toBeVisible()
    })
})
