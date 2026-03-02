import { net, app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import log from '../utils/logger'
import { AppError } from '../utils/AppError'

interface DbSearchRow {
    ResponsesJson: string;
}

export class SlskdClient {
    private port: number = 0
    private apiKey: string = ''
    private dbPath: string = ''

    constructor() {
        const userDataPath = app.getPath('userData')
        this.dbPath = join(userDataPath, 'data', 'search.db')
    }

    configure(port: number, apiKey: string) {
        this.port = port
        this.apiKey = apiKey
    }

    private async request(path: string, method: string = 'GET', body?: any): Promise<any> {
        if (!this.port || !this.apiKey) {
            throw new AppError('SLSKD_NOT_CONFIGURED', 'SlskdClient not configured')
        }

        const url = `http://localhost:${this.port}/api/v0${path}`
        // console.log(`[SlskdClient] Requesting ${method} ${url}`)

        const response = await net.fetch(url, {
            method,
            headers: {
                'X-API-Key': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        })

        if (!response.ok) {
            throw new AppError('SLSKD_API_ERROR', `Slskd API Error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    async getSoulseekConnectionState(): Promise<any> {
        return this.request('/application')
    }

    async search(query: string): Promise<any> {
        return this.request('/searches', 'POST', { searchText: query })
    }

    async getSearchResults(id: string): Promise<any> {
        // First try API (metadata)
        const apiData = await this.request(`/searches/${id}`)

        // If API returns no responses but has files, check DB
        if ((!apiData.responses || apiData.responses.length === 0) && apiData.fileCount > 0) {
            log.info(`[SlskdClient] API returned empty responses for ${id} (${apiData.fileCount} files). Checking DB...`)
            const dbResults = this.getSearchResultsFromDb(id)
            if (dbResults) {
                log.info(`[SlskdClient] DB returned ${dbResults.length} responses`)
                log.debug(`[SlskdClient] Sample DB response structure:`, JSON.stringify(dbResults[0], null, 2))
                apiData.responses = dbResults
            } else {
                log.info(`[SlskdClient] DB returned null`)
            }
        }
        return apiData
    }

    private getSearchResultsFromDb(searchId: string): any[] | null {
        try {
            // Open DB in readonly mode logic
            // Note: In production better-sqlite3 must be available. 
            // If the file doesn't exist yet (fresh install), return null.
            const db = new Database(this.dbPath, { readonly: true, fileMustExist: true })

            const stmt = db.prepare('SELECT ResponsesJson FROM Searches WHERE Id = ?')
            const row = stmt.get(searchId.toUpperCase()) as DbSearchRow | undefined

            db.close()

            if (row && row.ResponsesJson) {
                return JSON.parse(row.ResponsesJson)
            }
        } catch (error: any) {
            // Ignore file not found errors which happen on fresh start
            if (error.code !== 'SQLITE_CANTOPEN') {
                log.error('[SlskdClient] DB Read Error:', error)
            }
        }
        return null
    }

    async download(username: string, filename: string, size: number): Promise<any> {
        return this.request(`/transfers/downloads/${username}`, 'POST', [{ filename, size }])
    }

    async getDownloads(): Promise<any[]> {
        return this.request('/transfers/downloads')
    }

    async cancelDownload(username: string, itemId: string): Promise<any> {
        // DELETE /api/v0/transfers/downloads/{username}/{itemId}
        return this.request(`/transfers/downloads/${username}/${itemId}`, 'DELETE')
    }
}
