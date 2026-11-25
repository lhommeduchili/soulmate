import { contextBridge, ipcRenderer } from "electron";
import { AppPreferences } from "../shared/preferences";
import { DownloadItem, Track } from "../shared/types";

// Custom APIs for renderer
const api = {
  spotify: {
    login: () => ipcRenderer.invoke("spotify:login"),
    logout: () => ipcRenderer.invoke("spotify:logout"),
    getPlaylists: () => ipcRenderer.invoke("spotify:playlists"),
    search: (query: string) => ipcRenderer.invoke("spotify:search", query),
    status: () => ipcRenderer.invoke("spotify:status"),
    getPlaylist: (url: string) =>
      ipcRenderer.invoke("spotify:getPlaylist", url),
    getTracks: (playlistId: string) =>
      ipcRenderer.invoke("spotify:tracks", playlistId),
    onConnected: (callback: () => void) => {
      const subscription = (_: unknown, ..._args: unknown[]) => callback();
      ipcRenderer.on("spotify:connected", subscription);
      return () => {
        ipcRenderer.removeListener("spotify:connected", subscription);
      };
    },
  },
  youtube: {
    getPlaylist: (url: string) =>
      ipcRenderer.invoke("youtube:getPlaylist", url),
    getTracks: (playlistId: string) =>
      ipcRenderer.invoke("youtube:tracks", playlistId),
  },
  soundcloud: {
    getPlaylist: (url: string) =>
      ipcRenderer.invoke("soundcloud:getPlaylist", url),
    getTracks: (playlistId: string) =>
      ipcRenderer.invoke("soundcloud:tracks", playlistId),
  },
  bandcamp: {
    getPlaylist: (url: string) =>
      ipcRenderer.invoke("bandcamp:getPlaylist", url),
    getTracks: (playlistId: string) =>
      ipcRenderer.invoke("bandcamp:tracks", playlistId),
  },
  slskd: {
    search: (query: string) => ipcRenderer.invoke("slskd:search", query),
    status: () => ipcRenderer.invoke("slskd:status"),
  },
  queue: {
    start: (payload: Track[] | { tracks: Track[]; playlistName?: string }) =>
      ipcRenderer.invoke("queue:start", payload),
    exportPlaylist: (payload: {
      playlistName: string;
      tracks?: Track[];
      reveal?: boolean;
    }) => ipcRenderer.invoke("queue:export-playlist", payload),
    setPriority: (formats: string[]) =>
      ipcRenderer.invoke("queue:set-priority", formats),
    getPriority: () => ipcRenderer.invoke("queue:get-priority"),
    cancel: (id: string) => ipcRenderer.invoke("queue:cancel", id),
    retry: (id: string) => ipcRenderer.invoke("queue:retry", id),
    retryWithQuery: (payload: { id: string; customQuery: string }) =>
      ipcRenderer.invoke("queue:retry-with-query", payload),
    searchSources: (payload: { id: string; query?: string }) =>
      ipcRenderer.invoke("queue:search-sources", payload),
    selectSource: (payload: {
      id: string;
      username: string;
      filename: string;
      size?: number;
      bitRate?: number;
    }) => ipcRenderer.invoke("queue:select-source", payload),
    clear: () => ipcRenderer.invoke("queue:clear"),
    get: () => ipcRenderer.invoke("queue:get"),
    pauseAll: () => ipcRenderer.invoke("queue:pause-all"),
    resumeAll: () => ipcRenderer.invoke("queue:resume-all"),
    clearCompleted: () => ipcRenderer.invoke("queue:clear-completed"),
    openFolder: (filePath?: string) =>
      ipcRenderer.invoke("queue:open-folder", filePath),
    onUpdate: (callback: (queue: DownloadItem[]) => void) => {
      const subscription = (_event: unknown, queue: DownloadItem[]) =>
        callback(queue);
      ipcRenderer.on("queue:update", subscription);
      return () => {
        ipcRenderer.removeListener("queue:update", subscription);
      };
    },
  },
  media: {
    getPreviewUrl: (filePath: string) =>
      `soulmate-media://stream?path=${encodeURIComponent(filePath)}`,
  },
  crate: {
    exportRekordbox: (payload: {
      playlistName: string;
      tracks?: Track[];
      reveal?: boolean;
      fileName?: string;
    }) => ipcRenderer.invoke("crate:export-rekordbox", payload),
    exportSerato: (payload: {
      playlistName: string;
      tracks?: Track[];
      reveal?: boolean;
      fileName?: string;
    }) => ipcRenderer.invoke("crate:export-serato", payload),
    exportTraktor: (payload: {
      playlistName: string;
      tracks?: Track[];
      reveal?: boolean;
      fileName?: string;
    }) => ipcRenderer.invoke("crate:export-traktor", payload),
  },
  library: {
    checkTracks: (tracks: Track[]) =>
      ipcRenderer.invoke("library:check-tracks", tracks),
  },

  setlist: {
    parse: (content: string, filename?: string) =>
      ipcRenderer.invoke("setlist:parse", { content, filename }),
    save: (payload: { id: string; tracks: Track[]; name?: string }) =>
      ipcRenderer.invoke("setlist:save", payload),
    getTracks: (id: string) => ipcRenderer.invoke("setlist:get-tracks", id),
  },
  update: {
    getStatus: () => ipcRenderer.invoke("update:status"),
    check: () => ipcRenderer.invoke("update:check"),
    install: () => ipcRenderer.invoke("update:install"),
    simulateStatus: (status: unknown) =>
      ipcRenderer.invoke("update:simulate-status", status),
    onStatusChange: (callback: (status: unknown) => void) => {
      const subscription = (_event: unknown, status: unknown) =>
        callback(status);
      ipcRenderer.on("update:status-changed", subscription);
      return () => {
        ipcRenderer.removeListener("update:status-changed", subscription);
      };
    },
  },
  preferences: {
    get: () => ipcRenderer.invoke("preferences:get") as Promise<AppPreferences>,
    set: (preferences: Partial<AppPreferences>) =>
      ipcRenderer.invoke(
        "preferences:set",
        preferences,
      ) as Promise<AppPreferences>,
  },
  settings: {
    selectDirectory: () =>
      ipcRenderer.invoke("settings:select-directory") as Promise<string | null>,
    getDownloadDir: () =>
      ipcRenderer.invoke("settings:get-download-dir") as Promise<string>,
    getPreferences: () =>
      ipcRenderer.invoke("preferences:get") as Promise<AppPreferences>,
    updatePreferences: (preferences: Partial<AppPreferences>) =>
      ipcRenderer.invoke(
        "preferences:set",
        preferences,
      ) as Promise<AppPreferences>,
  },
};

// Expose strictly scoped APIs via contextBridge when contextIsolation is enabled.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  throw new Error(
    "Security violation: contextIsolation must be enabled in preload.",
  );
}
