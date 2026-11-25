import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueuePersistence, QueueStoreInterface } from "./QueuePersistence";
import { DownloadItem } from "../../shared/types";

describe("QueuePersistence (Unit)", () => {
  let mockStore: QueueStoreInterface;
  let persistence: QueuePersistence;
  let storage: Record<string, unknown>;

  beforeEach(() => {
    storage = {};
    mockStore = {
      get: vi.fn((key: string) => storage[key] as never),
      set: vi.fn((key: string, val: unknown) => {
        storage[key] = val;
      }),
    };
    persistence = new QueuePersistence(mockStore);
  });

  const createDummyItem = (
    id: string,
    status: DownloadItem["status"],
  ): DownloadItem => ({
    id,
    track: {
      id,
      name: `Track ${id}`,
      artists: [{ name: "Test Artist" }],
      album: { name: "Test Album" },
      duration_ms: 180000,
    },
    status,
    progress: status === "completed" ? 100 : 45,
    speed: 512000,
    formattedSpeed: "500 KB/s",
    bytesTransferred: 2000000,
    size: 4000000,
  });

  it("serializes and saves queue items to store", () => {
    const items: DownloadItem[] = [
      createDummyItem("1", "pending"),
      createDummyItem("2", "completed"),
    ];

    persistence.saveQueue(items);

    expect(mockStore.set).toHaveBeenCalledWith("queue", items);
    expect(storage["queue"]).toEqual(items);
  });

  it("returns empty array when store has no queue saved", () => {
    const loaded = persistence.loadQueue();
    expect(loaded).toEqual([]);
  });

  it("recovers active transfers into paused state on startup/crash recovery", () => {
    const items: DownloadItem[] = [
      createDummyItem("1", "downloading"),
      createDummyItem("2", "searching"),
      createDummyItem("3", "tagging"),
      createDummyItem("4", "queued"),
      createDummyItem("5", "connecting"),
      createDummyItem("6", "completed"),
      createDummyItem("7", "failed"),
      createDummyItem("8", "paused"),
      createDummyItem("9", "pending"),
    ];
    storage["queue"] = items;

    const recovered = persistence.loadQueue();

    // Active items become paused with speed metrics cleared
    expect(recovered.find((i) => i.id === "1")?.status).toBe("paused");
    expect(recovered.find((i) => i.id === "1")?.speed).toBeUndefined();
    expect(recovered.find((i) => i.id === "1")?.formattedSpeed).toBeUndefined();

    expect(recovered.find((i) => i.id === "2")?.status).toBe("paused");
    expect(recovered.find((i) => i.id === "3")?.status).toBe("paused");
    expect(recovered.find((i) => i.id === "4")?.status).toBe("paused");
    expect(recovered.find((i) => i.id === "5")?.status).toBe("paused");

    // Terminal/idle items preserve their status
    expect(recovered.find((i) => i.id === "6")?.status).toBe("completed");
    expect(recovered.find((i) => i.id === "7")?.status).toBe("failed");
    expect(recovered.find((i) => i.id === "8")?.status).toBe("paused");
    expect(recovered.find((i) => i.id === "9")?.status).toBe("pending");
  });

  it("clears queue in store", () => {
    storage["queue"] = [createDummyItem("1", "completed")];
    persistence.clear();
    expect(mockStore.set).toHaveBeenCalledWith("queue", []);
    expect(storage["queue"]).toEqual([]);
  });

  it("gracefully handles read and write errors without throwing", () => {
    const throwingStore: QueueStoreInterface = {
      get: vi.fn(() => {
        throw new Error("Disk read failure");
      }),
      set: vi.fn(() => {
        throw new Error("Disk write failure");
      }),
    };
    const resilientPersistence = new QueuePersistence(throwingStore);

    expect(() => resilientPersistence.saveQueue([])).not.toThrow();
    expect(resilientPersistence.loadQueue()).toEqual([]);
    expect(() => resilientPersistence.clear()).not.toThrow();
  });
});
