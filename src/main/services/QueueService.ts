import { SlskdClient } from './SlskdClient'
import { store } from '../store'
import { Track, DownloadItem, SlskdFile } from '../../shared/types'
import { MatchMaker } from './MatchMaker'
import log from '../utils/logger'

export class QueueService {
    private slskdClient: SlskdClient
    private queue: Map<string, DownloadItem> = new Map()
    private matchMaker: MatchMaker

    constructor(slskdClient: SlskdClient) {
        this.slskdClient = slskdClient

        // Load priority from store if exists
        const storedPriority = store.get('preferences.formatPriority') as string[]
        this.matchMaker = new MatchMaker(storedPriority || ['aiff', 'wav', 'flac', 'mp3'])

        // Start monitoring loop
        setInterval(() => this.monitorQueue(), 2000)
    }

    setFormatPriority(formats: string[]) {
        this.matchMaker.updateFormatPriority(formats)
        store.set('preferences.formatPriority', formats)
        log.info('[QueueService] Format priority updated:', formats)
    }

    getFormatPriority(): string[] {
        return (store.get('preferences.formatPriority') as string[]) || ['aiff', 'wav', 'flac', 'mp3']
    }

    async processPlaylist(tracks: Track[]) {
        log.info(`[QueueService] Processing playlist with ${tracks.length} tracks`)
        // In a real scenario, we might want to let the user select tracks first.
        // This method assumes we received a list of tracks to queue (e.g. from the Review Page)

        for (const track of tracks) {
            this.addToQueue(track)
        }

        // Start processing background job
        this.processQueue()
    }

    private addToQueue(track: Track) {
        if (this.queue.has(track.id)) return // Already in queue

        const item: DownloadItem = {
            id: track.id,
            track,
            status: 'pending',
            progress: 0
        }
        this.queue.set(track.id, item)
        this.emitQueueUpdate()
    }

    async cancel(id: string) {
        const item = this.queue.get(id)
        if (item) {
            if (item.status === 'downloading' || item.status === 'queued') {
                if (item.username && item.transferId) {
                    try {
                        await this.slskdClient.cancelDownload(item.username, item.transferId)
                        log.info(`[QueueService] Remote download cancelled: ${item.transferId}`)
                    } catch (e) {
                        log.warn(`[QueueService] Failed to cancel remote download (might already be gone): ${e}`)
                    }
                }
            }
            this.queue.delete(id)
            this.emitQueueUpdate()
            log.info(`[QueueService] Cancelled processing for: ${id}`)
        }
    }

    async clear() {
        for (const item of this.queue.values()) {
            if (item.username && item.transferId) {
                try {
                    await this.slskdClient.cancelDownload(item.username, item.transferId)
                } catch (e) {
                    // ignore — transfer might already be gone
                }
            }
        }
        this.queue.clear()
        this.emitQueueUpdate()
        log.info('[QueueService] Queue cleared and all downloads cancelled')
    }

    private emitQueueUpdate() {
        // Broadcast queue state to all windows
        const { BrowserWindow } = require('electron')
        const windows = BrowserWindow.getAllWindows()
        const queueArray = Array.from(this.queue.values())
        windows.forEach((win: any) => {
            win.webContents.send('queue:update', queueArray)
        })
    }

    private async processQueue() {
        // Parallel Processing
        // We grab all 'pending' items and start them.
        // In a real app, you'd want a concurrency limit (e.g., p-limit) to avoid flooding.
        // For now, let's process batches or just all (users rarely queue 1000s at once in this MVP).

        const pendingItems = Array.from(this.queue.values()).filter(i => i.status === 'pending')

        if (pendingItems.length === 0) return

        log.info(`[QueueService] Starting processing for ${pendingItems.length} items...`)

        // Sequential Processing to avoid 429 Too Many Requests
        // We process items one by one with a delay to respect Soulseek rate limits.

        for (const item of pendingItems) {
            // Double check status in case it changed (e.g. cancelled)
            if (this.queue.get(item.id)?.status !== 'pending') continue

            await this.searchAndDownload(item)

            // Wait 2.5s between requests to be kind to the API
            await new Promise(resolve => setTimeout(resolve, 2500))
        }
    }

    private async searchAndDownload(item: DownloadItem) {
        item.status = 'searching'
        this.emitQueueUpdate()
        log.info(`[QueueService] Searching for: ${item.track.name} - ${item.track.artists[0].name}`)

        const query = `${item.track.artists[0].name} ${item.track.name}`
        try {
            const searchInit = await this.slskdClient.search(query)
            log.info(`[QueueService] Search initiated: ${searchInit.id}`)

            // Poll for results
            let attempts = 0
            const maxAttempts = 30 // 30 * 1s = 30s timeout
            let bestMatch: SlskdFile | null = null

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000))
                attempts++

                const searchState = await this.slskdClient.getSearchResults(searchInit.id)

                // Try to find a match continuously as results come in
                if (searchState.responses && searchState.responses.length > 0) {
                    // Flatten responses to files
                    // Note: API uses camelCase (files, username) but DB uses PascalCase (Files, Username)
                    const allFiles = searchState.responses.flatMap((r: any) => {
                        const files = r.files || r.Files || []
                        return files.map((f: any) => ({
                            ...f,
                            filename: f.Filename || f.filename,
                            bitRate: f.BitRate || f.bitRate,
                            size: f.Size || f.size,
                            username: r.Username || r.username,
                            speed: r.UploadSpeed || r.uploadSpeed,
                            slotsFree: r.HasFreeUploadSlot || r.hasFreeSlots,
                            queueLength: r.QueueLength || r.queueLength
                        }))
                    })

                    console.log(`[QueueService] Flattened ${allFiles.length} files from ${searchState.responses.length} responses`)
                    if (allFiles.length > 0) {
                        console.log(`[QueueService] Sample file structure:`, JSON.stringify(allFiles[0], null, 2))
                    }

                    bestMatch = this.matchMaker.findBestMatch(item.track, allFiles)
                    if (bestMatch) {
                        console.log(`[QueueService] Found match: ${bestMatch.filename} from ${bestMatch.username}`)
                        break
                    }
                }

                if (searchState.state === 'Completed' || searchState.isComplete) {
                    break
                }
            }

            if (bestMatch) {
                item.status = 'downloading'
                item.filename = bestMatch.filename
                item.username = bestMatch.username
                this.emitQueueUpdate()

                try {
                    // response is usually array of queued files or a status object
                    const response = await this.slskdClient.download(bestMatch.username, bestMatch.filename, bestMatch.size)

                    // Ideally capture the Transfer ID here. 
                    // Based on logs, it might be in the response. Assuming response[0].id or response.id
                    // If unpredictable, the monitor loop will pick it up by filename matching if needed.
                    if (Array.isArray(response) && response.length > 0) {
                        item.transferId = response[0].id || response[0].Id
                    } else if (response && (response.id || response.Id)) {
                        item.transferId = response.id || response.Id
                    }
                    log.info(`[QueueService] Download started for ${item.id} (Transfer ID: ${item.transferId})`)
                } catch (e) {
                    log.error('[QueueService] Failed to send download command:', e)
                    item.status = 'failed'
                    item.error = 'Download command failed'
                    this.emitQueueUpdate()
                }

            } else {
                log.info(`[QueueService] No match found for ${item.track.name}`)
                item.status = 'failed'
                item.error = 'No match found'
                this.emitQueueUpdate()
            }

        } catch (error) {
            log.error('[QueueService] Process failed:', error)
            item.status = 'failed'
            this.emitQueueUpdate()
        }
    }

    // Logic moved to MatchMaker.ts

    private async monitorQueue() {
        const activeDownloads = Array.from(this.queue.values()).filter(i => i.status === 'downloading' || i.status === 'queued')
        if (activeDownloads.length === 0) return

        try {
            const transfers = await this.slskdClient.getDownloads()
            // transfers structure: Array of { username: string, directories: Array<{ files: Array<File> }> }

            for (const item of activeDownloads) {
                if (!item.username || !item.filename) continue

                let remoteFile: SlskdFile | null = null

                // Traverse transfers to find file
                for (const userTransfer of transfers) {
                    if (userTransfer.username !== item.username && userTransfer.Username !== item.username) continue

                    const dirs = userTransfer.directories || userTransfer.Directories || []
                    for (const dir of dirs) {
                        const files = dir.files || dir.Files || []
                        for (const file of files) {
                            if (file.filename === item.filename || file.Filename === item.filename || (item.transferId && (file.id === item.transferId || file.Id === item.transferId))) {
                                remoteFile = file
                                break
                            }
                        }
                        if (remoteFile) break
                    }
                    if (remoteFile) break
                }

                if (remoteFile) {
                    // Update state
                    const state = remoteFile.state
                    const bytesTransferred = remoteFile.bytesTransferred || 0
                    const size = remoteFile.size || 1

                    item.progress = Math.min(100, Math.floor((bytesTransferred / size) * 100))

                    if (state === 'Completed' || state === 'Succeeded') {
                        item.status = 'completed'
                        item.progress = 100
                    } else if (state === 'Aborted' || state === 'Errored' || state === 'Cancelled') {
                        item.status = 'failed'
                        item.error = state
                    } else if (state === 'Queued') {
                        item.status = 'queued'
                    } else if (state === 'InProgress' || state === 'Initializing') {
                        item.status = 'downloading'
                    }

                    if (!item.transferId && remoteFile.id) {
                        item.transferId = remoteFile.id
                    }

                    this.emitQueueUpdate()
                }
            }

        } catch (e) {
            log.error('[QueueService] Monitor failed:', e)
        }
    }
}
