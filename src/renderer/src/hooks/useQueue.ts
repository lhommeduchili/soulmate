import { useState, useEffect, useCallback } from "react";
import {
  DownloadItem,
  Track,
  ExportPlaylistResult,
  SlskdFile,
} from "../../../shared/types";

export function useQueue() {
  const [queue, setQueue] = useState<DownloadItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    // Fetch initial queue state on mount (e.g. restored from persistence)
    window.api.queue
      .get()
      .then((initialQueue: DownloadItem[]) => {
        if (isMounted && Array.isArray(initialQueue)) {
          setQueue(initialQueue);
        }
      })
      .catch((err: unknown) => {
        console.error("[useQueue] initial queue fetch failed:", err);
      });

    // Queue updates via IPC
    const removeListener = window.api.queue.onUpdate(
      (updatedQueue: DownloadItem[]) => {
        if (isMounted) {
          setQueue(updatedQueue);
        }
      },
    );
    return () => {
      isMounted = false;
      removeListener();
    };
  }, []);

  const cancelDownload = useCallback((id: string) => {
    window.api.queue.cancel(id).catch((err: unknown) => {
      console.error("[useQueue] cancelDownload failed:", err);
    });
  }, []);

  const clearQueue = useCallback(() => {
    if (queue.length > 0) {
      setQueue([]);
      window.api.queue.clear().catch((err: unknown) => {
        console.error("[useQueue] clearQueue failed:", err);
      });
    }
  }, [queue]);

  const retryDownload = useCallback((id: string) => {
    window.api.queue.retry(id).catch((err: unknown) => {
      console.error("[useQueue] retryDownload failed:", err);
    });
  }, []);

  const openFolder = useCallback((filePath?: string) => {
    window.api.queue.openFolder(filePath).catch((err: unknown) => {
      console.error("[useQueue] openFolder failed:", err);
    });
  }, []);

  const exportPlaylist = useCallback(
    (options: {
      playlistName: string;
      tracks?: Track[];
      reveal?: boolean;
    }): Promise<ExportPlaylistResult> => {
      return window.api.queue.exportPlaylist(options);
    },
    [],
  );

  const pauseAll = useCallback(() => {
    window.api.queue.pauseAll().catch((err: unknown) => {
      console.error("[useQueue] pauseAll failed:", err);
    });
  }, []);

  const resumeAll = useCallback(() => {
    window.api.queue.resumeAll().catch((err: unknown) => {
      console.error("[useQueue] resumeAll failed:", err);
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status !== "completed"));
    window.api.queue
      .clearCompleted()
      .then((updatedQueue) => {
        if (Array.isArray(updatedQueue)) {
          setQueue(updatedQueue);
        }
      })
      .catch((err: unknown) => {
        console.error("[useQueue] clearCompleted failed:", err);
      });
  }, []);

  const retryWithQuery = useCallback(
    (id: string, customQuery: string): Promise<boolean> => {
      return window.api.queue
        .retryWithQuery({ id, customQuery })
        .catch((err: unknown) => {
          console.error("[useQueue] retryWithQuery failed:", err);
          return false;
        });
    },
    [],
  );

  const searchSources = useCallback(
    (
      id: string,
      query?: string,
    ): Promise<{ query: string; files: SlskdFile[] }> => {
      return window.api.queue.searchSources({ id, query });
    },
    [],
  );

  const selectSource = useCallback(
    (payload: {
      id: string;
      username: string;
      filename: string;
      size?: number;
      bitRate?: number;
    }): Promise<boolean> => {
      return window.api.queue.selectSource(payload);
    },
    [],
  );

  return {
    queue,
    cancelDownload,
    clearQueue,
    pauseAll,
    resumeAll,
    clearCompleted,
    retryDownload,
    retryWithQuery,
    searchSources,
    selectSource,
    openFolder,
    exportPlaylist,
  };
}
