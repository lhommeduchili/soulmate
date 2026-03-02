import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
    spotify: {
        login: () => ipcRenderer.invoke('spotify:login'),
        logout: () => ipcRenderer.invoke('spotify:logout'),
        getPlaylists: () => ipcRenderer.invoke('spotify:playlists'),
        search: (query: string) => ipcRenderer.invoke('spotify:search', query),
        status: () => ipcRenderer.invoke('spotify:status'),
        getPlaylist: (url: string) => ipcRenderer.invoke('spotify:getPlaylist', url),
        getTracks: (playlistId: string) => ipcRenderer.invoke('spotify:tracks', playlistId),
        onConnected: (callback: () => void) => {
            const subscription = (_: any, ..._args: any[]) => callback()
            ipcRenderer.on('spotify:connected', subscription)
            return () => {
                ipcRenderer.removeListener('spotify:connected', subscription)
            }
        }
    },
    youtube: {
        getPlaylist: (url: string) => ipcRenderer.invoke('youtube:getPlaylist', url),
        getTracks: (playlistId: string) => ipcRenderer.invoke('youtube:tracks', playlistId)
    },
    slskd: {
        search: (query: string) => ipcRenderer.invoke('slskd:search', query),
        status: () => ipcRenderer.invoke('slskd:status')
    },
    queue: {
        start: (tracks: any[]) => ipcRenderer.invoke('queue:start', tracks),
        setPriority: (formats: string[]) => ipcRenderer.invoke('queue:set-priority', formats),
        getPriority: () => ipcRenderer.invoke('queue:get-priority'),
        cancel: (id: string) => ipcRenderer.invoke('queue:cancel', id),
        clear: () => ipcRenderer.invoke('queue:clear'),
        onUpdate: (callback: (queue: any[]) => void) => {
            const subscription = (_: any, queue: any[]) => callback(queue)
            ipcRenderer.on('queue:update', subscription)
            return () => {
                ipcRenderer.removeListener('queue:update', subscription)
            }
        }
    },
    settings: {
        selectDirectory: () => ipcRenderer.invoke('settings:select-directory'),
        getDownloadDir: () => ipcRenderer.invoke('settings:get-download-dir')
    }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('api', api)
    } catch (error) {
        console.error(error)
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI
    // @ts-ignore (define in dts)
    window.api = api
}
