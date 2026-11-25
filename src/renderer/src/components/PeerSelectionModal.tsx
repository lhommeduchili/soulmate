import { useEffect, useRef, useState } from "react";
import { DownloadItem, SlskdFile } from "../../../shared/types";
import { useI18n } from "../context/I18nContext";

interface Props {
  isOpen: boolean;
  item: DownloadItem | null;
  onClose: () => void;
  onSelectSource: (source: {
    username: string;
    filename: string;
    size?: number;
    bitRate?: number;
  }) => Promise<void>;
}

const focusableSelector = [
  'button:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "--";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatSpeed(speed?: number): string {
  if (!speed || speed <= 0) return "--";
  if (speed >= 1024 * 1024) {
    return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${Math.round(speed / 1024)} KB/s`;
}

function getFormatBadge(file: SlskdFile): {
  label: string;
  isLossless: boolean;
} {
  const lower = file.filename.toLowerCase();
  if (
    lower.endsWith(".flac") ||
    lower.endsWith(".wav") ||
    lower.endsWith(".aiff")
  ) {
    return { label: "FLAC", isLossless: true };
  }
  if (file.bitRate && file.bitRate >= 320) {
    return { label: `${file.bitRate} KBPS`, isLossless: false };
  }
  if (file.bitRate && file.bitRate > 0) {
    return { label: `${file.bitRate} KBPS`, isLossless: false };
  }
  return { label: "MP3", isLossless: false };
}

export function PeerSelectionModal({
  isOpen,
  item,
  onClose,
  onSelectSource,
}: Props): JSX.Element | null {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<SlskdFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const defaultQuery = item
    ? item.customQuery?.trim() ||
      `${item.track.artists?.[0]?.name || ""} ${item.track.name}`.trim()
    : "";

  useEffect(() => {
    if (!isOpen || !item) {
      setFiles([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setQuery(defaultQuery);

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    // Trigger initial search
    setIsLoading(true);
    setError(null);
    window.api.queue
      .searchSources({ id: item.id, query: defaultQuery })
      .then((res) => {
        setFiles(res.files || []);
      })
      .catch((err: unknown) => {
        console.error("[PeerSelectionModal] Search error:", err);
        setError(t("error.toast.failedAction"));
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      window.clearTimeout(timer);
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, item?.id, defaultQuery, t]);

  // Keyboard navigation & accessibility focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!item || !query.trim()) return;

    setIsLoading(true);
    setError(null);
    window.api.queue
      .searchSources({ id: item.id, query: query.trim() })
      .then((res) => {
        setFiles(res.files || []);
      })
      .catch((err: unknown) => {
        console.error("[PeerSelectionModal] Search error:", err);
        setError(t("error.toast.failedAction"));
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const handleSelect = async (file: SlskdFile) => {
    try {
      await onSelectSource({
        username: file.username,
        filename: file.filename,
        size: file.size,
        bitRate: file.bitRate,
      });
      onClose();
    } catch (err) {
      console.error("[PeerSelectionModal] Select source error:", err);
      setError(t("error.toast.failedAction"));
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="peer-modal-title"
        data-testid="peer-selection-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[85vh] flex flex-col bg-app-bg border border-app-line rounded-none font-mono text-xs overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-4 border-b border-app-border bg-app-surface">
          <div>
            <h2
              id="peer-modal-title"
              className="text-sm font-semibold text-soul-green flex items-center gap-2 lowercase tracking-wider"
            >
              <span>[//]</span>
              <span>{t("peerModal.title")}</span>
            </h2>
            <p className="text-[11px] text-app-text-dim mt-0.5 lowercase">
              {item.track.name} — {item.track.artists?.[0]?.name || "unknown"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("peerModal.close")}
            data-testid="peer-modal-close-btn"
            className="text-app-text-dim hover:text-soul-crimson transition-colors px-1.5 py-0.5 border border-transparent hover:border-soul-crimson/50 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
          >
            x
          </button>
        </div>

        {/* Query Adjustment Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="p-3 border-b border-app-border bg-app-bg flex gap-2 items-center"
        >
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("peerModal.searchPlaceholder")}
              data-testid="peer-search-input"
              aria-label={t("peerModal.searchPlaceholder")}
              className="w-full bg-app-surface border border-app-border focus:border-soul-green px-3 py-1.5 rounded-none text-app-text-main text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green placeholder:text-app-text-dim/50"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            data-testid="peer-search-submit-btn"
            className="px-3 py-1.5 bg-app-text-main hover:bg-soul-green text-app-bg border border-app-text-main hover:border-soul-green rounded-none text-xs font-semibold lowercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green shrink-0"
          >
            {isLoading ? "..." : t("peerModal.searchButton")}
          </button>
        </form>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="px-4 py-2 bg-soul-oxblood/50 border-b border-soul-crimson text-soul-red text-xs lowercase"
          >
            {error}
          </div>
        )}

        {/* Modal Body / Results Table */}
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-app-surface-hover scrollbar-track-transparent">
          {isLoading ? (
            <div
              className="flex flex-col items-center justify-center py-16 gap-3 text-soul-green"
              role="status"
            >
              <div className="w-5 h-5 border border-soul-green border-t-transparent rounded-none animate-spin"></div>
              <span className="text-xs lowercase tracking-wider animate-pulse">
                {t("peerModal.searching")}
              </span>
            </div>
          ) : files.length === 0 ? (
            <div
              className="text-center py-16 text-app-text-dim text-xs lowercase"
              role="status"
            >
              {t("peerModal.noResults")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-left border-collapse"
                aria-label={t("peerModal.title")}
              >
                <thead>
                  <tr className="border-b border-app-border text-[10px] lowercase text-app-text-dim tracking-wider">
                    <th scope="col" className="pb-2 pr-2">
                      {t("peerModal.peer")}
                    </th>
                    <th scope="col" className="pb-2 px-2">
                      {t("peerModal.speedQueue")}
                    </th>
                    <th scope="col" className="pb-2 px-2">
                      {t("peerModal.quality")}
                    </th>
                    <th scope="col" className="pb-2 px-2">
                      {t("peerModal.size")}
                    </th>
                    <th scope="col" className="pb-2 px-2">
                      {t("peerModal.filename")}
                    </th>
                    <th scope="col" className="pb-2 pl-2 text-right">
                      {t("peerModal.action")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border text-xs">
                  {files.map((file, idx) => {
                    const badge = getFormatBadge(file);
                    return (
                      <tr
                        key={`${file.username}-${file.filename}-${idx}`}
                        data-testid={`peer-row-${idx}`}
                        className="hover:bg-app-surface transition-colors group"
                      >
                        {/* Peer */}
                        <td className="py-2.5 pr-2 whitespace-nowrap text-app-text-main font-semibold">
                          <span
                            className="text-soul-green hover:underline cursor-default"
                            title={`soulseek peer: ${file.username}`}
                          >
                            @{file.username}
                          </span>
                        </td>

                        {/* Speed & Queue */}
                        <td className="py-2.5 px-2 whitespace-nowrap text-[11px] text-app-text-dim tabular-nums">
                          <div>{formatSpeed(file.speed)}</div>
                          <div className="text-[10px]">
                            {file.slotsFree ? (
                              <span className="text-soul-green">
                                slots free
                              </span>
                            ) : (
                              <span>queue: {file.queueLength}</span>
                            )}
                          </div>
                        </td>

                        {/* Quality / Bitrate */}
                        <td className="py-2.5 px-2 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded-none text-[10px] font-semibold border ${
                              badge.isLossless
                                ? "text-soul-green border-soul-green/50 bg-soul-green/5"
                                : "text-app-text-dim border-app-border bg-app-surface"
                            }`}
                          >
                            {badge.label}
                          </span>
                        </td>

                        {/* Size */}
                        <td className="py-2.5 px-2 whitespace-nowrap text-app-text-dim text-[11px] tabular-nums">
                          {formatBytes(file.size)}
                        </td>

                        {/* Filename */}
                        <td className="py-2.5 px-2 max-w-xs truncate text-[11px] text-app-text-muted">
                          <span title={file.filename}>{file.filename}</span>
                        </td>

                        {/* Download Action */}
                        <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleSelect(file)}
                            data-testid={`peer-download-btn-${idx}`}
                            aria-label={`${t("peerModal.downloadThisFile")} @${file.username}`}
                            className="px-2.5 py-1 bg-app-bg hover:bg-soul-green text-soul-green hover:text-app-bg border border-soul-green/50 hover:border-soul-green rounded-none text-[10px] font-semibold lowercase transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green"
                          >
                            [{t("peerModal.download")}]
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
