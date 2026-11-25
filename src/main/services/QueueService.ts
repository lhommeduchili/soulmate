import { BrowserWindow } from "electron";
import { join, basename, extname } from "path";
import { existsSync, readdirSync, readFileSync } from "fs";
import { SlskdClient } from "./SlskdClient";
import { Track, DownloadItem, SlskdFile } from "../../shared/types";
import { MatchMaker } from "./MatchMaker";
import log from "../utils/logger";
import { PreferencesService } from "./PreferencesService";
import { MetadataService, buildTargetFilePath } from "./MetadataService";
import { LibraryService } from "./LibraryService";
import {
  PlaylistExportService,
  ExportPlaylistResult,
} from "./PlaylistExportService";
import { CrateExportService, ExportCrateResult } from "./CrateExportService";
import { QueuePersistence } from "./QueuePersistence";
import { cleanTrackText } from "../utils/spotifyParser";

import {
  formatSpeed,
  formatTransferProgress,
  mapSlskdStateToStatus,
  calculateSpeed,
} from "../utils/telemetry";
import { inspectAudioFile, verifyAudioIntegrity } from "./AudioInspection";
import { AppError } from "../utils/AppError";

export const DEFAULT_FORMAT_PRIORITY = ["aiff", "wav", "flac", "mp3"];

export function formatPriorityToExtensions(
  priority: string | string[],
): string[] {
  if (Array.isArray(priority)) return priority;
  switch (priority) {
    case "flac":
      return [...DEFAULT_FORMAT_PRIORITY];
    case "320kbps":
      return ["mp3", "aiff", "wav", "flac"];
    case "any":
      return [...DEFAULT_FORMAT_PRIORITY];
    default:
      return [...DEFAULT_FORMAT_PRIORITY];
  }
}

export class QueueService {
  private slskdClient: SlskdClient;
  private queue: Map<string, DownloadItem> = new Map();
  private transferMetrics: Map<
    string,
    { lastBytes: number; lastTime: number }
  > = new Map();
  private lastActiveProgress: Map<
    string,
    { bytes: number; timestamp: number }
  > = new Map();
  private failedPeersPerTrack: Map<string, Set<string>> = new Map();
  private matchMaker: MatchMaker;
  private preferencesService: PreferencesService;
  private metadataService: MetadataService;
  private libraryService: LibraryService;
  private playlistExportService: PlaylistExportService;
  private crateExportService: CrateExportService;
  private queuePersistence: QueuePersistence;
  private lastExportedManifest: string | null = null;
  private lastSearchResults: Map<string, SlskdFile[]> = new Map();
  private customFormatPriority: string[] | null = null;
  private stalledTimeoutMs: number = 30_000;

  constructor(
    slskdClient: SlskdClient,
    preferencesService: PreferencesService,
    metadataService: MetadataService = new MetadataService(),
    libraryService: LibraryService = new LibraryService(),
    playlistExportService: PlaylistExportService = new PlaylistExportService(
      libraryService,
    ),
    queuePersistence: QueuePersistence = new QueuePersistence(),
    crateExportService: CrateExportService = new CrateExportService(
      libraryService,
    ),
  ) {
    this.slskdClient = slskdClient;
    this.preferencesService = preferencesService;
    this.metadataService = metadataService;
    this.libraryService = libraryService;
    this.playlistExportService = playlistExportService;
    this.queuePersistence = queuePersistence;
    this.crateExportService = crateExportService;

    // Restore persisted queue state (recovering interrupted active transfers to paused)
    const persistedItems = this.queuePersistence.loadQueue();
    for (const item of persistedItems) {
      this.queue.set(item.id, item);
    }
    if (persistedItems.length > 0) {
      log.info(
        `[QueueService] Restored ${persistedItems.length} items from persistent queue`,
      );
      this.persistQueue();
    }

    // Load priority from store if exists
    const storedPriority = this.preferencesService.getFormatPriority();
    this.matchMaker = new MatchMaker(
      formatPriorityToExtensions(storedPriority),
    );

    // Start monitoring loop
    setInterval(() => this.monitorQueue(), 2000);
  }

  setFormatPriority(formats: string[]) {
    this.customFormatPriority = [...formats];
    this.matchMaker.updateFormatPriority(formats);
    log.info("[QueueService] Format priority updated:", formats);
  }

  getFormatPriority(): string[] {
    if (this.customFormatPriority && this.customFormatPriority.length > 0) {
      return [...this.customFormatPriority];
    }
    const priority = this.preferencesService.getFormatPriority();
    return formatPriorityToExtensions(priority);
  }

  getQueue(): DownloadItem[] {
    return Array.from(this.queue.values());
  }

  setStalledTimeoutMs(ms: number) {
    this.stalledTimeoutMs = ms;
  }

  async processPlaylist(tracks: Track[], playlistName?: string) {
    log.info(
      `[QueueService] Processing playlist with ${tracks.length} tracks (playlist: ${playlistName || "unnamed"})`,
    );

    for (const track of tracks) {
      this.addToQueue(track, playlistName);
    }

    // Start processing background job
    this.processQueue();
    this.checkAndExportCompletedPlaylists();
  }

  private addToQueue(track: Track, playlistName?: string) {
    if (this.queue.has(track.id)) return; // Already in queue

    const sanitizedTrack: Track = {
      ...track,
      name: cleanTrackText(track.name),
      artists: track.artists.map((a) => ({
        ...a,
        name: cleanTrackText(a.name),
      })),
      album: track.album
        ? {
            ...track.album,
            name: cleanTrackText(track.album.name),
          }
        : { name: "Unknown" },
    };

    const downloadDir =
      this.preferencesService.getDownloadPath?.() ||
      this.preferencesService.getDefaultDownloadPath?.() ||
      "";

    // Duplicate detection: check if track is already in local library
    const inLibrary = this.libraryService.isTrackInLibrary(
      sanitizedTrack,
      downloadDir,
    );

    if (inLibrary.inLibrary && inLibrary.filePath) {
      const item: DownloadItem = {
        id: sanitizedTrack.id,
        track: sanitizedTrack,
        status: "completed",
        progress: 100,
        targetPath: inLibrary.filePath,
        filePath: inLibrary.filePath,
        playlistName,
      };
      this.queue.set(sanitizedTrack.id, item);
      this.emitQueueUpdate();
      log.info(
        `[QueueService] Track ${sanitizedTrack.name} already in library (${inLibrary.filePath}), marking completed`,
      );
      return;
    }

    const item: DownloadItem = {
      id: sanitizedTrack.id,
      track: sanitizedTrack,
      status: "pending",
      progress: 0,
      playlistName,
    };
    this.queue.set(sanitizedTrack.id, item);
    this.emitQueueUpdate();
  }

  private checkAndExportCompletedPlaylists(): void {
    if (this.queue.size === 0) return;

    const allItems = Array.from(this.queue.values());
    const isAllFinished = allItems.every(
      (item) => item.status === "completed" || item.status === "failed",
    );
    const completedItems = allItems.filter(
      (item) => item.status === "completed",
    );

    if (isAllFinished && completedItems.length > 0) {
      const downloadDir =
        this.preferencesService.getDownloadPath?.() ||
        this.preferencesService.getDefaultDownloadPath?.() ||
        "";

      // Group completed items by playlistName
      const playlistsMap = new Map<string, Track[]>();
      for (const item of completedItems) {
        const name = item.playlistName || "Soulmate Playlist";
        const group = playlistsMap.get(name) || [];
        group.push(item.track);
        playlistsMap.set(name, group);
      }

      for (const [playlistName, tracks] of playlistsMap.entries()) {
        try {
          const result = this.playlistExportService.exportPlaylist({
            playlistName,
            tracks,
            downloadDir,
            reveal: false,
          });
          this.lastExportedManifest = result.filePath;
          log.info(
            `[QueueService] Batch completed. Auto-exported manifest: ${result.filePath} (${result.trackCount} tracks)`,
          );
        } catch (err) {
          log.warn(
            `[QueueService] Failed to auto-export playlist manifest for "${playlistName}":`,
            err,
          );
        }
      }
    }
  }

  exportPlaylist(options: {
    playlistName: string;
    tracks?: Track[];
    reveal?: boolean;
  }): ExportPlaylistResult {
    const downloadDir =
      this.preferencesService.getDownloadPath?.() ||
      this.preferencesService.getDefaultDownloadPath?.() ||
      "";

    let tracks = options.tracks;
    if (!tracks || tracks.length === 0) {
      tracks = Array.from(this.queue.values())
        .filter((item) => item.status === "completed")
        .map((item) => item.track);
    }

    const result = this.playlistExportService.exportPlaylist({
      playlistName: options.playlistName,
      tracks,
      downloadDir,
      reveal: options.reveal ?? true,
    });
    this.lastExportedManifest = result.filePath;
    return result;
  }

  getLastExportedManifest(): string | null {
    return this.lastExportedManifest;
  }

  exportRekordboxCrate(options: {
    playlistName: string;
    tracks?: Track[];
    reveal?: boolean;
    fileName?: string;
  }): ExportCrateResult {
    const downloadDir =
      this.preferencesService.getDownloadPath?.() ||
      this.preferencesService.getDefaultDownloadPath?.() ||
      "";

    let tracks = options.tracks;
    if (!tracks || tracks.length === 0) {
      tracks = Array.from(this.queue.values())
        .filter(
          (item) =>
            item.status === "completed" &&
            (!options.playlistName ||
              item.playlistName === options.playlistName),
        )
        .map((item) => item.track);
    }

    return this.crateExportService.exportRekordboxXml({
      playlistName: options.playlistName,
      tracks,
      downloadDir,
      reveal: options.reveal ?? true,
      fileName: options.fileName,
    });
  }

  exportSeratoCrate(options: {
    playlistName: string;
    tracks?: Track[];
    reveal?: boolean;
    fileName?: string;
  }): ExportCrateResult {
    const downloadDir =
      this.preferencesService.getDownloadPath?.() ||
      this.preferencesService.getDefaultDownloadPath?.() ||
      "";

    let tracks = options.tracks;
    if (!tracks || tracks.length === 0) {
      tracks = Array.from(this.queue.values())
        .filter(
          (item) =>
            item.status === "completed" &&
            (!options.playlistName ||
              item.playlistName === options.playlistName),
        )
        .map((item) => item.track);
    }

    return this.crateExportService.exportSeratoCrate({
      playlistName: options.playlistName,
      tracks,
      downloadDir,
      reveal: options.reveal ?? true,
      fileName: options.fileName,
    });
  }

  exportTraktorCrate(options: {
    playlistName: string;
    tracks?: Track[];
    reveal?: boolean;
    fileName?: string;
  }): ExportCrateResult {
    const downloadDir =
      this.preferencesService.getDownloadPath?.() ||
      this.preferencesService.getDefaultDownloadPath?.() ||
      "";

    let tracks = options.tracks;
    if (!tracks || tracks.length === 0) {
      tracks = Array.from(this.queue.values())
        .filter(
          (item) =>
            item.status === "completed" &&
            (!options.playlistName ||
              item.playlistName === options.playlistName),
        )
        .map((item) => item.track);
    }

    return this.crateExportService.exportTraktorNml({
      playlistName: options.playlistName,
      tracks,
      downloadDir,
      reveal: options.reveal ?? true,
      fileName: options.fileName,
    });
  }

  async applyBandwidthLimit(limit?: number): Promise<void> {
    const speedLimit =
      limit !== undefined
        ? limit
        : this.preferencesService.getDownloadSpeedLimit();
    try {
      await this.slskdClient.reconfigureOptions({
        limits: {
          transfer: {
            downloadSpeed: speedLimit,
          },
        },
      });
      log.info(
        `[QueueService] Applied download speed limit: ${
          speedLimit === 0 ? "Unlimited" : `${speedLimit} KB/s`
        }`,
      );
    } catch (err) {
      log.warn(
        `[QueueService] Failed to dynamically reconfigure slskd speed limit:`,
        err,
      );
    }
  }

  async cancel(id: string) {
    const item = this.queue.get(id);
    if (item) {
      if (
        item.status === "downloading" ||
        item.status === "queued" ||
        item.status === "connecting"
      ) {
        if (item.username && item.transferId) {
          try {
            await this.slskdClient.cancelDownload(
              item.username,
              item.transferId,
            );
            log.info(
              `[QueueService] Remote download cancelled: ${item.transferId}`,
            );
          } catch (e) {
            log.warn(
              `[QueueService] Failed to cancel remote download (might already be gone): ${e}`,
            );
          }
        }
      }
      this.transferMetrics.delete(id);
      this.lastActiveProgress.delete(id);
      this.failedPeersPerTrack.delete(id);
      this.queue.delete(id);
      this.emitQueueUpdate();
      log.info(`[QueueService] Cancelled processing for: ${id}`);
      this.processQueue();
    }
  }

  async clear() {
    for (const item of this.queue.values()) {
      if (item.username && item.transferId) {
        try {
          await this.slskdClient.cancelDownload(item.username, item.transferId);
        } catch {
          // ignore — transfer might already be gone
        }
      }
    }
    this.transferMetrics.clear();
    this.lastActiveProgress.clear();
    this.failedPeersPerTrack.clear();
    this.lastSearchResults.clear();
    this.queue.clear();
    this.queuePersistence.clear();
    this.emitQueueUpdate();
    log.info("[QueueService] Queue cleared and all downloads cancelled");
  }

  async pauseAll(): Promise<void> {
    log.info("[QueueService] Pausing all active and pending downloads");
    for (const item of this.queue.values()) {
      if (
        item.status === "downloading" ||
        item.status === "searching" ||
        item.status === "connecting" ||
        item.status === "queued" ||
        item.status === "tagging" ||
        item.status === "pending"
      ) {
        if (item.username && item.transferId) {
          try {
            await this.slskdClient.cancelDownload(
              item.username,
              item.transferId,
            );
          } catch (e) {
            log.debug(
              "[QueueService] Error cancelling remote download on pause:",
              e,
            );
          }
        }
        item.status = "paused";
        item.speed = undefined;
        item.formattedSpeed = undefined;
        this.transferMetrics.delete(item.id);
      }
    }
    this.emitQueueUpdate();
  }

  async resumeAll(): Promise<void> {
    log.info("[QueueService] Resuming all paused downloads");
    let resumedCount = 0;
    for (const item of this.queue.values()) {
      if (item.status === "paused") {
        item.status = "pending";
        item.error = undefined;
        resumedCount++;
      }
    }
    this.emitQueueUpdate();
    if (resumedCount > 0) {
      this.processQueue();
    }
  }

  clearCompleted(): DownloadItem[] {
    log.info("[QueueService] Clearing completed items from queue");
    for (const [id, item] of this.queue.entries()) {
      if (item.status === "completed") {
        this.transferMetrics.delete(id);
        this.lastActiveProgress.delete(id);
        this.failedPeersPerTrack.delete(id);
        this.lastSearchResults.delete(id);
        this.queue.delete(id);
      }
    }
    this.emitQueueUpdate();
    return this.getQueue();
  }

  async retry(id: string): Promise<boolean> {
    const item = this.queue.get(id);
    if (!item) {
      log.warn(`[QueueService] Retry requested for non-existent item: ${id}`);
      return false;
    }

    log.info(`[QueueService] Retrying item: ${id} (${item.track.name})`);

    // If remote download was started, attempt cleanup first
    if (item.username && item.transferId) {
      try {
        await this.slskdClient.cancelDownload(item.username, item.transferId);
      } catch (e) {
        log.debug(
          "[QueueService] Failed to cancel remote download during retry:",
          e,
        );
      }
    }

    this.transferMetrics.delete(id);
    this.lastActiveProgress.delete(id);
    this.failedPeersPerTrack.delete(id);

    item.status = "pending";
    item.progress = 0;
    item.error = undefined;
    item.speed = undefined;
    item.formattedSpeed = undefined;
    item.bytesTransferred = 0;
    item.size = undefined;
    item.formattedSize = undefined;
    item.transferId = undefined;
    item.filename = undefined;
    item.username = undefined;
    item.failoverPeer = undefined;
    item.searchAttempt = undefined;

    this.emitQueueUpdate();
    this.processQueue();
    return true;
  }

  async retryWithQuery(id: string, customQuery: string): Promise<boolean> {
    const item = this.queue.get(id);
    if (!item) {
      log.warn(
        `[QueueService] retryWithQuery requested for non-existent item: ${id}`,
      );
      return false;
    }

    log.info(
      `[QueueService] Retrying item: ${id} (${item.track.name}) with custom query "${customQuery}"`,
    );

    if (item.username && item.transferId) {
      try {
        await this.slskdClient.cancelDownload(item.username, item.transferId);
      } catch (e) {
        log.debug(
          "[QueueService] Failed to cancel remote download during retryWithQuery:",
          e,
        );
      }
    }

    this.transferMetrics.delete(id);
    this.lastActiveProgress.delete(id);
    this.failedPeersPerTrack.delete(id);

    item.customQuery = customQuery.trim();
    item.status = "pending";
    item.progress = 0;
    item.error = undefined;
    item.speed = undefined;
    item.formattedSpeed = undefined;
    item.bytesTransferred = 0;
    item.size = undefined;
    item.formattedSize = undefined;
    item.transferId = undefined;
    item.filename = undefined;
    item.username = undefined;
    item.failoverPeer = undefined;
    item.searchAttempt = undefined;

    this.emitQueueUpdate();
    this.processQueue();
    return true;
  }

  async searchSources(
    id: string,
    queryOverride?: string,
  ): Promise<{ query: string; files: SlskdFile[] }> {
    const item = this.queue.get(id);
    if (!item) {
      throw new Error(`Item ${id} not found in queue`);
    }

    const artistName = cleanTrackText(item.track.artists[0]?.name || "Unknown");
    const trackName = cleanTrackText(item.track.name);
    const defaultQuery = `${artistName} ${trackName}`;
    const query =
      queryOverride?.trim() || item.customQuery?.trim() || defaultQuery;

    if (!queryOverride && this.lastSearchResults.has(id)) {
      const cached = this.lastSearchResults.get(id) || [];
      if (cached.length > 0) {
        return { query, files: cached };
      }
    }

    log.info(
      `[QueueService] Searching sources for ${id} with query "${query}"`,
    );
    const searchInit = await this.slskdClient.search(query);
    const searchId = searchInit.id || searchInit.Id;
    if (!searchId) {
      return { query, files: [] };
    }

    let files: SlskdFile[] = [];
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
      const searchState = await this.slskdClient.getSearchResults(searchId);
      if (searchState.responses && searchState.responses.length > 0) {
        files = this.flattenSearchResponses(searchState.responses);
        if (files.length > 0) {
          break;
        }
      }
      if (searchState.isComplete || searchState.state === "Completed") {
        break;
      }
    }

    this.lastSearchResults.set(id, files);
    return { query, files };
  }

  async selectSource(
    id: string,
    source: {
      username: string;
      filename: string;
      size?: number;
      bitRate?: number;
    },
  ): Promise<boolean> {
    const item = this.queue.get(id);
    if (!item) {
      log.warn(
        `[QueueService] selectSource called for non-existent item: ${id}`,
      );
      return false;
    }

    log.info(
      `[QueueService] Manually selecting source for ${id}: ${source.filename} from @${source.username}`,
    );

    if (item.username && item.transferId) {
      try {
        await this.slskdClient.cancelDownload(item.username, item.transferId);
      } catch (e) {
        log.debug(
          "[QueueService] Error cancelling existing download on selectSource:",
          e,
        );
      }
    }

    this.transferMetrics.delete(id);

    item.status = "downloading";
    item.filename = source.filename;
    item.username = source.username;
    item.size = source.size;
    item.progress = 0;
    item.bytesTransferred = 0;
    item.speed = undefined;
    item.formattedSpeed = undefined;
    item.error = undefined;
    this.emitQueueUpdate();

    try {
      const response = await this.slskdClient.download(
        source.username,
        source.filename,
        source.size || 0,
      );

      if (Array.isArray(response) && response.length > 0) {
        item.transferId = response[0].id || response[0].Id;
      } else if (response && (response.id || response.Id)) {
        item.transferId = response.id || response.Id;
      }
      log.info(
        `[QueueService] Manual download started for ${item.id} (Transfer ID: ${item.transferId})`,
      );
      this.emitQueueUpdate();
      return true;
    } catch (e) {
      log.error("[QueueService] Failed to send manual download command:", e);
      item.status = "failed";
      item.error = "Download command failed";
      this.emitQueueUpdate();
      this.processQueue();
      return false;
    }
  }

  private flattenSearchResponses(responses: unknown[]): SlskdFile[] {
    interface SlskdRawFile {
      Filename?: string;
      filename?: string;
      BitRate?: number;
      bitRate?: number;
      Size?: number;
      size?: number;
      [key: string]: unknown;
    }
    interface SlskdRawResponse {
      files?: SlskdRawFile[];
      Files?: SlskdRawFile[];
      Username?: string;
      username?: string;
      UploadSpeed?: number;
      uploadSpeed?: number;
      HasFreeUploadSlot?: boolean;
      hasFreeSlots?: boolean;
      QueueLength?: number;
      queueLength?: number;
    }
    return (responses as SlskdRawResponse[]).flatMap((r: SlskdRawResponse) => {
      const files = r.files || r.Files || [];
      return files.map((f: SlskdRawFile) => ({
        ...f,
        filename: (f.Filename || f.filename || "") as string,
        bitRate: (f.BitRate || f.bitRate) as number,
        size: (f.Size || f.size) as number,
        username: (r.Username || r.username || "") as string,
        speed: (r.UploadSpeed || r.uploadSpeed) as number,
        slotsFree: (r.HasFreeUploadSlot || r.hasFreeSlots) as boolean,
        queueLength: (r.QueueLength || r.queueLength) as number,
      }));
    });
  }

  private persistQueue(): void {
    try {
      this.queuePersistence.saveQueue(Array.from(this.queue.values()));
    } catch (e) {
      log.warn("[QueueService] Failed to persist queue:", e);
    }
  }

  private emitQueueUpdate() {
    this.persistQueue();
    // Broadcast queue state to all windows
    try {
      const windows = BrowserWindow.getAllWindows();
      const queueArray = Array.from(this.queue.values());
      windows.forEach((win: Electron.BrowserWindow) => {
        win.webContents?.send("queue:update", queueArray);
      });
    } catch (e) {
      log.debug("[QueueService] emitQueueUpdate skipped or failed:", e);
    }
  }

  private async processQueue() {
    const pendingItems = Array.from(this.queue.values()).filter(
      (i) => i.status === "pending",
    );

    if (pendingItems.length === 0) return;

    const activeCount = Array.from(this.queue.values()).filter((i) =>
      ["searching", "connecting", "queued", "downloading", "tagging"].includes(
        i.status,
      ),
    ).length;

    const maxConcurrent =
      this.preferencesService.getMaxConcurrentDownloads?.() ?? 2;
    const availableSlots =
      maxConcurrent === 0 ? Infinity : Math.max(0, maxConcurrent - activeCount);

    if (availableSlots <= 0) {
      log.info(
        `[QueueService] Concurrency limit reached (${activeCount}/${maxConcurrent}). Queuing subsequent tracks.`,
      );
      return;
    }

    const itemsToStart = pendingItems.slice(0, availableSlots);
    log.info(
      `[QueueService] Starting processing for ${itemsToStart.length} items (slots: ${availableSlots}, active: ${activeCount}, max: ${maxConcurrent})...`,
    );

    for (const item of itemsToStart) {
      // Double check status in case it changed
      if (this.queue.get(item.id)?.status !== "pending") continue;

      item.status = "searching";
      this.emitQueueUpdate();

      void this.searchAndDownload(item).catch((err) => {
        log.error(
          `[QueueService] Search and download failed for ${item.id}:`,
          err,
        );
        item.status = "failed";
        item.error = "Download pipeline error";
        this.emitQueueUpdate();
        this.processQueue();
      });
    }
  }

  private async searchAndDownload(item: DownloadItem) {
    item.status = "searching";
    this.emitQueueUpdate();

    const hasCustomQuery = Boolean(item.customQuery?.trim());
    const isCascadeEnabled =
      !hasCustomQuery &&
      (this.preferencesService.isAutoQueryCascadeEnabled?.() ?? true);

    const defaultArtist = cleanTrackText(
      item.track.artists[0]?.name || "Unknown",
    );
    const defaultTrack = cleanTrackText(item.track.name);
    const defaultQuery = `${defaultArtist} ${defaultTrack}`;

    const queries = isCascadeEnabled
      ? this.matchMaker.buildQueryCascade(item.track)
      : [item.customQuery?.trim() || defaultQuery];

    let bestMatch: SlskdFile | null = null;

    try {
      for (
        let cascadeIndex = 0;
        cascadeIndex < queries.length;
        cascadeIndex++
      ) {
        if (this.queue.get(item.id)?.status !== "searching") {
          log.info(`[QueueService] Search aborted for ${item.id}`);
          return;
        }

        const query = queries[cascadeIndex];
        const attempt = cascadeIndex + 1;
        item.searchAttempt = attempt;
        this.emitQueueUpdate();

        log.info(
          `[QueueService] Searching for: ${query} (cascade attempt ${attempt}/${queries.length}, track: ${defaultTrack} - ${defaultArtist})`,
        );

        const searchInit = await this.slskdClient.search(query);
        log.info(`[QueueService] Search initiated: ${searchInit.id}`);

        // Poll for results
        let attempts = 0;
        const maxAttempts = 30; // 30 * 1s = 30s timeout

        while (attempts < maxAttempts) {
          if (this.queue.get(item.id)?.status !== "searching") {
            log.info(`[QueueService] Search aborted for ${item.id}`);
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
          attempts++;

          if (this.queue.get(item.id)?.status !== "searching") {
            return;
          }

          const searchState = await this.slskdClient.getSearchResults(
            searchInit.id,
          );

          // Try to find a match continuously as results come in
          if (searchState.responses && searchState.responses.length > 0) {
            const allFiles = this.flattenSearchResponses(searchState.responses);
            this.lastSearchResults.set(item.id, allFiles);

            log.info(
              `[QueueService] Flattened ${allFiles.length} files from ${searchState.responses.length} responses for ${item.id}`,
            );

            bestMatch = this.matchMaker.findBestMatch(item.track, allFiles);
            if (bestMatch) {
              log.info(
                `[QueueService] Found match on attempt ${attempt}: ${bestMatch.filename} from ${bestMatch.username}`,
              );
              break;
            }
          }

          if (searchState.state === "Completed" || searchState.isComplete) {
            break;
          }
        }

        if (bestMatch) {
          break;
        } else {
          log.info(
            `[QueueService] No match on attempt ${attempt}/${queries.length} for "${item.track.name}"`,
          );
        }
      }

      if (bestMatch) {
        item.status = "downloading";
        item.filename = bestMatch.filename;
        item.username = bestMatch.username;
        this.emitQueueUpdate();

        try {
          // response is usually array of queued files or a status object
          const response = await this.slskdClient.download(
            bestMatch.username,
            bestMatch.filename,
            bestMatch.size,
          );

          if (Array.isArray(response) && response.length > 0) {
            item.transferId = response[0].id || response[0].Id;
          } else if (response && (response.id || response.Id)) {
            item.transferId = response.id || response.Id;
          }
          log.info(
            `[QueueService] Download started for ${item.id} (Transfer ID: ${item.transferId})`,
          );
        } catch (e) {
          log.error("[QueueService] Failed to send download command:", e);
          item.status = "failed";
          item.error = "Download command failed";
          this.emitQueueUpdate();
          this.processQueue();
        }
      } else {
        log.info(
          `[QueueService] No match found for ${item.track.name} across all cascade queries`,
        );
        item.status = "failed";
        item.error = "No match found";
        this.emitQueueUpdate();
        this.processQueue();
      }
    } catch (error) {
      log.error("[QueueService] Process failed:", error);
      item.status = "failed";
      this.emitQueueUpdate();
      this.processQueue();
    }
  }

  // Logic moved to MatchMaker.ts

  private async monitorQueue() {
    const activeDownloads = Array.from(this.queue.values()).filter(
      (i) =>
        i.status === "downloading" ||
        i.status === "queued" ||
        i.status === "connecting",
    );
    if (activeDownloads.length === 0) return;

    try {
      const transfers = await this.slskdClient.getDownloads();
      // transfers structure: Array of { username: string, directories: Array<{ files: Array<File> }> }

      for (const item of activeDownloads) {
        interface SlskdRemoteTransferFile {
          filename?: string;
          Filename?: string;
          id?: string;
          Id?: string;
          state?: string;
          State?: string;
          bytesTransferred?: number;
          BytesTransferred?: number;
          size?: number;
          Size?: number;
          averageSpeed?: number;
          AverageSpeed?: number;
          speed?: number;
          Speed?: number;
          [key: string]: unknown;
        }
        let remoteFile: SlskdRemoteTransferFile | null = null;

        // Traverse transfers to find file
        for (const userTransfer of transfers) {
          if (
            userTransfer.username !== item.username &&
            userTransfer.Username !== item.username
          )
            continue;

          const dirs =
            userTransfer.directories || userTransfer.Directories || [];
          for (const dir of dirs) {
            const files = dir.files || dir.Files || [];
            for (const file of files) {
              if (
                file.filename === item.filename ||
                file.Filename === item.filename ||
                (item.transferId &&
                  (file.id === item.transferId || file.Id === item.transferId))
              ) {
                remoteFile = file;
                break;
              }
            }
            if (remoteFile) break;
          }
          if (remoteFile) break;
        }

        if (remoteFile) {
          const state = remoteFile.state ?? remoteFile.State;
          const bytesTransferred =
            remoteFile.bytesTransferred ?? remoteFile.BytesTransferred ?? 0;
          const size = remoteFile.size ?? remoteFile.Size ?? 0;

          // Determine speed
          let speed = 0;
          const reportedSpeed =
            remoteFile.speed ??
            remoteFile.Speed ??
            remoteFile.averageSpeed ??
            remoteFile.AverageSpeed;

          const now = Date.now();
          const prev = this.transferMetrics.get(item.id);

          if (typeof reportedSpeed === "number" && reportedSpeed > 0) {
            speed = Math.round(reportedSpeed);
          } else if (
            prev &&
            now > prev.lastTime &&
            bytesTransferred >= prev.lastBytes
          ) {
            speed = calculateSpeed(
              bytesTransferred,
              prev.lastBytes,
              now - prev.lastTime,
            );
          }

          this.transferMetrics.set(item.id, {
            lastBytes: bytesTransferred,
            lastTime: now,
          });

          // Track progress activity for stalled transfer detection
          let progressRecord = this.lastActiveProgress.get(item.id);
          if (!progressRecord) {
            progressRecord = { bytes: bytesTransferred, timestamp: now };
            this.lastActiveProgress.set(item.id, progressRecord);
          } else if (bytesTransferred > progressRecord.bytes) {
            progressRecord.bytes = bytesTransferred;
            progressRecord.timestamp = now;
          }

          // Update metrics on item
          item.bytesTransferred = bytesTransferred;
          item.size = size;
          item.speed = speed;
          item.formattedSpeed = formatSpeed(speed);
          item.formattedSize = formatTransferProgress(bytesTransferred, size);

          item.progress =
            size > 0
              ? Math.min(100, Math.floor((bytesTransferred / size) * 100))
              : 0;

          const mappedStatus = mapSlskdStateToStatus(state);

          if (mappedStatus === "completed") {
            this.lastActiveProgress.delete(item.id);
            if (item.status !== "completed" && item.status !== "tagging") {
              this.handleCompletedDownload(item, remoteFile);
            }
          } else if (mappedStatus === "failed") {
            const failoverHandled = await this.triggerAutoFailover(
              item,
              state || "Remote peer aborted or disconnected",
            );
            if (!failoverHandled) {
              item.status = "failed";
              item.error = state || "Download failed";
              this.transferMetrics.delete(item.id);
              this.lastActiveProgress.delete(item.id);
              this.emitQueueUpdate();
              this.processQueue();
            }
          } else {
            const isStalled =
              item.status === "downloading" &&
              speed === 0 &&
              now - progressRecord.timestamp >= this.stalledTimeoutMs;

            if (isStalled) {
              const failoverHandled = await this.triggerAutoFailover(
                item,
                "Transfer speed dropped to 0 B/s for >30s",
              );
              if (!failoverHandled) {
                item.status = "failed";
                item.error = "Download stalled";
                this.transferMetrics.delete(item.id);
                this.lastActiveProgress.delete(item.id);
                this.emitQueueUpdate();
                this.processQueue();
              }
            } else {
              item.status = mappedStatus;
              this.emitQueueUpdate();
            }
          }

          if (!item.transferId && (remoteFile.id || remoteFile.Id)) {
            item.transferId = remoteFile.id || remoteFile.Id;
          }
        }
      }

      // Check if pending items can be started in newly available slots
      const pendingCount = Array.from(this.queue.values()).filter(
        (i) => i.status === "pending",
      ).length;
      if (pendingCount > 0) {
        this.processQueue();
      }
    } catch (e) {
      log.error("[QueueService] Monitor failed:", e);
    }
  }

  private async triggerAutoFailover(
    item: DownloadItem,
    reason: string,
  ): Promise<boolean> {
    const previousPeer = item.username;
    const appError = new AppError(
      "DOWNLOAD_STALLED",
      `Download stalled for ${item.id} (${item.track.name}) from @${previousPeer || "unknown"}: ${reason}`,
      undefined,
      {
        trackId: item.id,
        trackName: item.track.name,
        peer: previousPeer,
        transferId: item.transferId,
        reason,
      },
    );
    log.warn(`[QueueService] ${appError.message}`);

    const failedPeers =
      this.failedPeersPerTrack.get(item.id) || new Set<string>();
    if (previousPeer) {
      failedPeers.add(previousPeer.toLowerCase());
    }
    this.failedPeersPerTrack.set(item.id, failedPeers);

    // Cancel existing remote download on slskd
    if (item.username && item.transferId) {
      try {
        await this.slskdClient.cancelDownload(item.username, item.transferId);
      } catch (e) {
        log.debug(
          "[QueueService] Error cancelling existing remote transfer on failover:",
          e,
        );
      }
    }

    // Look for next best match among cached search results
    const cachedFiles = this.lastSearchResults.get(item.id) || [];
    const alternate = this.matchMaker.findNextBestMatch(
      item.track,
      cachedFiles,
      Array.from(failedPeers),
    );

    if (alternate) {
      log.info(
        `[QueueService] Auto-failover: Switching ${item.id} (${item.track.name}) to alternate peer @${alternate.username}`,
      );

      this.transferMetrics.delete(item.id);
      this.lastActiveProgress.set(item.id, {
        bytes: 0,
        timestamp: Date.now(),
      });

      item.status = "downloading";
      item.username = alternate.username;
      item.filename = alternate.filename;
      item.size = alternate.size;
      item.failoverPeer = alternate.username;
      item.progress = 0;
      item.bytesTransferred = 0;
      item.speed = 0;
      item.formattedSpeed = undefined;
      item.error = undefined;
      this.emitQueueUpdate();

      try {
        const response = await this.slskdClient.download(
          alternate.username,
          alternate.filename,
          alternate.size || 0,
        );
        if (Array.isArray(response) && response.length > 0) {
          item.transferId = response[0].id || response[0].Id;
        } else if (response && (response.id || response.Id)) {
          item.transferId = response.id || response.Id;
        }
        log.info(
          `[QueueService] Auto-failover download initiated for ${item.id} with transfer ID: ${item.transferId}`,
        );
        this.emitQueueUpdate();
        return true;
      } catch (e) {
        log.error(
          "[QueueService] Failed to start alternate download on failover:",
          e,
        );
        return this.triggerAutoFailover(
          item,
          "Alternate download command failed",
        );
      }
    }

    log.warn(
      `[QueueService] Auto-failover: No alternative sources available for ${item.id}`,
    );
    return false;
  }

  private async handleCompletedDownload(
    item: DownloadItem,
    remoteFile:
      | { id?: string; Id?: string; filename?: string; Filename?: string }
      | null
      | undefined,
  ) {
    item.status = "tagging";
    item.progress = 100;
    item.formattedSpeed = undefined;
    this.transferMetrics.delete(item.id);
    this.emitQueueUpdate();

    try {
      const downloadDir =
        this.preferencesService.getDownloadPath?.() ||
        this.preferencesService.getDefaultDownloadPath?.() ||
        "";
      const sourcePath = this.locateDownloadedFile(
        item,
        remoteFile,
        downloadDir,
      );

      if (sourcePath && existsSync(sourcePath)) {
        log.info(
          `[QueueService] Found completed file at: ${sourcePath}, starting enrichment...`,
        );
        const enableReplayGain =
          this.preferencesService.getPreferences?.().enableReplayGain ?? true;
        const result = await this.metadataService.organizeAndTag(
          sourcePath,
          item.track,
          downloadDir,
          {
            albumArtUrl: item.track.image || item.track.album?.images?.[0]?.url,
            trackNumber: item.track.track_number,
            year: item.track.year,
            enableReplayGain,
          },
        );
        item.targetPath = result.targetPath;
        item.filePath = result.targetPath;
        log.info(
          `[QueueService] Post-download enrichment complete: ${result.targetPath} (tagged: ${result.tagged})`,
        );
      } else {
        log.info(
          `[QueueService] Source file for ${item.track.name} not found on disk, resolving target path fallback`,
        );
        const extension = extname(item.filename || "") || ".mp3";
        const target = buildTargetFilePath({
          downloadDir,
          track: item.track,
          extension,
          trackNumber: item.track.track_number,
          year: item.track.year,
        });
        item.targetPath = target;
        item.filePath = target;
      }

      // Inspect audio container to verify format, bitrate & fake transcode integrity
      const verifiedPath = item.targetPath || item.filePath || sourcePath;
      if (verifiedPath && existsSync(verifiedPath)) {
        try {
          const formatInfo = await inspectAudioFile(verifiedPath);
          if (formatInfo) {
            try {
              const fileBuffer = readFileSync(verifiedPath);
              const integrity = verifyAudioIntegrity(
                fileBuffer,
                formatInfo.format,
                formatInfo.sampleRate,
                formatInfo.bitrate,
              );
              formatInfo.integrity = integrity.integrity;
              formatInfo.cutoffFrequency = integrity.cutoffFrequency;
            } catch {}

            item.formatInfo = formatInfo;
            log.info(
              `[QueueService] Audiophile stream verified for ${item.id}: ${formatInfo.format} ${formatInfo.sampleRate}Hz ${formatInfo.bitDepth ? formatInfo.bitDepth + "-bit" : ""} [integrity: ${formatInfo.integrity || "unverified"}]`,
            );
          }
        } catch (inspectErr) {
          log.warn(
            `[QueueService] Format inspection failed for ${item.id}:`,
            inspectErr,
          );
        }
      }
    } catch (err) {
      log.error(
        `[QueueService] Post-download processing failed for ${item.id}:`,
        err,
      );
    } finally {
      if (this.queue.has(item.id)) {
        item.status = "completed";
        this.emitQueueUpdate();
        this.checkAndExportCompletedPlaylists();
      }
      this.processQueue();
    }
  }

  private locateDownloadedFile(
    item: DownloadItem,
    remoteFile:
      | { id?: string; Id?: string; filename?: string; Filename?: string }
      | null
      | undefined,
    downloadDir: string,
  ): string | null {
    if (!downloadDir) return null;
    if (item.filePath && existsSync(item.filePath)) return item.filePath;
    if (item.targetPath && existsSync(item.targetPath)) return item.targetPath;

    const candidateFilenames: string[] = [];
    if (item.filename) candidateFilenames.push(item.filename);
    if (remoteFile?.filename) candidateFilenames.push(remoteFile.filename);
    if (remoteFile?.Filename) candidateFilenames.push(remoteFile.Filename);

    for (const rawName of candidateFilenames) {
      if (existsSync(rawName)) return rawName;

      const base = basename(rawName);
      const pathsToCheck = [
        join(downloadDir, rawName),
        join(downloadDir, base),
      ];
      if (item.username) {
        pathsToCheck.push(join(downloadDir, item.username, rawName));
        pathsToCheck.push(join(downloadDir, item.username, base));
      }

      for (const p of pathsToCheck) {
        if (existsSync(p)) return p;
      }
    }

    try {
      const base = item.filename ? basename(item.filename) : null;
      if (base) {
        const found = this.findFileRecursive(downloadDir, base);
        if (found) return found;
      }
    } catch (err) {
      log.debug("[QueueService] Recursive search error:", err);
    }

    return null;
  }

  private findFileRecursive(dir: string, filename: string): string | null {
    if (!existsSync(dir)) return null;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          const res = this.findFileRecursive(fullPath, filename);
          if (res) return res;
        } else if (
          entry.isFile() &&
          entry.name.toLowerCase() === filename.toLowerCase()
        ) {
          return fullPath;
        }
      }
    } catch {
      // Ignore directory read errors
    }
    return null;
  }
}
