import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  nativeImage,
  session,
} from "electron";
import { join, resolve, extname } from "path";
import { pathToFileURL } from "url";
import { existsSync } from "fs";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { isAllowedMediaPath, isSafeExternalOpenUrl } from "./utils/security";

// Register custom media scheme for in-app track auditioning
protocol.registerSchemesAsPrivileged([
  {
    scheme: "soulmate-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
import { SlskdService } from "./services/SlskdService";
import { SpotifyService } from "./services/SpotifyService";

import { SlskdClient } from "./services/SlskdClient";
import { QueueService } from "./services/QueueService";
import { YoutubeService } from "./services/YoutubeService";
import { SoundCloudService } from "./services/SoundCloudService";
import { BandcampService } from "./services/BandcampService";
import { PreferencesService } from "./services/PreferencesService";
import log from "./utils/logger";
import { partialPreferencesSchema } from "../shared/preferences";

import { Track } from "../shared/types";

import { LibraryService } from "./services/LibraryService";
import { PlaylistExportService } from "./services/PlaylistExportService";
import { UpdateService, UpdateStatus } from "./services/UpdateService";
import {
  StringQuerySchema,
  FormatsSchema,
  TrackSchema,
  TracksArraySchema,
  ExportPlaylistPayloadSchema,
  ExportCratePayloadSchema,
  RetryWithQueryPayloadSchema,
  SearchSourcesPayloadSchema,
  SelectSourcePayloadSchema,
  ParseSetlistPayloadSchema,
  SaveSetlistPayloadSchema,
} from "../shared/schemas";

import { parseSetlist } from "./utils/setlistParser";
export {
  StringQuerySchema,
  FormatsSchema,
  TrackSchema,
  TracksArraySchema,
  ExportPlaylistPayloadSchema,
  RetryWithQueryPayloadSchema,
  SearchSourcesPayloadSchema,
  SelectSourcePayloadSchema,
  ParseSetlistPayloadSchema,
  SaveSetlistPayloadSchema,
};

// Set app name specifically for macOS Dock
app.name = "soulmate";
app.setName("soulmate");

function applyMacDockIcon(): void {
  if (process.platform !== "darwin") return;
  try {
    const iconPath = join(__dirname, "../../build/icon.png");
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  } catch {
    // Ignored in case icon is missing
  }
}

applyMacDockIcon();

if (process.env.TEST_USER_DATA_DIR) {
  app.setPath("userData", process.env.TEST_USER_DATA_DIR);
}

const slskdService = new SlskdService();
const preferencesService = new PreferencesService();
const soundCloudService = new SoundCloudService();
const bandcampService = new BandcampService();
const youtubeService = new YoutubeService();
const spotifyService = new SpotifyService(
  preferencesService,
  soundCloudService,
  bandcampService,
  youtubeService,
);
const slskdClient = new SlskdClient();
const libraryService = new LibraryService();
const playlistExportService = new PlaylistExportService(libraryService);
const updateService = new UpdateService();
const queueService = new QueueService(
  slskdClient,
  preferencesService,
  undefined,
  libraryService,
  playlistExportService,
);
const setlistsStore = new Map<string, Track[]>();

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 950,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    title: "soulmate",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 16 },
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    if (process.env.TEST_USER_DATA_DIR) {
      // In automated E2E tests, position off-screen and show inactive to never disrupt user's workspace
      mainWindow.setPosition(-10000, -10000);
      mainWindow.showInactive();
      return;
    }
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalOpenUrl(details.url)) {
      void shell.openExternal(details.url);
    } else {
      log.warn(`[Main] Blocked unsafe external URL: ${details.url}`);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    const allowedDevOrigin =
      is.dev && process.env["ELECTRON_RENDERER_URL"]
        ? new URL(process.env["ELECTRON_RENDERER_URL"]).origin
        : null;
    try {
      const parsed = new URL(targetUrl);
      const isAllowedDev =
        allowedDevOrigin !== null && parsed.origin === allowedDevOrigin;
      const isLocalFile = parsed.protocol === "file:";
      if (!isAllowedDev && !isLocalFile) {
        log.warn(`[Main] Blocked unexpected navigation to: ${targetUrl}`);
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Protocol Handler (Deep Linking)
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("soulmate", process.execPath, [
        resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("soulmate");
  }

  // Handle Deep Link on already running instance (Windows)
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", (_, argv) => {
      if (process.platform === "win32") {
        // Keep only command line / deep linked arguments
        // expected soulmate://callback?code=...
        const url = argv.find((arg) => arg.startsWith("soulmate://"));
        if (url) {
          spotifyService.handleCallback(url).catch((err) => {
            log.error("[Main] Deep link error:", err);
          });
        }
      }
    });
  }

  // Handle Deep Link (macOS)
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (typeof url === "string" && url.startsWith("soulmate://")) {
      spotifyService.handleCallback(url).catch((err) => {
        log.error("[Main] Deep link error:", err);
      });
    } else {
      log.warn(`[Main] Ignored unexpected deep-link URL: ${String(url)}`);
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("queue:update", queueService.getQueue());
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// Register IPC handlers once (outside createWindow to prevent duplicate registration)
function registerIPCHandlers(): void {
  // IPC Handlers - Spotify
  ipcMain.handle("spotify:login", async () => {
    const success = await spotifyService.login();
    if (success) {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("spotify:connected");
      });
    }
  });
  ipcMain.handle("spotify:status", () => spotifyService.isAuthenticated());
  ipcMain.handle("spotify:playlists", () => spotifyService.getPlaylists());
  ipcMain.handle("spotify:search", (_, query) => {
    const q = StringQuerySchema.parse(query);
    return spotifyService.searchPlaylists(q);
  });
  ipcMain.handle("spotify:tracks", (_, playlistId) => {
    const id = StringQuerySchema.parse(playlistId);
    return spotifyService.getPlaylistTracks(id);
  });
  ipcMain.handle("spotify:getPlaylist", (_, url) => {
    const parsedUrl = StringQuerySchema.parse(url);
    return spotifyService.getPlaylist(parsedUrl);
  });
  ipcMain.handle("spotify:logout", () => spotifyService.logout());

  // IPC Handlers - YouTube
  ipcMain.handle("youtube:getPlaylist", (_, url) => {
    const parsedUrl = StringQuerySchema.parse(url);
    return youtubeService.getPlaylist(parsedUrl);
  });
  ipcMain.handle("youtube:tracks", (_, id) => {
    const parsedId = StringQuerySchema.parse(id);
    return youtubeService.getPlaylistTracks(parsedId);
  });

  // IPC Handlers - SoundCloud
  ipcMain.handle("soundcloud:getPlaylist", (_, url) => {
    const parsedUrl = StringQuerySchema.parse(url);
    return soundCloudService.getPlaylist(parsedUrl);
  });
  ipcMain.handle("soundcloud:tracks", (_, id) => {
    const parsedId = StringQuerySchema.parse(id);
    return soundCloudService.getTracks(parsedId);
  });

  // IPC Handlers - Bandcamp
  ipcMain.handle("bandcamp:getPlaylist", (_, url) => {
    const parsedUrl = StringQuerySchema.parse(url);
    return bandcampService.getPlaylist(parsedUrl);
  });
  ipcMain.handle("bandcamp:tracks", (_, id) => {
    const parsedId = StringQuerySchema.parse(id);
    return bandcampService.getTracks(parsedId);
  });

  // Slskd IPC
  ipcMain.handle("slskd:search", (_, query) => {
    const q = StringQuerySchema.parse(query);
    return slskdClient.search(q);
  });
  ipcMain.handle("slskd:status", () =>
    slskdClient.getSoulseekConnectionState(),
  );

  // Queue IPC
  const handleStartDownload = (_: unknown, payload: unknown) => {
    let tracksInput = payload;
    let playlistName: string | undefined;

    if (
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      "tracks" in payload
    ) {
      const typedPayload = payload as {
        tracks: unknown;
        playlistName?: unknown;
      };
      tracksInput = typedPayload.tracks;
      if (typeof typedPayload.playlistName === "string") {
        playlistName = typedPayload.playlistName;
      }
    }

    const parsedTracks = TracksArraySchema.parse(tracksInput);
    const normalizedTracks: Track[] = parsedTracks.map((t) => ({
      id: t.id,
      name: t.name,
      artists: t.artists,
      album: t.album || { name: "Unknown" },
      duration_ms: t.duration_ms ?? 0,
      image: t.image,
      is_youtube: t.is_youtube,
      track_number: t.track_number,
      year: t.year,
      targetPath: t.targetPath,
      filePath: t.filePath,
    }));
    return queueService.processPlaylist(normalizedTracks, playlistName);
  };

  ipcMain.handle("queue:start", handleStartDownload);
  ipcMain.handle("download:start", handleStartDownload);
  ipcMain.handle("queue:set-priority", (_, formats) => {
    const parsedFormats = FormatsSchema.parse(formats);
    return queueService.setFormatPriority(parsedFormats);
  });
  ipcMain.handle("queue:get-priority", () => queueService.getFormatPriority());
  ipcMain.handle("queue:cancel", (_, id) => {
    const parsedId = StringQuerySchema.parse(id);
    return queueService.cancel(parsedId);
  });
  ipcMain.handle("queue:retry", (_, id) => {
    const parsedId = StringQuerySchema.parse(id);
    return queueService.retry(parsedId);
  });
  ipcMain.handle("queue:retry-with-query", (_, payload) => {
    const parsed = RetryWithQueryPayloadSchema.parse(payload);
    return queueService.retryWithQuery(parsed.id, parsed.customQuery);
  });
  ipcMain.handle("queue:search-sources", (_, payload) => {
    const parsed = SearchSourcesPayloadSchema.parse(payload);
    return queueService.searchSources(parsed.id, parsed.query);
  });
  ipcMain.handle("queue:select-source", (_, payload) => {
    const parsed = SelectSourcePayloadSchema.parse(payload);
    return queueService.selectSource(parsed.id, parsed);
  });
  ipcMain.handle("queue:clear", () => queueService.clear());
  ipcMain.handle("queue:get", () => queueService.getQueue());
  ipcMain.handle("queue:pause-all", () => queueService.pauseAll());
  ipcMain.handle("queue:resume-all", () => queueService.resumeAll());
  ipcMain.handle("queue:clear-completed", () => queueService.clearCompleted());
  ipcMain.handle("queue:open-folder", async (_, filePath) => {
    try {
      const isTest =
        process.env.NODE_ENV === "test" ||
        Boolean(process.env.PLAYWRIGHT_TEST) ||
        Boolean(process.env.TEST_USER_DATA_DIR);

      if (isTest) {
        return true;
      }

      const downloadDir = preferencesService.getDownloadPath();
      const knownQueuePaths = queueService
        .getQueue()
        .flatMap((item) => [item.targetPath, item.filePath])
        .filter((p): p is string => Boolean(p));

      if (filePath && typeof filePath === "string") {
        if (
          existsSync(filePath) &&
          isAllowedMediaPath(filePath, downloadDir, knownQueuePaths)
        ) {
          shell.showItemInFolder(filePath);
          return true;
        }
        log.warn(
          `[Main] Blocked queue:open-folder for path outside allowed library`,
        );
      }
      if (existsSync(downloadDir)) {
        await shell.openPath(downloadDir);
      }
      return true;
    } catch (err) {
      log.error("[Main] Failed to open folder or reveal item:", err);
      return false;
    }
  });
  ipcMain.handle("queue:export-playlist", async (_, payload) => {
    let playlistName = "Soulmate Playlist";
    let tracks: Track[] | undefined;
    let reveal = true;

    if (typeof payload === "string") {
      playlistName = payload;
    } else if (payload && typeof payload === "object") {
      const parsed = ExportPlaylistPayloadSchema.parse(payload);
      playlistName = parsed.playlistName;
      if (parsed.tracks) {
        tracks = parsed.tracks.map((t) => ({
          id: t.id,
          name: t.name,
          artists: t.artists,
          album: t.album || { name: "Unknown" },
          duration_ms: t.duration_ms ?? 0,
          image: t.image,
          is_youtube: t.is_youtube,
          track_number: t.track_number,
          year: t.year,
          targetPath: t.targetPath,
          filePath: t.filePath,
        }));
      }
      if (parsed.reveal !== undefined) {
        reveal = parsed.reveal;
      }
    }

    return queueService.exportPlaylist({ playlistName, tracks, reveal });
  });

  ipcMain.handle("crate:export-rekordbox", async (_, payload) => {
    let playlistName = "Soulmate Playlist";
    let tracks: Track[] | undefined;
    let reveal = true;
    let fileName: string | undefined;

    if (typeof payload === "string") {
      playlistName = payload;
    } else if (payload && typeof payload === "object") {
      const parsed = ExportCratePayloadSchema.parse(payload);
      playlistName = parsed.playlistName;
      fileName = parsed.fileName;
      if (parsed.tracks) {
        tracks = parsed.tracks.map((t) => ({
          id: t.id,
          name: t.name,
          artists: t.artists,
          album: t.album || { name: "Unknown" },
          duration_ms: t.duration_ms ?? 0,
          image: t.image,
          is_youtube: t.is_youtube,
          track_number: t.track_number,
          year: t.year,
          targetPath: t.targetPath,
          filePath: t.filePath,
          formatInfo: t.formatInfo,
        }));
      }
      if (parsed.reveal !== undefined) {
        reveal = parsed.reveal;
      }
    }

    return queueService.exportRekordboxCrate({
      playlistName,
      tracks,
      reveal,
      fileName,
    });
  });

  ipcMain.handle("crate:export-serato", async (_, payload) => {
    let playlistName = "Soulmate Playlist";
    let tracks: Track[] | undefined;
    let reveal = true;
    let fileName: string | undefined;

    if (typeof payload === "string") {
      playlistName = payload;
    } else if (payload && typeof payload === "object") {
      const parsed = ExportCratePayloadSchema.parse(payload);
      playlistName = parsed.playlistName;
      fileName = parsed.fileName;
      if (parsed.tracks) {
        tracks = parsed.tracks.map((t) => ({
          id: t.id,
          name: t.name,
          artists: t.artists,
          album: t.album || { name: "Unknown" },
          duration_ms: t.duration_ms ?? 0,
          image: t.image,
          is_youtube: t.is_youtube,
          track_number: t.track_number,
          year: t.year,
          targetPath: t.targetPath,
          filePath: t.filePath,
          formatInfo: t.formatInfo,
        }));
      }
      if (parsed.reveal !== undefined) {
        reveal = parsed.reveal;
      }
    }

    return queueService.exportSeratoCrate({
      playlistName,
      tracks,
      reveal,
      fileName,
    });
  });

  ipcMain.handle("crate:export-traktor", async (_, payload) => {
    let playlistName = "Soulmate Playlist";
    let tracks: Track[] | undefined;
    let reveal = true;
    let fileName: string | undefined;

    if (typeof payload === "string") {
      playlistName = payload;
    } else if (payload && typeof payload === "object") {
      const parsed = ExportCratePayloadSchema.parse(payload);
      playlistName = parsed.playlistName;
      fileName = parsed.fileName;
      if (parsed.tracks) {
        tracks = parsed.tracks.map((t) => ({
          id: t.id,
          name: t.name,
          artists: t.artists,
          album: t.album || { name: "Unknown" },
          duration_ms: t.duration_ms ?? 0,
          image: t.image,
          is_youtube: t.is_youtube,
          track_number: t.track_number,
          year: t.year,
          targetPath: t.targetPath,
          filePath: t.filePath,
          formatInfo: t.formatInfo,
        }));
      }
      if (parsed.reveal !== undefined) {
        reveal = parsed.reveal;
      }
    }

    return queueService.exportTraktorCrate({
      playlistName,
      tracks,
      reveal,
      fileName,
    });
  });

  // Library & Duplicate Detection IPC
  ipcMain.handle("library:check-tracks", (_, tracks) => {
    const parsedTracks = TracksArraySchema.parse(tracks);
    const normalizedTracks: Track[] = parsedTracks.map((t) => ({
      id: t.id,
      name: t.name,
      artists: t.artists,
      album: t.album || { name: "Unknown" },
      duration_ms: t.duration_ms ?? 0,
      image: t.image,
      is_youtube: t.is_youtube,
      track_number: t.track_number,
      year: t.year,
      targetPath: t.targetPath,
      filePath: t.filePath,
    }));
    const downloadDir = preferencesService.getDownloadPath();
    return libraryService.checkTracks(normalizedTracks, downloadDir);
  });

  // Auto-Updater IPC
  ipcMain.handle("update:status", () => updateService.getStatus());
  ipcMain.handle("update:check", () => updateService.checkForUpdates());
  ipcMain.handle("update:install", () => {
    updateService.quitAndInstall();
  });
  ipcMain.handle("update:simulate-status", (_, status: unknown) => {
    const isTest =
      process.env.NODE_ENV === "test" ||
      Boolean(process.env.PLAYWRIGHT_TEST) ||
      Boolean(process.env.TEST_USER_DATA_DIR);
    if (!isTest) {
      throw new Error("update:simulate-status is disabled in production");
    }
    updateService.setSimulatedStatus(status as UpdateStatus);
    return updateService.getStatus();
  });

  // Preferences & Settings IPC
  const handleGetPreferences = () => preferencesService.getPreferences();
  const handleSetPreferences = async (_: unknown, preferences: unknown) => {
    const parsedPreferences = partialPreferencesSchema.parse(preferences);
    const updated = preferencesService.updatePreferences(parsedPreferences);
    if (parsedPreferences.downloadSpeedLimit !== undefined) {
      await queueService.applyBandwidthLimit(
        parsedPreferences.downloadSpeedLimit,
      );
    }
    return updated;
  };

  ipcMain.handle("preferences:get", handleGetPreferences);
  ipcMain.handle("preferences:set", handleSetPreferences);
  ipcMain.handle("settings:get-preferences", handleGetPreferences);
  ipcMain.handle("settings:update-preferences", handleSetPreferences);

  ipcMain.handle("settings:select-directory", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (!canceled && filePaths.length > 0) {
      const path = filePaths[0];
      preferencesService.setDownloadPath(path);
      return path;
    }
    return null;
  });

  ipcMain.handle("settings:get-download-dir", () => {
    return preferencesService.getDownloadPath();
  });

  // DJ Setlist Batch Import IPC
  ipcMain.handle("setlist:parse", (_, payload) => {
    const { content, filename } = ParseSetlistPayloadSchema.parse(payload);
    return parseSetlist(content, filename);
  });

  ipcMain.handle("setlist:save", (_, payload) => {
    const { id, tracks } = SaveSetlistPayloadSchema.parse(payload);
    const normalizedTracks: Track[] = tracks.map((t) => ({
      id: t.id,
      name: t.name,
      artists: t.artists,
      album: t.album || { name: "Setlist Import" },
      duration_ms: t.duration_ms ?? 0,
      image: t.image,
      is_youtube: t.is_youtube,
      track_number: t.track_number,
      year: t.year,
      targetPath: t.targetPath,
      filePath: t.filePath,
    }));
    setlistsStore.set(id, normalizedTracks);
    return true;
  });

  ipcMain.handle("setlist:get-tracks", (_, id) => {
    const parsedId = StringQuerySchema.parse(id);
    return setlistsStore.get(parsedId) || [];
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.soulmate");
  applyMacDockIcon();

  // Start Slskd (Now async)
  slskdService
    .start()
    .then(() => {
      const config = slskdService.getApiConfig();
      slskdClient.configure(config.port, config.apiKey);
      log.info("[Main] Slskd Client Configured");
      void queueService.applyBandwidthLimit();
    })

    .catch((err) => {
      log.error("[Main] Failed to start SlskdService:", err);
    });

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Deny unsolicited Chromium permission requests (camera, mic, geolocation, notifications, etc.)
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  // Register media streaming protocol handler
  protocol.handle("soulmate-media", async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const rawPath =
        parsedUrl.searchParams.get("path") ||
        decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
      if (!rawPath || !existsSync(rawPath)) {
        return new Response("Media not found", { status: 404 });
      }

      const downloadDir = preferencesService.getDownloadPath();
      const knownQueuePaths = queueService
        .getQueue()
        .flatMap((item) => [item.targetPath, item.filePath])
        .filter((p): p is string => Boolean(p));

      if (!isAllowedMediaPath(rawPath, downloadDir, knownQueuePaths)) {
        log.warn(
          "[Main] Blocked soulmate-media access outside allowed download directory",
        );
        return new Response("Forbidden", { status: 403 });
      }

      const ext = extname(rawPath).toLowerCase();
      const allowed = [".flac", ".mp3", ".wav", ".aiff", ".m4a", ".ogg"];
      if (!allowed.includes(ext)) {
        return new Response("Unsupported media type", { status: 415 });
      }

      return net.fetch(pathToFileURL(rawPath).toString());
    } catch (err) {
      log.error("[Main] Error handling soulmate-media request:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  });

  // Register IPC handlers once before creating any windows
  registerIPCHandlers();

  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  slskdService.stop();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Handle process termination signals
process.on("SIGTERM", () => {
  log.info("[Main] SIGTERM received. Quitting...");
  app.quit();
});

process.on("SIGINT", () => {
  log.info("[Main] SIGINT received. Quitting...");
  app.quit();
});
