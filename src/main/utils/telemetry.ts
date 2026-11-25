import { DownloadStatus } from "../../shared/types";

/**
 * Format bytes per second into human-readable transfer rate (e.g., "850 KB/s", "1.5 MB/s")
 */
export function formatSpeed(bytesPerSec: number | undefined | null): string {
  if (
    bytesPerSec === undefined ||
    bytesPerSec === null ||
    !Number.isFinite(bytesPerSec) ||
    bytesPerSec <= 0
  ) {
    return "";
  }

  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;

  if (bytesPerSec < KB) {
    return `${Math.round(bytesPerSec)} B/s`;
  }
  if (bytesPerSec < MB) {
    return `${Math.round(bytesPerSec / KB)} KB/s`;
  }
  if (bytesPerSec < GB) {
    return `${(bytesPerSec / MB).toFixed(1)} MB/s`;
  }
  return `${(bytesPerSec / GB).toFixed(1)} GB/s`;
}

/**
 * Format byte count into human-readable size (e.g., "4.2 MB", "10.5 MB")
 */
export function formatBytes(bytes: number | undefined | null): string {
  if (
    bytes === undefined ||
    bytes === null ||
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "0 B";
  }

  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;

  if (bytes < KB) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < MB) {
    return `${(bytes / KB).toFixed(1)} KB`;
  }
  if (bytes < GB) {
    return `${(bytes / MB).toFixed(1)} MB`;
  }
  return `${(bytes / GB).toFixed(1)} GB`;
}

/**
 * Format transferred bytes vs total file size (e.g. "4.2 MB / 10.5 MB")
 */
export function formatTransferProgress(
  transferred: number | undefined | null,
  total: number | undefined | null,
): string {
  if (!total || total <= 0) {
    if (transferred && transferred > 0) {
      return formatBytes(transferred);
    }
    return "";
  }

  const formattedTransferred = formatBytes(transferred || 0);
  const formattedTotal = formatBytes(total);
  return `${formattedTransferred} / ${formattedTotal}`;
}

/**
 * Map slskd transfer state strings to typed DownloadStatus
 */
export function mapSlskdStateToStatus(
  state: string | undefined | null,
): DownloadStatus {
  if (!state) return "downloading";

  const normalized = state.trim().toLowerCase();

  switch (normalized) {
    case "completed":
    case "succeeded":
    case "finished":
      return "completed";

    case "inprogress":
    case "downloading":
      return "downloading";

    case "queued":
    case "locallyqueued":
    case "remotelyqueued":
    case "waiting":
      return "queued";

    case "initializing":
    case "connecting":
    case "requested":
    case "starting":
      return "connecting";

    case "aborted":
    case "errored":
    case "cancelled":
    case "canceled":
    case "rejected":
    case "timedout":
    case "failed":
      return "failed";

    default:
      return "downloading";
  }
}

/**
 * Calculate download speed in bytes/sec given byte diff and elapsed milliseconds
 */
export function calculateSpeed(
  currentBytes: number,
  lastBytes: number,
  deltaTimeMs: number,
): number {
  if (deltaTimeMs <= 0 || currentBytes < lastBytes) {
    return 0;
  }
  const deltaBytes = currentBytes - lastBytes;
  return Math.round((deltaBytes / deltaTimeMs) * 1000);
}
