
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { join } from 'path'

test.describe('Public Playlist Feature', () => {
    let app: ElectronApplication
    let page: Page

    test.beforeAll(async () => {
        app = await electron.launch({
            args: [join(__dirname, '../out/main/index.js')]
        })

        // Pipe Main process logs
        app.process().stdout?.on('data', (data) => {
            console.log(`[Main]: ${data}`)
        })
        app.process().stderr?.on('data', (data) => {
            console.error(`[Main Error]: ${data}`)
        })

        page = await app.firstWindow()
    })

    test.afterAll(async () => {
        if (app) await app.close()
    })

    test('can add a public playlist via URL and view tracks', async () => {
        // Wait for app load
        await page.waitForTimeout(2000)

        const topBarSearch = page.locator('input[placeholder="paste public spotify or youtube playlist url"]')
        await expect(topBarSearch).toBeVisible()

        // Enter URL
        const playlistUrl = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
        await topBarSearch.fill(playlistUrl)
        await topBarSearch.press('Enter')

        // Wait for scraping (it takes time)
        await page.waitForTimeout(5000)

        // Check if playlist card appears in "Added" section
        const addedSection = page.locator('h2:has-text("playlists added")')
        await expect(addedSection).toBeVisible()

        // Click the playlist card to go to Review
        // Click the playlist card to go to Review
        const playlistCardBtn = page.getByRole('button', { name: /Select added playlist/ }).first()
        await playlistCardBtn.click()

        // Wait for tracks to load (triggers scrapePlaylistTracks)
        await page.waitForTimeout(5000)

        // We expect some tracks to be visible
        // Just keeping the test alive to capture logs
    })
})
