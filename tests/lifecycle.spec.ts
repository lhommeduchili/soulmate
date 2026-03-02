import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { join } from 'path'

test.describe('Lifecycle', () => {
    let app: ElectronApplication
    let page: Page

    test.beforeAll(async () => {
        app = await electron.launch({
            args: [join(__dirname, '../out/main/index.js')]
        })
        page = await app.firstWindow()
    })

    test.afterAll(async () => {
        await app.close()
    })

    test('app launches and starts slskd', async () => {
        const title = await page.title()
        expect(title).toBe('soulmate')

        // Verify slskd is running
        const { execSync } = require('child_process')
        // Give it a moment to spawn
        await page.waitForTimeout(2000)

        let psOutput = execSync('ps -A').toString()
        expect(psOutput).toContain('slskd')

        // Verify it dies on close
        await app.close()
        await new Promise(resolve => setTimeout(resolve, 2000))

        psOutput = execSync('ps -A').toString()
        // Ensure our dummy resource is not running
        expect(psOutput).not.toContain('resources/slskd')
    })
})
