import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, resolve } from 'path'
import { store } from './store'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { SlskdService } from './services/SlskdService'
import { SpotifyService } from './services/SpotifyService'

import { SlskdClient } from './services/SlskdClient'
import { QueueService } from './services/QueueService'
import { YoutubeService } from './services/YoutubeService'
import { z } from 'zod'
import log from './utils/logger'

// Zod Schemas for IPC Safety
const StringQuerySchema = z.string().min(1)
const FormatsSchema = z.array(z.string().min(2))
const TrackSchema = z.object({
    id: z.string(),
    name: z.string(),
    artists: z.array(z.object({ name: z.string() })),
    album: z.object({ name: z.string() }).optional(),
    duration_ms: z.number().optional(),
    image: z.string().optional(),
    is_youtube: z.boolean().optional()
})
const TracksArraySchema = z.array(TrackSchema)

// Set app name specifically for macOS Dock
if (process.platform === 'darwin') {
    app.setName('soulmate')
    try {
        const iconPath = join(__dirname, '../../build/icon.png')
        app.dock.setIcon(iconPath)
    } catch {
        // Ignored in case icon is missing
    }
}

const slskdService = new SlskdService()
const spotifyService = new SpotifyService()
const slskdClient = new SlskdClient()
const queueService = new QueueService(slskdClient)
const youtubeService = new YoutubeService()

function createWindow(): void {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 950,
        minHeight: 600,
        show: false,
        autoHideMenuBar: true,
        title: 'soulmate',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            nodeIntegration: false,
            contextIsolation: true
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    // Protocol Handler (Deep Linking)
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient('soulmate', process.execPath, [resolve(process.argv[1])])
        }
    } else {
        app.setAsDefaultProtocolClient('soulmate')
    }

    // Handle Deep Link on already running instance (Windows)
    const gotTheLock = app.requestSingleInstanceLock()
    if (!gotTheLock) {
        app.quit()
    } else {
        app.on('second-instance', (_, argv) => {
            if (process.platform === 'win32') {
                // Keep only command line / deep linked arguments
                // expected soulmate://callback?code=...
                const url = argv.find((arg) => arg.startsWith('soulmate://'))
                if (url) {
                    spotifyService.handleCallback(url).catch(err => {
                        log.error('[Main] Deep link error:', err)
                    })
                }
            }
        })
    }

    // Handle Deep Link (macOS)
    app.on('open-url', (_, url) => {
        spotifyService.handleCallback(url).catch(err => {
            log.error('[Main] Deep link error:', err)
        })
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// Register IPC handlers once (outside createWindow to prevent duplicate registration)
function registerIPCHandlers(): void {
    // IPC Handlers - Spotify
    ipcMain.handle('spotify:login', async () => {
        const success = await spotifyService.login()
        if (success) {
            BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('spotify:connected')
            })
        }
    })
    ipcMain.handle('spotify:status', () => spotifyService.isAuthenticated())
    ipcMain.handle('spotify:playlists', () => spotifyService.getPlaylists())
    ipcMain.handle('spotify:search', (_, query) => {
        const q = StringQuerySchema.parse(query)
        return spotifyService.searchPlaylists(q)
    })
    ipcMain.handle('spotify:tracks', (_, playlistId) => {
        const id = StringQuerySchema.parse(playlistId)
        return spotifyService.getPlaylistTracks(id)
    })
    ipcMain.handle('spotify:getPlaylist', (_, url) => {
        const parsedUrl = StringQuerySchema.parse(url)
        return spotifyService.getPlaylist(parsedUrl)
    })
    ipcMain.handle('spotify:logout', () => spotifyService.logout())

    // IPC Handlers - YouTube
    ipcMain.handle('youtube:getPlaylist', (_, url) => {
        const parsedUrl = StringQuerySchema.parse(url)
        return youtubeService.getPlaylist(parsedUrl)
    })
    ipcMain.handle('youtube:tracks', (_, id) => {
        const parsedId = StringQuerySchema.parse(id)
        return youtubeService.getPlaylistTracks(parsedId)
    })

    // Slskd IPC
    ipcMain.handle('slskd:search', (_, query) => {
        const q = StringQuerySchema.parse(query)
        return slskdClient.search(q)
    })
    ipcMain.handle('slskd:status', () => slskdClient.getSoulseekConnectionState())

    // Queue IPC
    ipcMain.handle('queue:start', (_, tracks) => {
        const parsedTracks = TracksArraySchema.parse(tracks) as any[]
        return queueService.processPlaylist(parsedTracks)
    })
    ipcMain.handle('queue:set-priority', (_, formats) => {
        const parsedFormats = FormatsSchema.parse(formats)
        return queueService.setFormatPriority(parsedFormats)
    })
    ipcMain.handle('queue:get-priority', () => queueService.getFormatPriority())
    ipcMain.handle('queue:cancel', (_, id) => {
        const parsedId = StringQuerySchema.parse(id)
        return queueService.cancel(parsedId)
    })
    ipcMain.handle('queue:clear', () => queueService.clear())

    // Settings IPC
    ipcMain.handle('settings:select-directory', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
        })
        if (!canceled && filePaths.length > 0) {
            const path = filePaths[0]
            store.set('preferences.downloadPath', path)
            return path
        }
        return null
    })

    ipcMain.handle('settings:get-download-dir', () => {
        return store.get('preferences.downloadPath') || join(app.getPath('downloads'), 'Soulmate')
    })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.soulmate')

    // Start Slskd (Now async)
    slskdService.start().then(() => {
        const config = slskdService.getApiConfig()
        slskdClient.configure(config.port, config.apiKey)
        log.info('[Main] Slskd Client Configured')
    }).catch(err => {
        log.error('[Main] Failed to start SlskdService:', err)
    })

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // Register IPC handlers once before creating any windows
    registerIPCHandlers()

    createWindow()

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('before-quit', () => {
    slskdService.stop()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// Handle process termination signals
process.on('SIGTERM', () => {
    log.info('[Main] SIGTERM received. Quitting...')
    app.quit()
})

process.on('SIGINT', () => {
    log.info('[Main] SIGINT received. Quitting...')
    app.quit()
})
