import { ElectronAPI } from "@electron-toolkit/preload";
import { AppPreferences } from "../shared/preferences";
import { DownloadItem, Playlist, Track } from "../shared/types";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      spotify: {
        login: () => Promise<void>;
        logout: () => Promise<void>;
        getPlaylists: () => Promise<Playlist[]>;
        search: (query: string) => Promise<Playlist[]>;
        status: () => Promise<boolean>;
        getPlaylist: (url: string) => Promise<Playlist>;
        getTracks: (playlistId: string) => Promise<Track[]>;
        onConnected: (callback: () => void) => () => void;
      };
      slskd: {
        search: (query: string) => Promise<any>;
        status: () => Promise<any>;
      };
      queue: {
        start: (tracks: Track[]) => Promise<void>;
        setPriority: (formats: string[]) => Promise<void>;
        getPriority: () => Promise<string[]>;
        cancel: (id: string) => Promise<void>;
        clear: () => Promise<void>;
        onUpdate: (callback: (queue: DownloadItem[]) => void) => () => void;
      };
      settings: {
        selectDirectory: () => Promise<string | null>;
        getDownloadDir: () => Promise<string>;
        getPreferences: () => Promise<AppPreferences>;
        updatePreferences: (
          preferences: Partial<AppPreferences>,
        ) => Promise<AppPreferences>;
      };
    };
  }
}
