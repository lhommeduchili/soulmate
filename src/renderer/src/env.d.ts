/// <reference types="vite/client" />

interface ElectronAPI {
    // Add specific Electron methods if needed, mostly handled by @electron-toolkit/preload
}

interface Window {
    electron: ElectronAPI
    api: {
        spotify: {
            login: () => Promise<void>
            logout: () => Promise<void>
            getPlaylists: () => Promise<any[]>
            search: (query: string) => Promise<any[]>
            status: () => Promise<boolean>
            getPlaylist: (url: string) => Promise<any>
            getTracks: (playlistId: string) => Promise<any[]>
            onConnected: (callback: () => void) => () => void
        }
        youtube: {
            getPlaylist: (url: string) => Promise<any>
            getTracks: (playlistId: string) => Promise<any[]>
        }
        slskd: {
            search: (query: string) => Promise<any>
            status: () => Promise<any>
        }
        queue: {
            start: (tracks: any[]) => Promise<void>
            setPriority: (formats: string[]) => Promise<void>
            getPriority: () => Promise<string[]>
            cancel: (id: string) => Promise<void>
            clear: () => Promise<void>
            onUpdate: (callback: (queue: any[]) => void) => () => void
        }
        settings: {
            selectDirectory: () => Promise<string | null>
            getDownloadDir: () => Promise<string>
        }
    }
}
