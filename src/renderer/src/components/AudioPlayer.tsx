import { useEffect, useRef } from "react";
import { useAudioPlayer } from "../context/AudioPlayerContext";
import { useI18n } from "../context/I18nContext";

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer(): JSX.Element | null {
  const { t } = useI18n();
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    audioError,
    announcement,
    togglePlay,
    stopTrack,
    seek,
    setVolume,
  } = useAudioPlayer();

  const playPauseButtonRef = useRef<HTMLButtonElement | null>(null);

  // Keyboard shortcut listeners (Space = play/pause, Escape = dismiss/stop)
  useEffect(() => {
    if (!currentTrack) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (event.code === "Space" && !isInput) {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "Escape") {
        event.preventDefault();
        stopTrack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTrack, togglePlay, stopTrack]);

  if (!currentTrack) return null;

  return (
    <div
      data-testid="audio-preview-player"
      role="region"
      aria-label="Audio preview player"
      className="fixed bottom-0 inset-x-0 z-40 bg-app-bg/95 backdrop-blur-sm border-t border-app-line px-4 py-2 font-mono text-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-app-text-main"
    >
      {/* Live Region for Screen Reader Announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Track Info */}
      <div className="flex items-center gap-2 min-w-0 max-w-full sm:max-w-xs">
        <span
          className={`text-soul-green text-sm shrink-0 ${
            isPlaying ? "animate-pulse" : ""
          }`}
          aria-hidden="true"
        >
          ♫
        </span>
        <div className="min-w-0 truncate">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-soul-green text-xs truncate lowercase">
              {currentTrack.title}
            </span>
            {currentTrack.formatInfo && (
              <span
                data-testid="player-format-badge"
                className="px-1 py-0.2 rounded-none text-[8px] font-semibold border border-soul-green/50 bg-soul-green/5 text-soul-green shrink-0 uppercase"
              >
                {currentTrack.formatInfo.format === "FLAC"
                  ? `[${currentTrack.formatInfo.bitDepth || 16}-BIT / ${(currentTrack.formatInfo.sampleRate / 1000).toFixed(currentTrack.formatInfo.sampleRate % 1000 === 0 ? 0 : 1)}kHz]`
                  : currentTrack.formatInfo.isVbr
                    ? `[VBR ~${currentTrack.formatInfo.bitrate}K]`
                    : `[${currentTrack.formatInfo.bitrate} KBPS]`}
              </span>
            )}
            {(currentTrack.formatInfo?.camelotKey ||
              currentTrack.formatInfo?.bpm) && (
              <span
                data-testid="player-camelot-badge"
                title={t("track.camelotBadgeTitle", {
                  key: currentTrack.formatInfo.camelotKey || "Unknown",
                  bpm: currentTrack.formatInfo.bpm || "Unknown",
                })}
                aria-label={t("track.camelotBadgeAria", {
                  key: currentTrack.formatInfo.camelotKey || "Unknown",
                  bpm: currentTrack.formatInfo.bpm || "Unknown",
                })}
                className="px-1 py-0.2 rounded-none text-[8px] font-semibold border border-soul-cyan/40 bg-soul-cyan/5 text-soul-cyan shrink-0 uppercase"
              >
                {currentTrack.formatInfo.camelotKey &&
                currentTrack.formatInfo.bpm
                  ? `[${currentTrack.formatInfo.camelotKey} / ${currentTrack.formatInfo.bpm} BPM]`
                  : currentTrack.formatInfo.camelotKey
                    ? `[${currentTrack.formatInfo.camelotKey}]`
                    : `[${currentTrack.formatInfo.bpm} BPM]`}
              </span>
            )}
            {currentTrack.formatInfo?.integrity === "suspect_transcode" && (
              <span
                data-testid="player-transcode-warning"
                title={t("track.transcodeWarningTooltip", {
                  cutoff: Math.round(
                    (currentTrack.formatInfo.cutoffFrequency || 16000) / 1000,
                  ),
                })}
                aria-label={t("track.transcodeWarningTooltip", {
                  cutoff: Math.round(
                    (currentTrack.formatInfo.cutoffFrequency || 16000) / 1000,
                  ),
                })}
                className="px-1 py-0.2 rounded-none text-[8px] font-semibold border border-soul-crimson/70 bg-soul-oxblood/40 text-soul-red shrink-0 uppercase font-mono"
              >
                {t("track.transcodeWarning", {
                  cutoff: Math.round(
                    (currentTrack.formatInfo.cutoffFrequency || 16000) / 1000,
                  ),
                })}
              </span>
            )}
          </div>

          <div className="text-[10px] text-app-text-dim truncate lowercase">
            {currentTrack.artist}
          </div>
        </div>
      </div>

      {/* Main Transport & Scrubber */}
      <div className="flex-1 max-w-xl flex items-center gap-3 w-full">
        {/* Play/Pause Toggle */}
        <button
          ref={playPauseButtonRef}
          type="button"
          onClick={togglePlay}
          data-testid="player-play-pause"
          aria-label={isPlaying ? t("player.pause") : t("player.play")}
          className="w-7 h-7 rounded-none border border-soul-green/60 text-soul-green hover:bg-soul-green hover:text-app-bg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green shrink-0"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        {/* Stop Button */}
        <button
          type="button"
          onClick={stopTrack}
          data-testid="player-stop"
          aria-label={t("player.stop")}
          className="w-7 h-7 rounded-none border border-app-border hover:border-soul-crimson hover:text-soul-crimson text-app-text-dim flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green shrink-0 text-xs"
        >
          ■
        </button>

        {/* Elapsed Time */}
        <span
          data-testid="player-time"
          className="text-[10px] text-app-text-dim tabular-nums shrink-0"
        >
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Seek Scrubber */}
        <div className="flex-1 relative flex items-center">
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.5}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            data-testid="player-seek"
            aria-label={t("player.seek")}
            className="w-full h-1 bg-app-surface rounded-none appearance-none cursor-pointer accent-soul-green focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green"
          />
        </div>
      </div>

      {/* Right Controls: Volume & Dismiss */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Volume Slider */}
        <div className="hidden md:flex items-center gap-1.5 text-app-text-dim">
          <span className="text-[10px]" aria-hidden="true">
            vol
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            data-testid="player-volume"
            aria-label={t("player.volume")}
            className="w-16 h-1 bg-app-surface rounded-none appearance-none cursor-pointer accent-soul-green focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green"
          />
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={stopTrack}
          data-testid="player-dismiss"
          aria-label={t("player.dismiss")}
          className="px-1.5 py-0.5 rounded-none text-app-text-dim hover:text-soul-crimson hover:border-soul-crimson/50 border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green font-mono text-xs"
        >
          x
        </button>
      </div>

      {/* Error Banner */}
      {audioError && (
        <div
          data-testid="player-error"
          role="alert"
          className="absolute -top-7 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-none bg-soul-oxblood border border-soul-crimson text-soul-red text-[10px] font-semibold lowercase"
        >
          {audioError}
        </div>
      )}
    </div>
  );
}
