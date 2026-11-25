import { DownloadItem } from "../../shared/types";
import { store } from "../store";
import log from "../utils/logger";

export interface QueueStoreInterface {
  get(key: "queue"): DownloadItem[] | undefined;
  set(key: "queue", value: DownloadItem[]): void;
}

export class QueuePersistence {
  private store: QueueStoreInterface;

  constructor(customStore?: QueueStoreInterface) {
    this.store = customStore || (store as unknown as QueueStoreInterface);
  }

  saveQueue(items: DownloadItem[]): void {
    try {
      this.store.set("queue", items);
    } catch (err) {
      log.error("[QueuePersistence] Failed to save queue:", err);
    }
  }

  loadQueue(): DownloadItem[] {
    try {
      const stored = this.store.get("queue") || [];
      return this.recoverQueueState(stored);
    } catch (err) {
      log.error("[QueuePersistence] Failed to load queue:", err);
      return [];
    }
  }

  recoverQueueState(items: DownloadItem[]): DownloadItem[] {
    return items.map((item) => {
      // Active transfers interrupted by an app exit or crash should transition cleanly to "paused"
      if (
        item.status === "downloading" ||
        item.status === "searching" ||
        item.status === "connecting" ||
        item.status === "queued" ||
        item.status === "tagging"
      ) {
        return {
          ...item,
          status: "paused",
          speed: undefined,
          formattedSpeed: undefined,
        };
      }
      return { ...item };
    });
  }

  clear(): void {
    try {
      this.store.set("queue", []);
    } catch (err) {
      log.error("[QueuePersistence] Failed to clear queue:", err);
    }
  }
}
