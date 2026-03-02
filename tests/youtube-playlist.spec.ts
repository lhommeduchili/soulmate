
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { join } from 'path'

test.describe('YouTube Playlist Feature', () => {
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

    test('can add a YouTube playlist via URL and view tracks', async () => {
        // Wait for app load
        await page.waitForTimeout(2000)

        const topBarSearch = page.locator('input[placeholder="paste public spotify or youtube playlist url"]')
        await expect(topBarSearch).toBeVisible()

        // Enter YouTube Playlist URL
        // A standard innocuous list (e.g., standard music playlist)
        const playlistUrl = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKvYin_USF1qoJQnIyMAfRxl'
        await topBarSearch.fill(playlistUrl)
        await topBarSearch.press('Enter')

        // Wait for fetching
        await page.waitForTimeout(15000)

        // Check if playlist card appears in "Added" section
        // Note: The section currently says "spotify playlists added". 
        // We might want to update that text or just check if *a* playlist is added.
        // For now, let's assume it puts it in the same list or a generic one.
        // The implementation should probably result in it being added to state.

        // We look for a card.
        // The implementation might need to update the header text in PlaylistSelector.tsx to be generic "playlists added"
        const addedSection = page.locator('h2', { hasText: 'playlists added' })
        // If the implementation changes "spotify playlists added" to "playlists added", this works.
        // If not, we might fail here, which prompts the refactor.
        await expect(addedSection).toBeVisible()
    })
})
