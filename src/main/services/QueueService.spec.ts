import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueueService, formatPriorityToExtensions } from "./QueueService";
import { TracksArraySchema, TrackSchema } from "../../shared/schemas";
import { Track } from "../../shared/types";

// Mock electron
vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([
      {
        webContents: {
          send: vi.fn(),
        },
      },
    ]),
  },
  app: {
    getPath: vi.fn().mockReturnValue("/mock/downloads"),
    setPath: vi.fn(),
  },
}));

// Mock logger
vi.mock("../utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock store
vi.mock("../store", () => ({
  store: {
    get: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("Queue Compatibility & IPC Schema Validation", () => {
  let mockSlskdClient: any;
  let mockPreferencesService: any;
  let queueService: QueueService;

  beforeEach(() => {
    vi.useFakeTimers();

    mockSlskdClient = {
      search: vi.fn().mockResolvedValue({ id: "search_123" }),
      getSearchResults: vi.fn().mockResolvedValue({
        isComplete: true,
        files: [],
      }),
      download: vi.fn().mockResolvedValue([{ id: "download_123" }]),
      cancelDownload: vi.fn().mockResolvedValue(true),
      reconfigureOptions: vi.fn().mockResolvedValue(true),
    };

    mockPreferencesService = {
      getFormatPriority: vi
        .fn()
        .mockReturnValue(["aiff", "wav", "flac", "mp3"]),
      setFormatPriority: vi.fn(),
      getDownloadSpeedLimit: vi.fn().mockReturnValue(0),
    };

    queueService = new QueueService(mockSlskdClient, mockPreferencesService);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("TracksArraySchema Validation", () => {
    it("validates extracted Track objects from SpotifyService", () => {
      const validTracks: Track[] = [
        {
          id: "3XmwAZpIMNpTJy8faw3ajD",
          name: "expectations (feat. Chappell Roan)",
          artists: [{ name: "Olivia Rodrigo" }, { name: "Chappell Roan" }],
          album: {
            name: "expectations",
            id: "album_123",
            images: [{ url: "https://example.com/cover.jpg" }],
          },
          duration_ms: 223935,
          image: "https://example.com/cover.jpg",
          is_youtube: false,
        },
      ];

      const parsed = TracksArraySchema.parse(validTracks);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("3XmwAZpIMNpTJy8faw3ajD");
      expect(parsed[0].name).toBe("expectations (feat. Chappell Roan)");
      expect(parsed[0].artists).toEqual([
        { name: "Olivia Rodrigo" },
        { name: "Chappell Roan" },
      ]);

      const singleParsed = TrackSchema.parse(validTracks[0]);
      expect(singleParsed.id).toBe("3XmwAZpIMNpTJy8faw3ajD");
    });

    it("rejects invalid track payloads missing required fields", () => {
      const invalidPayload = [
        {
          id: "invalid_track",
          // missing name
          artists: "Not an array",
        },
      ];

      expect(() => TracksArraySchema.parse(invalidPayload)).toThrow();
    });
  });

  describe("QueueService HTML entity cleaning & query construction", () => {
    it("cleans and decodes HTML entities in track name and artist before queuing", async () => {
      const unescapedTracks: Track[] = [
        {
          id: "track_html_1",
          name: "Rock &amp;amp; Roll &quot;Live&quot;",
          artists: [{ name: "AC&amp;DC &amp; Guests" }],
          album: { name: "Live &amp; Loud" },
          duration_ms: 200000,
        },
      ];

      await queueService.processPlaylist(unescapedTracks);

      // Verify that slskdClient.search is called with clean decoded strings without &amp;
      expect(mockSlskdClient.search).toHaveBeenCalledWith(
        'AC&DC & Guests Rock & Roll "Live"',
      );
    });

    it("ensures Soulseek query has no &amp; or double escaping", async () => {
      const tracksWithEntities: Track[] = [
        {
          id: "track_guns",
          name: "Welcome To The Jungle",
          artists: [{ name: "Guns &amp; Roses" }],
          album: { name: "Appetite For Destruction" },
          duration_ms: 271000,
        },
      ];

      await queueService.processPlaylist(tracksWithEntities);

      expect(mockSlskdClient.search).toHaveBeenCalledWith(
        "Guns & Roses Welcome To The Jungle",
      );
      expect(mockSlskdClient.search).not.toHaveBeenCalledWith(
        expect.stringContaining("&amp;"),
      );
    });
  });

  describe("Telemetry Formatting & State Calculations", () => {
    it("formats speeds correctly across B/s, KB/s, MB/s, and GB/s", async () => {
      const { formatSpeed } = await import("../utils/telemetry");

      expect(formatSpeed(0)).toBe("");
      expect(formatSpeed(-100)).toBe("");
      expect(formatSpeed(undefined)).toBe("");
      expect(formatSpeed(null)).toBe("");
      expect(formatSpeed(512)).toBe("512 B/s");
      expect(formatSpeed(850 * 1024)).toBe("850 KB/s");
      expect(formatSpeed(1.5 * 1024 * 1024)).toBe("1.5 MB/s");
      expect(formatSpeed(2.4 * 1024 * 1024 * 1024)).toBe("2.4 GB/s");
    });

    it("formats byte sizes correctly", async () => {
      const { formatBytes } = await import("../utils/telemetry");

      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(-50)).toBe("0 B");
      expect(formatBytes(500)).toBe("500 B");
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(4.2 * 1024 * 1024)).toBe("4.2 MB");
      expect(formatBytes(1.2 * 1024 * 1024 * 1024)).toBe("1.2 GB");
    });

    it("formats transfer progress strings (transferred vs total)", async () => {
      const { formatTransferProgress } = await import("../utils/telemetry");

      expect(formatTransferProgress(0, 0)).toBe("");
      expect(formatTransferProgress(4404019, 11010048)).toBe(
        "4.2 MB / 10.5 MB",
      );
      expect(formatTransferProgress(500000, 0)).toBe("488.3 KB");
    });

    it("maps slskd transfer states to typed DownloadStatus", async () => {
      const { mapSlskdStateToStatus } = await import("../utils/telemetry");

      expect(mapSlskdStateToStatus("Completed")).toBe("completed");
      expect(mapSlskdStateToStatus("Succeeded")).toBe("completed");
      expect(mapSlskdStateToStatus("InProgress")).toBe("downloading");
      expect(mapSlskdStateToStatus("Downloading")).toBe("downloading");
      expect(mapSlskdStateToStatus("Queued")).toBe("queued");
      expect(mapSlskdStateToStatus("RemotelyQueued")).toBe("queued");
      expect(mapSlskdStateToStatus("Initializing")).toBe("connecting");
      expect(mapSlskdStateToStatus("Connecting")).toBe("connecting");
      expect(mapSlskdStateToStatus("Requested")).toBe("connecting");
      expect(mapSlskdStateToStatus("Aborted")).toBe("failed");
      expect(mapSlskdStateToStatus("Errored")).toBe("failed");
      expect(mapSlskdStateToStatus("Cancelled")).toBe("failed");
      expect(mapSlskdStateToStatus("TimedOut")).toBe("failed");
    });

    it("calculates transfer speed from byte differentials and elapsed time", async () => {
      const { calculateSpeed } = await import("../utils/telemetry");

      // 1 MB transferred in 1000 ms = 1048576 B/s
      expect(calculateSpeed(1048576, 0, 1000)).toBe(1048576);
      // 0 ms elapsed or negative delta -> 0
      expect(calculateSpeed(100, 100, 0)).toBe(0);
      expect(calculateSpeed(50, 100, 1000)).toBe(0);
    });
  });

  describe("QueueService Retry Handling", () => {
    it("returns false when retrying a non-existent queue item", async () => {
      const result = await queueService.retry("non-existent-id");
      expect(result).toBe(false);
    });

    it("resets failed item to pending and triggers queue processing", async () => {
      const testTrack: Track = {
        id: "retry-track-1",
        name: "Retry Song",
        artists: [{ name: "Retry Artist" }],
        album: { name: "Retry Album" },
        duration_ms: 180000,
      };

      // Ingest track first
      await queueService.processPlaylist([testTrack]);

      // Manually simulate a failure
      const item = (queueService as any).queue.get("retry-track-1");
      expect(item).toBeDefined();
      item.status = "failed";
      item.error = "No match found";
      item.username = "bad_peer";
      item.transferId = "transfer_fail_1";

      // Call retry
      const success = await queueService.retry("retry-track-1");
      expect(success).toBe(true);

      // Verify remote cancellation was attempted
      expect(mockSlskdClient.cancelDownload).toHaveBeenCalledWith(
        "bad_peer",
        "transfer_fail_1",
      );

      // Verify item state is reset to pending
      const retriedItem = (queueService as any).queue.get("retry-track-1");
      expect(retriedItem.status).toBe("searching"); // Immediately moves to searching during processQueue
      expect(retriedItem.error).toBeUndefined();
      expect(retriedItem.transferId).toBeUndefined();
    });
  });

  describe("Batch Pause/Resume, Clear Completed & Concurrency Limiting", () => {
    it("pauses active and pending downloads and cancels in-flight remote transfers", async () => {
      const tracks: Track[] = [
        {
          id: "track-p1",
          name: "Active Song",
          artists: [{ name: "Artist 1" }],
          album: { name: "Album 1" },
          duration_ms: 200000,
        },
        {
          id: "track-p2",
          name: "Pending Song",
          artists: [{ name: "Artist 2" }],
          album: { name: "Album 2" },
          duration_ms: 200000,
        },
      ];

      (queueService as any).queue.set("track-p1", {
        id: "track-p1",
        track: tracks[0],
        status: "downloading",
        username: "peer1",
        transferId: "tx-101",
        progress: 50,
      });

      (queueService as any).queue.set("track-p2", {
        id: "track-p2",
        track: tracks[1],
        status: "pending",
        progress: 0,
      });

      await queueService.pauseAll();

      expect(mockSlskdClient.cancelDownload).toHaveBeenCalledWith(
        "peer1",
        "tx-101",
      );
      expect((queueService as any).queue.get("track-p1")?.status).toBe(
        "paused",
      );
      expect((queueService as any).queue.get("track-p2")?.status).toBe(
        "paused",
      );
    });

    it("resumes paused downloads and transitions them back to pending and searching", async () => {
      const track: Track = {
        id: "track-resumed",
        name: "Paused Song",
        artists: [{ name: "Artist Resumed" }],
        album: { name: "Album Resumed" },
        duration_ms: 180000,
      };

      (queueService as any).queue.set("track-resumed", {
        id: "track-resumed",
        track,
        status: "paused",
        progress: 30,
      });

      await queueService.resumeAll();

      const item = (queueService as any).queue.get("track-resumed");
      expect(item?.status).toBe("searching");
    });

    it("clears completed items while leaving pending, paused, or failed items untouched", () => {
      const track1: Track = {
        id: "track-c1",
        name: "Completed Song",
        artists: [{ name: "Artist" }],
        album: { name: "Album" },
        duration_ms: 200000,
      };
      const track2: Track = {
        id: "track-c2",
        name: "Failed Song",
        artists: [{ name: "Artist" }],
        album: { name: "Album" },
        duration_ms: 200000,
      };

      (queueService as any).queue.set("track-c1", {
        id: "track-c1",
        track: track1,
        status: "completed",
        progress: 100,
      });
      (queueService as any).queue.set("track-c2", {
        id: "track-c2",
        track: track2,
        status: "failed",
        progress: 0,
      });

      queueService.clearCompleted();

      expect((queueService as any).queue.has("track-c1")).toBe(false);
      expect((queueService as any).queue.has("track-c2")).toBe(true);
    });

    it("enforces maxConcurrentDownloads limit", async () => {
      mockPreferencesService.getMaxConcurrentDownloads = vi
        .fn()
        .mockReturnValue(1);

      const tracks: Track[] = [
        {
          id: "track-lim-1",
          name: "Lim 1",
          artists: [{ name: "A1" }],
          album: { name: "Alb1" },
          duration_ms: 180000,
        },
        {
          id: "track-lim-2",
          name: "Lim 2",
          artists: [{ name: "A2" }],
          album: { name: "Alb2" },
          duration_ms: 180000,
        },
      ];

      await queueService.processPlaylist(tracks);

      // With limit 1, track 1 is searching/downloading and track 2 remains pending
      expect((queueService as any).queue.get("track-lim-1")?.status).toBe(
        "searching",
      );
      expect((queueService as any).queue.get("track-lim-2")?.status).toBe(
        "pending",
      );
    });

    it("restores previous queue state and recovers active items on startup", () => {
      const mockQueuePersistence = {
        loadQueue: vi.fn().mockReturnValue([
          {
            id: "recovered-track",
            track: {
              id: "recovered-track",
              name: "Recovered Song",
              artists: [{ name: "Artist" }],
              album: { name: "Album" },
              duration_ms: 200000,
            },
            status: "paused",
            progress: 60,
          },
        ]),
        saveQueue: vi.fn(),
        clear: vi.fn(),
        recoverQueueState: vi.fn(),
      };

      const restoredService = new QueueService(
        mockSlskdClient,
        mockPreferencesService,
        undefined,
        undefined,
        undefined,
        mockQueuePersistence as any,
      );

      expect(mockQueuePersistence.loadQueue).toHaveBeenCalled();
      expect(
        (restoredService as any).queue.get("recovered-track")?.status,
      ).toBe("paused");
      expect(restoredService.getQueue()).toHaveLength(1);
      expect(restoredService.getQueue()[0].id).toBe("recovered-track");
    });

    describe("Phase 12: Manual Query Tuning & Peer Selection", () => {
      it("retryWithQuery overrides search query and resets item state to pending", async () => {
        const track: Track = {
          id: "track-retry-q",
          name: "Original Title",
          artists: [{ name: "Artist" }],
          album: { name: "Album" },
          duration_ms: 180000,
        };

        (queueService as any).queue.set("track-retry-q", {
          id: "track-retry-q",
          track,
          status: "failed",
          progress: 0,
          error: "No match found",
        });

        const success = await queueService.retryWithQuery(
          "track-retry-q",
          "Artist Original Title Remastered FLAC",
        );

        expect(success).toBe(true);
        const item = (queueService as any).queue.get("track-retry-q");
        expect(item.customQuery).toBe("Artist Original Title Remastered FLAC");
        expect(item.error).toBeUndefined();
        // Since processQueue is triggered, status becomes searching or pending
        expect(["searching", "pending"]).toContain(item.status);
        expect(mockSlskdClient.search).toHaveBeenCalledWith(
          "Artist Original Title Remastered FLAC",
        );
      });

      it("searchSources queries SlskdClient and formats peer results", async () => {
        const track: Track = {
          id: "track-sources-1",
          name: "Deep House Vibe",
          artists: [{ name: "DJ Tech" }],
          album: { name: "Sessions" },
          duration_ms: 240000,
        };

        (queueService as any).queue.set("track-sources-1", {
          id: "track-sources-1",
          track,
          status: "failed",
          progress: 0,
        });

        mockSlskdClient.search.mockResolvedValueOnce({ id: "search_manual_1" });
        mockSlskdClient.getSearchResults.mockResolvedValueOnce({
          isComplete: true,
          responses: [
            {
              username: "soul_dj_99",
              uploadSpeed: 1048576,
              hasFreeSlots: true,
              queueLength: 0,
              files: [
                {
                  filename: "Music/DJ Tech - Deep House Vibe.flac",
                  bitRate: 1411,
                  size: 35000000,
                },
              ],
            },
          ],
        });

        const results = await queueService.searchSources(
          "track-sources-1",
          "DJ Tech Deep House Vibe",
        );

        expect(results.query).toBe("DJ Tech Deep House Vibe");
        expect(results.files).toHaveLength(1);
        expect(results.files[0].username).toBe("soul_dj_99");
        expect(results.files[0].filename).toBe(
          "Music/DJ Tech - Deep House Vibe.flac",
        );
        expect(results.files[0].bitRate).toBe(1411);
        expect(results.files[0].slotsFree).toBe(true);
      });

      it("selectSource immediately binds track to chosen peer and initiates download", async () => {
        const track: Track = {
          id: "track-manual-select",
          name: "Deep House Vibe",
          artists: [{ name: "DJ Tech" }],
          album: { name: "Sessions" },
          duration_ms: 240000,
        };

        (queueService as any).queue.set("track-manual-select", {
          id: "track-manual-select",
          track,
          status: "failed",
          progress: 0,
        });

        mockSlskdClient.download.mockResolvedValueOnce([
          { id: "transfer_manual_123" },
        ]);

        const success = await queueService.selectSource("track-manual-select", {
          username: "audiophile_peer",
          filename: "Lossless/DJ Tech - Deep House Vibe.flac",
          size: 45000000,
          bitRate: 1411,
        });

        expect(success).toBe(true);
        expect(mockSlskdClient.download).toHaveBeenCalledWith(
          "audiophile_peer",
          "Lossless/DJ Tech - Deep House Vibe.flac",
          45000000,
        );

        const item = (queueService as any).queue.get("track-manual-select");
        expect(item.status).toBe("downloading");
        expect(item.username).toBe("audiophile_peer");
        expect(item.filename).toBe("Lossless/DJ Tech - Deep House Vibe.flac");
        expect(item.size).toBe(45000000);
        expect(item.transferId).toBe("transfer_manual_123");
      });
    });

    describe("Phase 13: Query Cascade & Stalled Download Auto-Failover", () => {
      it("executes multi-tier query cascade when initial tier yields 0 matches and finds match on Tier 2", async () => {
        const track: Track = {
          id: "track-cascade-1",
          name: "expectations (feat. Chappell Roan)",
          artists: [{ name: "Olivia Rodrigo" }],
          album: { name: "expectations" },
          duration_ms: 220000,
        };

        mockPreferencesService.isAutoQueryCascadeEnabled = vi
          .fn()
          .mockReturnValue(true);

        mockSlskdClient.search
          .mockResolvedValueOnce({ id: "search_tier1" })
          .mockResolvedValueOnce({ id: "search_tier2" });

        mockSlskdClient.getSearchResults
          .mockResolvedValueOnce({
            isComplete: true,
            responses: [],
          })
          .mockResolvedValueOnce({
            isComplete: true,
            responses: [
              {
                username: "clean_peer",
                hasFreeSlots: true,
                queueLength: 0,
                files: [
                  {
                    filename: "Olivia Rodrigo - expectations.flac",
                    bitRate: 1000,
                    size: 30000000,
                  },
                ],
              },
            ],
          });

        mockSlskdClient.download.mockResolvedValueOnce([
          { id: "download_cascade_success" },
        ]);

        (queueService as any).addToQueue(track);
        (queueService as any).processQueue();

        // Advance timers through cascade attempts
        for (let i = 0; i < 5; i++) {
          await vi.advanceTimersByTimeAsync(1100);
        }

        expect(mockSlskdClient.search).toHaveBeenCalledWith(
          "Olivia Rodrigo expectations (feat. Chappell Roan)",
        );
        expect(mockSlskdClient.search).toHaveBeenCalledWith(
          "Olivia Rodrigo expectations",
        );

        const item = (queueService as any).queue.get("track-cascade-1");
        expect(item.status).toBe("downloading");
        expect(item.username).toBe("clean_peer");
        expect(item.filename).toBe("Olivia Rodrigo - expectations.flac");
      });

      it("transitions to failed when all cascade attempts return 0 matches", async () => {
        const track: Track = {
          id: "track-cascade-fail",
          name: "Obscure Underground Track (Club Mix)",
          artists: [{ name: "Rare DJ" }],
          album: { name: "White Label" },
          duration_ms: 300000,
        };

        mockPreferencesService.isAutoQueryCascadeEnabled = vi
          .fn()
          .mockReturnValue(true);

        mockSlskdClient.search.mockResolvedValue({ id: "search_fail" });
        mockSlskdClient.getSearchResults.mockResolvedValue({
          isComplete: true,
          responses: [],
        });

        (queueService as any).addToQueue(track);
        (queueService as any).processQueue();
        for (let i = 0; i < 65; i++) {
          await vi.advanceTimersByTimeAsync(1100);
        }

        const item = (queueService as any).queue.get("track-cascade-fail");
        expect(item.status).toBe("failed");
        expect(item.error).toBe("No match found");
      });

      it("triggers auto-failover to next best peer when active download stalls (>30s at 0 B/s)", async () => {
        const track: Track = {
          id: "track-stall-1",
          name: "Glue",
          artists: [{ name: "Bicep" }],
          album: { name: "Bicep" },
          duration_ms: 269000,
        };

        const item = {
          id: "track-stall-1",
          track,
          status: "downloading" as const,
          progress: 10,
          username: "stalled_user",
          filename: "Bicep - Glue.flac",
          transferId: "tx_stalled_1",
          bytesTransferred: 5000000,
          size: 35000000,
          speed: 0,
        };
        (queueService as any).queue.set("track-stall-1", item);

        // Prepopulate cached search results with backup peer
        (queueService as any).lastSearchResults.set("track-stall-1", [
          {
            filename: "Bicep - Glue.flac",
            bitRate: 1000,
            size: 35000000,
            username: "stalled_user",
            speed: 0,
            slotsFree: true,
            queueLength: 0,
          },
          {
            filename: "Bicep - Glue.flac",
            bitRate: 1000,
            size: 35000000,
            username: "fast_backup_user",
            speed: 1000000,
            slotsFree: true,
            queueLength: 0,
          },
        ]);

        queueService.setStalledTimeoutMs(1000);

        // Mock remote transfer reporting 0 speed and stalled bytes
        mockSlskdClient.getDownloads = vi.fn().mockResolvedValue([
          {
            username: "stalled_user",
            directories: [
              {
                files: [
                  {
                    id: "tx_stalled_1",
                    filename: "Bicep - Glue.flac",
                    state: "InProgress",
                    bytesTransferred: 5000000,
                    size: 35000000,
                    speed: 0,
                  },
                ],
              },
            ],
          },
        ]);

        mockSlskdClient.download.mockResolvedValueOnce([
          { id: "tx_failover_new" },
        ]);

        // First monitor pass records progress at t = 0
        await (queueService as any).monitorQueue();

        // Advance past stalled timeout (1200ms < 2000ms monitor interval)
        vi.advanceTimersByTime(1200);

        // Second monitor pass detects stalled transfer (> 1000ms at 0 B/s)
        await (queueService as any).monitorQueue();

        expect(mockSlskdClient.cancelDownload).toHaveBeenCalledWith(
          "stalled_user",
          "tx_stalled_1",
        );
        expect(mockSlskdClient.download).toHaveBeenCalledWith(
          "fast_backup_user",
          "Bicep - Glue.flac",
          35000000,
        );

        const updatedItem = (queueService as any).queue.get("track-stall-1");
        expect(updatedItem.status).toBe("downloading");
        expect(updatedItem.username).toBe("fast_backup_user");
        expect(updatedItem.failoverPeer).toBe("fast_backup_user");
        expect(updatedItem.transferId).toBe("tx_failover_new");
      });

      it("triggers auto-failover when remote peer aborts or disconnects", async () => {
        const track: Track = {
          id: "track-abort-1",
          name: "Glue",
          artists: [{ name: "Bicep" }],
          album: { name: "Bicep" },
          duration_ms: 269000,
        };

        const item = {
          id: "track-abort-1",
          track,
          status: "downloading" as const,
          progress: 50,
          username: "aborting_user",
          filename: "Bicep - Glue.flac",
          transferId: "tx_abort_1",
          bytesTransferred: 15000000,
          size: 30000000,
        };
        (queueService as any).queue.set("track-abort-1", item);

        (queueService as any).lastSearchResults.set("track-abort-1", [
          {
            filename: "Bicep - Glue.flac",
            bitRate: 1000,
            size: 30000000,
            username: "aborting_user",
            slotsFree: false,
            queueLength: 5,
          },
          {
            filename: "Bicep - Glue.flac",
            bitRate: 1000,
            size: 30000000,
            username: "reliable_backup",
            slotsFree: true,
            queueLength: 0,
          },
        ]);

        mockSlskdClient.getDownloads = vi.fn().mockResolvedValue([
          {
            username: "aborting_user",
            directories: [
              {
                files: [
                  {
                    id: "tx_abort_1",
                    filename: "Bicep - Glue.flac",
                    state: "Cancelled",
                    bytesTransferred: 15000000,
                    size: 30000000,
                  },
                ],
              },
            ],
          },
        ]);

        mockSlskdClient.download.mockResolvedValueOnce([
          { id: "tx_after_abort" },
        ]);

        await (queueService as any).monitorQueue();

        expect(mockSlskdClient.cancelDownload).toHaveBeenCalledWith(
          "aborting_user",
          "tx_abort_1",
        );
        expect(mockSlskdClient.download).toHaveBeenCalledWith(
          "reliable_backup",
          "Bicep - Glue.flac",
          30000000,
        );

        const updatedItem = (queueService as any).queue.get("track-abort-1");
        expect(updatedItem.status).toBe("downloading");
        expect(updatedItem.username).toBe("reliable_backup");
        expect(updatedItem.failoverPeer).toBe("reliable_backup");
      });
    });

    describe("Bandwidth Rate Limiting", () => {
      it("dynamically reconfigures slskd download speed limit", async () => {
        await queueService.applyBandwidthLimit(2000);
        expect(mockSlskdClient.reconfigureOptions).toHaveBeenCalledWith({
          limits: {
            transfer: {
              downloadSpeed: 2000,
            },
          },
        });

        await queueService.applyBandwidthLimit(0);
        expect(mockSlskdClient.reconfigureOptions).toHaveBeenCalledWith({
          limits: {
            transfer: {
              downloadSpeed: 0,
            },
          },
        });
      });

      it("reads default limit from preferencesService when limit argument is omitted", async () => {
        mockPreferencesService.getDownloadSpeedLimit.mockReturnValueOnce(500);
        await queueService.applyBandwidthLimit();
        expect(mockSlskdClient.reconfigureOptions).toHaveBeenCalledWith({
          limits: {
            transfer: {
              downloadSpeed: 500,
            },
          },
        });
      });
    });

    describe("Format Priority", () => {
      it("defaults to aiff, wav, flac, mp3 order", () => {
        expect(formatPriorityToExtensions("flac")).toEqual([
          "aiff",
          "wav",
          "flac",
          "mp3",
        ]);
        expect(formatPriorityToExtensions("any")).toEqual([
          "aiff",
          "wav",
          "flac",
          "mp3",
        ]);
        expect(queueService.getFormatPriority()).toEqual([
          "aiff",
          "wav",
          "flac",
          "mp3",
        ]);
      });

      it("retains custom format priority order updated via setFormatPriority", () => {
        queueService.setFormatPriority(["wav", "aiff", "flac", "mp3"]);
        expect(queueService.getFormatPriority()).toEqual([
          "wav",
          "aiff",
          "flac",
          "mp3",
        ]);
      });
    });
  });
});
