import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
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
}
