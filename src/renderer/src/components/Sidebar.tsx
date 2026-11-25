import { useState, useEffect, useRef } from "react";
import logo from "../assets/logo.png";
import { MatrixText } from "./MatrixText";
import { useQueue } from "../hooks/useQueue";
import { useI18n } from "../context/I18nContext";
import { useAudioPlayer } from "../context/AudioPlayerContext";
import { PeerSelectionModal } from "./PeerSelectionModal";
import { DownloadItem } from "../../../shared/types";

const ASCII_METER_LENGTH = 240;
const EMPTY_METER = "░".repeat(ASCII_METER_LENGTH);
const FILLED_METER = "█".repeat(ASCII_METER_LENGTH);

export function Sidebar(): JSX.Element {
  const { t } = useI18n();
  // --- Footer Logic ---
  const [footerText, setFooterText] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  const phrases = [
    t("sidebar.footer.madeWithLove"),
    t("sidebar.footer.byTeam"),
    t("sidebar.footer.coffee"),
  ];
  const TYPING_SPEED = 100;
  const DELETING_SPEED = 50;
  const PAUSE_DURATION = 2000;

  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 500);
    return () => clearInterval(cursorInterval);
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const handleTyping = () => {
      const currentPhrase = phrases[phraseIndex];
      if (isDeleting) {
        setFooterText((prev) => prev.slice(0, -1));
        if (footerText === "") {
          setIsDeleting(false);
          setPhraseIndex((prev) => (prev + 1) % phrases.length);
        }
      } else {
        setFooterText(currentPhrase.slice(0, footerText.length + 1));
        if (footerText === currentPhrase) {
          timer = setTimeout(() => setIsDeleting(true), PAUSE_DURATION);
          return;
        }
      }
    };
    timer = setTimeout(
      handleTyping,
      isDeleting ? DELETING_SPEED : TYPING_SPEED,
    );
    return () => clearTimeout(timer);
  }, [footerText, isDeleting, phraseIndex]);

  const handleFooterClick = () => {
    window.open("https://buymeacoffee.com/lhommeduchili", "_blank");
  };
  // --------------------

  if (
    typeof window !== "undefined" &&
    (window as unknown as { __simulateComponentCrash?: string })
      .__simulateComponentCrash === "sidebar"
  ) {
    throw new Error("Simulated Sidebar subsystem fault");
  }

  const {
    queue,
    cancelDownload,
    clearQueue,
    pauseAll,
    resumeAll,
    clearCompleted,
    retryDownload,
    retryWithQuery,
    selectSource,
    openFolder,
    exportPlaylist,
  } = useQueue();
  const { playTrack, currentTrack, isPlaying } = useAudioPlayer();

  const [peerModalItem, setPeerModalItem] = useState<DownloadItem | null>(null);
  const [editingQueryItemId, setEditingQueryItemId] = useState<string | null>(
    null,
  );
  const [editingQueryValue, setEditingQueryValue] = useState<string>("");
  const queryInputRef = useRef<HTMLInputElement>(null);
  const editQueryButtonsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const chooseSourceButtonsRef = useRef<Map<string, HTMLButtonElement>>(
    new Map(),
  );

  useEffect(() => {
    if (editingQueryItemId && queryInputRef.current) {
      queryInputRef.current.focus();
      queryInputRef.current.select();
    }
  }, [editingQueryItemId]);

  const startEditQuery = (item: DownloadItem) => {
    setEditingQueryItemId(item.id);
    setEditingQueryValue(
      item.customQuery?.trim() ||
        `${item.track.artists?.[0]?.name || ""} ${item.track.name}`.trim(),
    );
  };

  const cancelEditQuery = (id: string) => {
    setEditingQueryItemId(null);
    setEditingQueryValue("");
    const btn = editQueryButtonsRef.current.get(id);
    btn?.focus();
  };

  const commitEditQuery = async (id: string) => {
    const trimmed = editingQueryValue.trim();
    if (!trimmed) return;
    setEditingQueryItemId(null);
    await retryWithQuery(id, trimmed);
    const btn = editQueryButtonsRef.current.get(id);
    btn?.focus();
  };

  const handleQueryInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    id: string,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitEditQuery(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditQuery(id);
    }
  };

  const handleSelectSource = async (source: {
    username: string;
    filename: string;
    size?: number;
    bitRate?: number;
  }) => {
    if (!peerModalItem) return;
    await selectSource({
      id: peerModalItem.id,
      username: source.username,
      filename: source.filename,
      size: source.size,
      bitRate: source.bitRate,
    });
  };

  const completedItems = queue.filter((item) => item.status === "completed");
  const hasActiveOrPending = queue.some((i) =>
    [
      "pending",
      "searching",
      "connecting",
      "queued",
      "downloading",
      "tagging",
    ].includes(i.status),
  );
  const hasPaused = queue.some((i) => i.status === "paused");
  const handleRevealPlaylistManifest = () => {
    const item = completedItems[0];
    const playlistName =
      item?.playlistName || item?.track.album?.name || "Soulmate Playlist";
    const completedTracks = completedItems.map((i) => ({
      ...i.track,
      targetPath: i.targetPath,
      filePath: i.filePath,
    }));
    void exportPlaylist({
      playlistName,
      tracks: completedTracks,
      reveal: true,
    });
  };

  // Screen reader announcements for state transitions
  const [announcement, setAnnouncement] = useState("");
  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  const prevFailoverPeersRef = useRef<Map<string, string | undefined>>(
    new Map(),
  );

  useEffect(() => {
    const currentStatuses = new Map<string, string>();
    const currentFailovers = new Map<string, string | undefined>();
    for (const item of queue) {
      currentStatuses.set(item.id, item.status);
      currentFailovers.set(item.id, item.failoverPeer);

      const prevStatus = prevStatusesRef.current.get(item.id);
      if (prevStatus && prevStatus !== item.status) {
        if (item.status === "completed") {
          setAnnouncement(
            t("sidebar.announcedCompleted", { name: item.track.name }),
          );
        } else if (item.status === "tagging") {
          setAnnouncement(
            t("sidebar.announcedTagging", { name: item.track.name }),
          );
        } else if (item.status === "failed") {
          setAnnouncement(
            t("sidebar.announcedFailed", { name: item.track.name }),
          );
        } else if (item.status === "downloading") {
          setAnnouncement(
            t("sidebar.announcedDownloading", { name: item.track.name }),
          );
        } else if (item.status === "paused") {
          setAnnouncement(
            t("sidebar.announcedPaused", { name: item.track.name }),
          );
        }
      }

      const prevFailover = prevFailoverPeersRef.current.get(item.id);
      if (item.failoverPeer && item.failoverPeer !== prevFailover) {
        setAnnouncement(
          t("sidebar.failoverAnnounce", {
            name: item.track.name,
            peer: item.failoverPeer,
          }),
        );
      }
    }
    prevStatusesRef.current = currentStatuses;
    prevFailoverPeersRef.current = currentFailovers;
  }, [queue, t]);

  const handleCancel = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    cancelDownload(id);
  };

  const handleRetry = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    retryDownload(id);
  };

  return (
    <aside
      className="w-72 bg-app-bg flex flex-col h-screen border-r border-app-border overflow-hidden relative shrink-0"
      aria-label={t("sidebar.main")}
    >
      {/* Live Region for Screen Reader Announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Seamless macOS Traffic Light Drag Header */}
      <div className="app-drag pt-11 pb-4 px-4 border-b border-app-border shrink-0">
        <div className="font-editorial italic text-2xl tracking-tight text-app-text-main flex items-center gap-2.5 lowercase">
          <img
            src={logo}
            className="w-8 h-8 object-contain"
            alt={t("sidebar.logoAlt")}
          />
          <span>soulmate</span>
        </div>
      </div>

      {/* Nocturne ASCII Download Queue */}
      <div
        className="flex-1 px-4 pt-4 space-y-3 overflow-hidden flex flex-col"
        aria-label={t("sidebar.downloadQueueAria")}
      >
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] shrink-0">
          <h2 className="flex items-center gap-2 text-app-text-dim">
            <span>{t("sidebar.queue")}</span>
          </h2>
          <button
            type="button"
            onClick={clearQueue}
            disabled={queue.length === 0}
            className="text-app-text-dim hover:text-soul-crimson disabled:opacity-30 transition-colors p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
            aria-label={t("sidebar.clearQueue")}
            title={t("sidebar.clearQueue")}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>

        {/* Queue Action Toolbar */}
        {queue.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1.5 shrink-0 font-mono text-[10px]"
            data-testid="queue-toolbar"
          >
            <button
              type="button"
              onClick={hasPaused && !hasActiveOrPending ? resumeAll : pauseAll}
              disabled={!hasActiveOrPending && !hasPaused}
              data-testid={
                hasPaused && !hasActiveOrPending
                  ? "queue-resume-all"
                  : "queue-pause-all"
              }
              aria-label={
                hasPaused && !hasActiveOrPending
                  ? t("sidebar.resumeAll")
                  : t("sidebar.pauseAll")
              }
              className="flex-1 min-w-0 py-1 px-2 rounded-none border border-app-line bg-app-bg text-app-text-main hover:bg-app-text-main hover:text-app-bg disabled:opacity-35 disabled:hover:bg-app-bg disabled:hover:text-app-text-main uppercase tracking-wider font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green whitespace-nowrap"
            >
              {hasPaused && !hasActiveOrPending
                ? t("sidebar.resumeAll")
                : t("sidebar.pauseAll")}
            </button>

            <button
              type="button"
              onClick={clearCompleted}
              disabled={completedItems.length === 0}
              data-testid="queue-clear-completed"
              aria-label={t("sidebar.clearCompleted")}
              className="py-1 px-2 rounded-none border border-app-border hover:border-app-text-main text-app-text-muted hover:bg-app-text-main hover:text-app-bg disabled:opacity-35 disabled:hover:border-app-border disabled:hover:bg-transparent disabled:hover:text-app-text-muted uppercase tracking-wider font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green whitespace-nowrap"
            >
              {t("sidebar.clearCompleted")}
            </button>
          </div>
        )}

        {completedItems.length > 0 && (
          <div
            className="p-2 rounded-none border border-soul-green/40 bg-soul-green/5 text-xs font-mono flex items-center justify-between gap-2 shrink-0"
            data-testid="completed-playlist-banner"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-soul-green font-bold text-xs shrink-0">
                ♫
              </span>
              <span className="text-app-text-muted text-[10px] truncate lowercase">
                {t("sidebar.playlistManifestReady")}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRevealPlaylistManifest}
              data-testid="reveal-playlist-manifest"
              title={t("sidebar.revealManifest")}
              aria-label={t("sidebar.revealManifest")}
              className="text-soul-green hover:bg-soul-green hover:text-app-bg px-2 py-0.5 rounded-none border border-soul-green/50 text-[10px] font-bold uppercase transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green"
            >
              .m3u8
            </button>
          </div>
        )}

        <div
          className="space-y-3 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-app-surface-hover scrollbar-track-transparent pr-1 h-full pb-4"
          role="list"
        >
          {queue.length === 0 && (
            <div
              className="text-app-text-dim font-mono text-[10px] lowercase text-center pt-8"
              role="status"
            >
              {t("sidebar.empty")}
            </div>
          )}

          {queue.map((item, idx) => (
            <div
              key={item.id}
              data-testid={`queue-item-${item.id}`}
              className="font-mono text-xs space-y-1.5 group relative border-b border-app-border pb-3 last:border-b-0"
              role="listitem"
            >
              <div
                className={`flex justify-between items-center lowercase gap-2 ${
                  ["offline", "failed"].includes(item.status)
                    ? "text-soul-red"
                    : "text-app-text-main"
                }`}
              >
                <div className="relative overflow-hidden flex-1 min-w-0 group/text">
                  <div
                    className="truncate group-hover/text:animate-marquee whitespace-nowrap text-[11px]"
                    aria-label={`${item.track.name} by ${item.track.artists?.[0]?.name || "Unknown"}`}
                  >
                    <MatrixText
                      text={`${item.track.artists?.[0]?.name || "Unknown"} - ${item.track.name}`}
                      delay={idx * 200}
                    />
                  </div>
                </div>
                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={(e) => handleCancel(e, item.id)}
                  className="text-app-text-dim hover:text-soul-crimson opacity-50 focus:opacity-100 group-hover:opacity-100 transition-colors text-[11px] px-1 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
                  aria-label={t("sidebar.cancel", { name: item.track.name })}
                >
                  x
                </button>
              </div>

              {["offline", "failed"].includes(item.status) ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-soul-crimson font-semibold tracking-wider">
                      {item.status === "failed"
                        ? t("sidebar.notFound")
                        : t("sidebar.offline")}
                    </span>
                    {item.status === "failed" && (
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        <button
                          type="button"
                          onClick={(e) => handleRetry(e, item.id)}
                          className="text-soul-green hover:bg-soul-green hover:text-app-bg uppercase text-[9px] font-mono tracking-wider focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green px-1 py-0.5 border border-soul-green/40 transition-colors"
                          aria-label={t("sidebar.retryAria", {
                            name: item.track.name,
                          })}
                        >
                          [{t("sidebar.retry")}]
                        </button>
                        <button
                          type="button"
                          ref={(el) => {
                            if (el)
                              editQueryButtonsRef.current.set(item.id, el);
                            else editQueryButtonsRef.current.delete(item.id);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditQuery(item);
                          }}
                          data-testid={`edit-query-${item.id}`}
                          className="text-app-text-muted hover:text-app-bg hover:bg-app-text-main uppercase text-[9px] font-mono tracking-wider focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green px-1 py-0.5 border border-app-border transition-colors"
                          aria-label={t("sidebar.editQueryAria", {
                            name: item.track.name,
                          })}
                        >
                          [{t("sidebar.editQuery")}]
                        </button>
                        <button
                          type="button"
                          ref={(el) => {
                            if (el)
                              chooseSourceButtonsRef.current.set(item.id, el);
                            else chooseSourceButtonsRef.current.delete(item.id);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPeerModalItem(item);
                          }}
                          data-testid={`choose-source-${item.id}`}
                          className="text-soul-cyan hover:text-app-bg hover:bg-soul-cyan uppercase text-[9px] font-mono tracking-wider focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green px-1 py-0.5 border border-soul-cyan/40 transition-colors"
                          aria-label={t("sidebar.chooseSourceAria", {
                            name: item.track.name,
                          })}
                        >
                          [{t("sidebar.chooseSource")}]
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Inline Query Editor */}
                  {editingQueryItemId === item.id && (
                    <div
                      data-testid={`query-tuning-form-${item.id}`}
                      className="p-1.5 bg-app-surface border border-app-line rounded-none space-y-1.5"
                    >
                      <input
                        ref={queryInputRef}
                        type="text"
                        value={editingQueryValue}
                        onChange={(e) => setEditingQueryValue(e.target.value)}
                        onKeyDown={(e) => handleQueryInputKeyDown(e, item.id)}
                        data-testid={`query-input-${item.id}`}
                        aria-label={t("sidebar.editQueryAria", {
                          name: item.track.name,
                        })}
                        className="w-full bg-app-bg border border-app-border focus:border-soul-green px-1.5 py-1 text-[10px] rounded-none text-app-text-main focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green"
                      />
                      <div className="flex justify-end gap-1.5 text-[9px]">
                        <button
                          type="button"
                          onClick={() => cancelEditQuery(item.id)}
                          data-testid={`query-cancel-btn-${item.id}`}
                          className="text-app-text-dim hover:text-soul-crimson px-1.5 py-0.5 rounded-none border border-app-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green"
                        >
                          {t("sidebar.cancelQuery")}
                        </button>
                        <button
                          type="button"
                          onClick={() => commitEditQuery(item.id)}
                          data-testid={`query-save-btn-${item.id}`}
                          className="text-app-bg bg-app-text-main hover:bg-soul-green font-bold px-1.5 py-0.5 rounded-none border border-app-text-main focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green"
                        >
                          {t("sidebar.saveQuery")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Critical Nocturne / Transformer ASCII Progress Bar */}
                  <div
                    className="w-full overflow-hidden"
                    data-testid={`ascii-progress-${item.id}`}
                    aria-hidden="true"
                  >
                    <span className="ascii-meter-text">
                      <span className="ascii-meter-empty">{EMPTY_METER}</span>
                      <span
                        className="ascii-meter-filled"
                        style={{
                          inlineSize: `${Math.max(0, Math.min(100, Math.floor(item.progress)))}%`,
                        }}
                      >
                        {FILLED_METER}
                      </span>
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {/* Failover Telemetry Badge */}
                    {item.failoverPeer && (
                      <div className="flex items-center pt-0.5">
                        <span
                          data-testid={`failover-badge-${item.id}`}
                          title={t("sidebar.failoverBadge", {
                            peer: item.failoverPeer,
                          })}
                          className="px-1 py-0.2 rounded-none text-[8px] font-semibold border border-soul-crimson/60 bg-soul-oxblood/40 text-soul-red shrink-0 uppercase font-mono"
                        >
                          {t("sidebar.failoverBadge", {
                            peer: item.failoverPeer,
                          })}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-[10px] text-app-text-dim">
                      {/* Active Peer or Status Label */}
                      <div className="truncate max-w-[175px] text-[10px] font-mono">
                        {item.status === "downloading" && item.username ? (
                          <span
                            className="text-app-text-muted hover:text-soul-green transition-colors"
                            title={t("sidebar.peer", {
                              username: item.username,
                            })}
                          >
                            @{item.username}
                          </span>
                        ) : item.status === "connecting" ? (
                          <span className="text-soul-cyan animate-pulse">
                            {t("sidebar.connecting")}
                          </span>
                        ) : item.status === "searching" ? (
                          <span className="text-soul-green animate-pulse">
                            {item.searchAttempt && item.searchAttempt > 1
                              ? t("sidebar.searchingAttempt", {
                                  attempt: item.searchAttempt,
                                  total: 3,
                                })
                              : t("sidebar.searching")}
                          </span>
                        ) : item.status === "queued" ? (
                          <div className="flex items-center gap-1">
                            <span>{t("sidebar.queued")}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPeerModalItem(item);
                              }}
                              data-testid={`choose-source-${item.id}`}
                              className="text-soul-cyan hover:bg-soul-cyan hover:text-app-bg uppercase text-[8px] font-mono tracking-wider focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green rounded-none px-0.5 transition-colors"
                              aria-label={t("sidebar.chooseSourceAria", {
                                name: item.track.name,
                              })}
                            >
                              [{t("sidebar.chooseSource")}]
                            </button>
                          </div>
                        ) : item.status === "tagging" ? (
                          <span className="text-soul-cyan animate-pulse">
                            {t("sidebar.tagging")}
                          </span>
                        ) : item.status === "paused" ? (
                          <div className="flex items-center gap-1">
                            <span className="text-soul-red font-semibold">
                              {t("sidebar.paused")}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPeerModalItem(item);
                              }}
                              data-testid={`choose-source-${item.id}`}
                              className="text-soul-cyan hover:bg-soul-cyan hover:text-app-bg uppercase text-[8px] font-mono tracking-wider focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green rounded-none px-0.5 transition-colors"
                              aria-label={t("sidebar.chooseSourceAria", {
                                name: item.track.name,
                              })}
                            >
                              [{t("sidebar.chooseSource")}]
                            </button>
                          </div>
                        ) : item.status === "completed" ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-soul-green font-semibold">
                              {t("sidebar.complete")}
                            </span>
                            {/* Audiophile Verified Format Badge */}
                            {item.formatInfo && (
                              <span
                                data-testid={`format-badge-${item.id}`}
                                title={
                                  item.formatInfo.format === "FLAC"
                                    ? `${item.formatInfo.bitDepth}-bit / ${(item.formatInfo.sampleRate / 1000).toFixed(item.formatInfo.sampleRate % 1000 === 0 ? 0 : 1)}kHz FLAC`
                                    : `${item.formatInfo.bitrate} kbps MP3`
                                }
                                aria-label={
                                  item.formatInfo.format === "FLAC"
                                    ? `${item.formatInfo.bitDepth}-bit / ${(item.formatInfo.sampleRate / 1000).toFixed(item.formatInfo.sampleRate % 1000 === 0 ? 0 : 1)}kHz FLAC`
                                    : `${item.formatInfo.bitrate} kbps MP3`
                                }
                                className="px-1 py-0.2 rounded-none text-[8px] font-semibold border border-soul-green/50 bg-soul-green/5 text-soul-green shrink-0 uppercase"
                              >
                                {item.formatInfo.format === "FLAC"
                                  ? `[${item.formatInfo.bitDepth || 16}-BIT / ${(item.formatInfo.sampleRate / 1000).toFixed(item.formatInfo.sampleRate % 1000 === 0 ? 0 : 1)}kHz]`
                                  : item.formatInfo.isVbr
                                    ? `[VBR ~${item.formatInfo.bitrate}K]`
                                    : `[${item.formatInfo.bitrate} KBPS]`}
                              </span>
                            )}
                            {/* Camelot Key / BPM Badge */}
                            {(item.formatInfo?.camelotKey ||
                              item.formatInfo?.bpm) && (
                              <span
                                data-testid={`camelot-badge-${item.id}`}
                                title={t("track.camelotBadgeTitle", {
                                  key: item.formatInfo.camelotKey || "Unknown",
                                  bpm: item.formatInfo.bpm || "Unknown",
                                })}
                                aria-label={t("track.camelotBadgeAria", {
                                  key: item.formatInfo.camelotKey || "Unknown",
                                  bpm: item.formatInfo.bpm || "Unknown",
                                })}
                                className="px-1 py-0.2 rounded-none text-[8px] font-semibold border border-soul-cyan/40 bg-soul-cyan/5 text-soul-cyan shrink-0 uppercase"
                              >
                                {item.formatInfo.camelotKey &&
                                item.formatInfo.bpm
                                  ? `[${item.formatInfo.camelotKey} / ${item.formatInfo.bpm} BPM]`
                                  : item.formatInfo.camelotKey
                                    ? `[${item.formatInfo.camelotKey}]`
                                    : `[${item.formatInfo.bpm} BPM]`}
                              </span>
                            )}
                            {/* Fake Lossless Transcode Warning Badge */}
                            {item.formatInfo?.integrity ===
                              "suspect_transcode" && (
                              <span
                                data-testid={`transcode-warning-${item.id}`}
                                title={t("track.transcodeWarningTooltip", {
                                  cutoff: Math.round(
                                    (item.formatInfo.cutoffFrequency || 16000) /
                                      1000,
                                  ),
                                })}
                                aria-label={t("track.transcodeWarningTooltip", {
                                  cutoff: Math.round(
                                    (item.formatInfo.cutoffFrequency || 16000) /
                                      1000,
                                  ),
                                })}
                                className="px-1 py-0.2 rounded-none text-[8px] font-semibold border border-soul-crimson/70 bg-soul-oxblood/40 text-soul-red shrink-0 uppercase font-mono"
                              >
                                {t("track.transcodeWarning", {
                                  cutoff: Math.round(
                                    (item.formatInfo.cutoffFrequency || 16000) /
                                      1000,
                                  ),
                                })}
                              </span>
                            )}
                            {/* Preview Track Audition */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                playTrack({
                                  id: item.id,
                                  title: item.track.name,
                                  artist:
                                    item.track.artists?.[0]?.name || "Unknown",
                                  filePath:
                                    item.targetPath || item.filePath || "",
                                  formatInfo: item.formatInfo,
                                });
                              }}
                              className={`p-0.5 rounded-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green ${
                                currentTrack?.id === item.id && isPlaying
                                  ? "text-soul-green font-bold animate-pulse"
                                  : "text-app-text-dim hover:text-soul-green"
                              }`}
                              title={
                                currentTrack?.id === item.id && isPlaying
                                  ? t("player.pause")
                                  : t("player.play")
                              }
                              aria-label={
                                currentTrack?.id === item.id && isPlaying
                                  ? t("player.pause")
                                  : t("player.play")
                              }
                              data-testid={`preview-track-${item.id}`}
                            >
                              {currentTrack?.id === item.id && isPlaying
                                ? "⏸"
                                : "▶"}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openFolder(item.targetPath || item.filePath);
                              }}
                              className="text-app-text-dim hover:text-soul-green transition-colors p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green rounded-none"
                              title={t("sidebar.revealInFolder")}
                              aria-label={t("sidebar.revealInFolderAria", {
                                name: item.track.name,
                              })}
                              data-testid={`reveal-in-folder-${item.id}`}
                            >
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                                />
                              </svg>
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {/* Speed & Percentage */}
                      <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                        {item.status === "downloading" &&
                          item.formattedSpeed && (
                            <span className="text-soul-green font-semibold">
                              {item.formattedSpeed}
                            </span>
                          )}
                        {item.status === "downloading" && (
                          <span className="tabular-nums text-app-text-main">
                            {Math.floor(item.progress)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Size (e.g. 4.2 MB / 10.5 MB) */}
                    {item.formattedSize &&
                      (item.status === "downloading" ||
                        item.status === "completed") && (
                        <div className="text-right text-[9px] font-mono text-app-text-dim tabular-nums">
                          {item.formattedSize}
                        </div>
                      )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 border-t border-app-border flex items-center justify-center shrink-0">
        <button
          type="button"
          onClick={handleFooterClick}
          aria-label={t("sidebar.footer.link")}
          className="text-[11px] text-soul-green/80 font-mono text-center lowercase cursor-pointer hover:text-soul-green transition-colors h-4 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green"
        >
          <span>{footerText}</span>
          <span
            className={`${cursorVisible ? "opacity-100" : "opacity-0"} ml-0.5`}
          >
            █
          </span>
        </button>
      </div>

      {/* Peer Source Selection Modal */}
      <PeerSelectionModal
        isOpen={!!peerModalItem}
        item={peerModalItem}
        onClose={() => setPeerModalItem(null)}
        onSelectSource={handleSelectSource}
      />
    </aside>
  );
}
