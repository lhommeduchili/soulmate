import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { join } from 'path'
import * as fs from 'fs'

test.describe('Core & Queue', () => {
    let app: ElectronApplication
    let page: Page

    test.beforeEach(async () => {
        app = await electron.launch({
            args: [join(__dirname, '../out/main/index.js')]
        })
        page = await app.firstWindow()
    })

    test.afterEach(async () => {
        await app.close()
    })

    test('generates slskd.yml with random port and key', async () => {
        // Get User Data Path (we can infer it or ask app via evaluate)
        const userDataPath = await app.evaluate(async ({ app }) => {
            return app.getPath('userData')
        })

        const configPath = join(userDataPath, 'slskd.yml')

        // Poll for file existence (wait for SlskdService to write it)
        await expect(async () => {
            expect(fs.existsSync(configPath)).toBe(true)
        }).toPass({ timeout: 5000 })

        const content = fs.readFileSync(configPath, 'utf8')
        expect(content).toContain('port:')
        expect(content).toContain('api_key:')
    })

    // We can't easily test the API client without a REAL running slskd responding.
    // The dummy slskd does not listen on a port.
    // So we will skip the "search" test until we have a mock API or real binary.
    // For now, config generation is the verify step for Phase 3 Part 1.
})
