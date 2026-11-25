/// <reference types="vite/client" />

import { AppPreferences } from "../../shared/preferences";
import {
  DownloadItem,
  Playlist,
  SlskdStatus,
  Track,
  TrackLibraryStatus,
  ExportPlaylistResult,
  ExportCrateResult,
  UpdateStatus,
  SlskdFile,
} from "../../shared/types";

declare global {
  interface Window {
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
      youtube: {
        getPlaylist: (url: string) => Promise<Playlist>;
        getTracks: (playlistId: string) => Promise<Track[]>;
      };
      soundcloud: {
        getPlaylist: (url: string) => Promise<Playlist>;
        getTracks: (playlistId: string) => Promise<Track[]>;
      };
      bandcamp: {
        getPlaylist: (url: string) => Promise<Playlist>;
        getTracks: (playlistId: string) => Promise<Track[]>;
      };
      slskd: {
        search: (query: string) => Promise<unknown>;
        status: () => Promise<SlskdStatus>;
      };
      queue: {
        start: (
          payload: Track[] | { tracks: Track[]; playlistName?: string },
        ) => Promise<void>;
        exportPlaylist: (payload: {
          playlistName: string;
          tracks?: Track[];
          reveal?: boolean;
        }) => Promise<ExportPlaylistResult>;
        setPriority: (formats: string[]) => Promise<void>;
        getPriority: () => Promise<string[]>;
        cancel: (id: string) => Promise<void>;
        retry: (id: string) => Promise<boolean>;
        retryWithQuery: (payload: {
          id: string;
          customQuery: string;
        }) => Promise<boolean>;
        searchSources: (payload: {
          id: string;
          query?: string;
        }) => Promise<{ query: string; files: SlskdFile[] }>;
        selectSource: (payload: {
          id: string;
          username: string;
          filename: string;
          size?: number;
          bitRate?: number;
        }) => Promise<boolean>;
        clear: () => Promise<void>;
        get: () => Promise<DownloadItem[]>;
        pauseAll: () => Promise<void>;
        resumeAll: () => Promise<void>;
        clearCompleted: () => Promise<DownloadItem[]>;
        openFolder: (filePath?: string) => Promise<boolean>;
        onUpdate: (callback: (queue: DownloadItem[]) => void) => () => void;
      };
      media: {
        getPreviewUrl: (filePath: string) => string;
      };
      crate: {
        exportRekordbox: (payload: {
          playlistName: string;
          tracks?: Track[];
          reveal?: boolean;
          fileName?: string;
        }) => Promise<ExportCrateResult>;
        exportSerato: (payload: {
          playlistName: string;
          tracks?: Track[];
          reveal?: boolean;
          fileName?: string;
        }) => Promise<ExportCrateResult>;
        exportTraktor: (payload: {
          playlistName: string;
          tracks?: Track[];
          reveal?: boolean;
          fileName?: string;
        }) => Promise<ExportCrateResult>;
      };
      library: {
        checkTracks: (
          tracks: Track[],
        ) => Promise<Record<string, TrackLibraryStatus>>;
      };

      setlist: {
        parse: (content: string, filename?: string) => Promise<Track[]>;
        save: (payload: {
          id: string;
          tracks: Track[];
          name?: string;
        }) => Promise<boolean>;
        getTracks: (id: string) => Promise<Track[]>;
      };
      update: {
        getStatus: () => Promise<UpdateStatus>;
        check: () => Promise<UpdateStatus>;
        install: () => Promise<void>;
        simulateStatus: (status: UpdateStatus) => Promise<UpdateStatus>;
        onStatusChange: (
          callback: (status: UpdateStatus) => void,
        ) => () => void;
      };
      preferences: {
        get: () => Promise<AppPreferences>;
        set: (preferences: Partial<AppPreferences>) => Promise<AppPreferences>;
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

export {};
