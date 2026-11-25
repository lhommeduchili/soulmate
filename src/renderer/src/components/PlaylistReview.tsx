import { useState, useEffect } from "react";
import { LoadingOverlay } from "./LoadingOverlay";
import { EditableCell } from "./EditableCell";
import { Track, TrackLibraryStatus } from "../../../shared/types";
import { useI18n } from "../context/I18nContext";
import { useAudioPlayer } from "../context/AudioPlayerContext";
import { useQueue } from "../hooks/useQueue";

interface Props {
  playlistId: string;
  playlistType?: "spotify" | "youtube" | "setlist" | "soundcloud" | "bandcamp";
  onBack: () => void;
}

export function PlaylistReview({
  playlistId,
  playlistType = "spotify",
  onBack,
}: Props): JSX.Element {
  const { t } = useI18n();
  const { playTrack, currentTrack, isPlaying } = useAudioPlayer();
  const { queue } = useQueue();
  const [tracks, setTracks] = useState<Track[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [libraryStatus, setLibraryStatus] = useState<
    Record<string, TrackLibraryStatus>
  >({});
  const [failedThumbnails, setFailedThumbnails] = useState<
    Record<string, boolean>
  >({});
  const [skipInLibrary, setSkipInLibrary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setFailedThumbnails({});
    const fetcher =
      playlistType === "youtube"
        ? window.api.youtube.getTracks(playlistId)
        : playlistType === "soundcloud"
          ? window.api.soundcloud.getTracks(playlistId)
          : playlistType === "bandcamp"
            ? window.api.bandcamp.getTracks(playlistId)
            : playlistType === "setlist"
              ? window.api.setlist.getTracks(playlistId)
              : window.api.spotify.getTracks(playlistId);

    fetcher
      .then(async (data: Track[]) => {
        setTracks(data);
        setSelected(new Set(data.map((t: Track) => t.id)));

        // Check library for existing tracks
        try {
          if (window.api.library?.checkTracks) {
            const statusMap = await window.api.library.checkTracks(data);
            setLibraryStatus(statusMap);
          }
        } catch (checkErr) {
          console.warn("[PlaylistReview] Duplicate check error:", checkErr);
        }

        setLoading(false);
      })
      .catch((err: Error) => {
        console.error(err);
        setError(err.message || t("playlist.loadingError"));
        setLoading(false);
      });
  }, [playlistId, playlistType, t]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleToggleSkipInLibrary = () => {
    const nextSkip = !skipInLibrary;
    setSkipInLibrary(nextSkip);

    if (nextSkip) {
      // Automatically deselect tracks that already exist in library
      setSelected((prev) => {
        const next = new Set(prev);
        for (const track of tracks) {
          if (libraryStatus[track.id]?.inLibrary) {
            next.delete(track.id);
          }
        }
        return next;
      });
    } else {
      // Re-select all tracks
      setSelected(new Set(tracks.map((t) => t.id)));
    }
  };

  const downloadSelected = () => {
    const toDownload = tracks.filter((t) => selected.has(t.id));
    const playlistName =
      tracks[0]?.album?.name && tracks[0].album.name !== "Unknown"
        ? tracks[0].album.name
        : "Soulmate Playlist";

    window.api.queue
      .start({ tracks: toDownload, playlistName })
      .catch((err: unknown) => {
        console.error("[PlaylistReview] downloadSelected failed:", err);
        setError(t("error.toast.failedAction"));
      });
  };

  const handleDownloadTrack = (track: Track) => {
    window.api.queue.start([track]).catch((err: unknown) => {
      console.error("[PlaylistReview] download track failed:", err);
      setError(t("error.toast.failedAction"));
    });
  };

  const handleExportPlaylist = async () => {
    try {
      const playlistName =
        tracks[0]?.album?.name && tracks[0].album.name !== "Unknown"
          ? tracks[0].album.name
          : "Soulmate Playlist";

      const res = await window.api.queue.exportPlaylist({
        playlistName,
        tracks,
        reveal: false,
      });

      if (res.success) {
        setExportNotice(t("review.exportSuccess"));
        setTimeout(() => setExportNotice(null), 4000);
      }
    } catch (err) {
      console.error("[PlaylistReview] Export playlist failed:", err);
      setError(t("review.exportError"));
    }
  };

  const handleExportRekordbox = async () => {
    try {
      const playlistName =
        tracks[0]?.album?.name && tracks[0].album.name !== "Unknown"
          ? tracks[0].album.name
          : "Soulmate Playlist";

      const res = await window.api.crate.exportRekordbox({
        playlistName,
        tracks,
        reveal: false,
      });

      if (res.success) {
        setExportNotice(t("review.exportRekordboxSuccess"));
        setTimeout(() => setExportNotice(null), 4000);
      }
    } catch (err) {
      console.error("[PlaylistReview] Export Rekordbox XML failed:", err);
      setError(t("review.exportRekordboxError"));
    }
  };

  const handleExportSerato = async () => {
    try {
      const playlistName =
        tracks[0]?.album?.name && tracks[0].album.name !== "Unknown"
          ? tracks[0].album.name
          : "Soulmate Playlist";

      const res = await window.api.crate.exportSerato({
        playlistName,
        tracks,
        reveal: false,
      });

      if (res.success) {
        setExportNotice(t("review.exportSeratoSuccess"));
        setTimeout(() => setExportNotice(null), 4000);
      }
    } catch (err) {
      console.error("[PlaylistReview] Export Serato Crate failed:", err);
      setError(t("review.exportSeratoError"));
    }
  };

  const handleExportTraktor = async () => {
    try {
      const playlistName =
        tracks[0]?.album?.name && tracks[0].album.name !== "Unknown"
          ? tracks[0].album.name
          : "Soulmate Playlist";

      const res = await window.api.crate.exportTraktor({
        playlistName,
        tracks,
        reveal: false,
      });

      if (res.success) {
        setExportNotice(t("review.exportTraktorSuccess"));
        setTimeout(() => setExportNotice(null), 4000);
      }
    } catch (err) {
      console.error("[PlaylistReview] Export Traktor NML failed:", err);
      setError(t("review.exportTraktorError"));
    }
  };

  const handleUpdateTrack = (
    id: string,
    field: "name" | "artist" | "album",
    value: string,
  ) => {
    setTracks((prev) =>
      prev.map((track) => {
        if (track.id !== id) return track;

        const newTrack = { ...track };

        if (field === "name") {
          newTrack.name = value;
        } else if (field === "album") {
          newTrack.album = { ...newTrack.album, name: value };
        } else if (field === "artist") {
          const newArtists = [...newTrack.artists];
          if (newArtists.length > 0) {
            newArtists[0] = { ...newArtists[0], name: value };
          } else {
            newArtists.push({ name: value });
          }
          newTrack.artists = newArtists;
        }
        return newTrack;
      }),
    );
  };

  if (loading) return <LoadingOverlay text={t("loading.decryptingPlaylist")} />;

  return (
    <div
      className="flex flex-col h-full"
      role="region"
      aria-label={t("review.editor")}
    >
      {/* Header Toolbar */}
      <header className="sticky top-0 z-20 bg-app-bg/95 border-b border-app-border px-6 py-4 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="sr-only"
            aria-label={t("topBar.home")}
            data-testid="back-button"
          >
            back
          </button>
          <span
            data-testid="platform-badge"
            className="px-2 py-0.5 rounded-none text-[10px] font-mono border uppercase tracking-wider font-semibold border-soul-green/50 bg-soul-green/5 text-soul-green"
          >
            [{playlistType.toUpperCase()}]
          </span>
          <span
            className="text-app-text-dim text-xs font-mono lowercase tracking-wider pl-1 tabular-nums"
            aria-live="polite"
          >
            {t("review.selectedCount", {
              selected: selected.size,
              total: tracks.length,
            })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Skip In Library toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-app-text-muted hover:text-app-text-main transition-colors select-none lowercase">
            <input
              type="checkbox"
              checked={skipInLibrary}
              onChange={handleToggleSkipInLibrary}
              data-testid="skip-in-library-toggle"
              className="accent-soul-green bg-app-surface border-app-line rounded-none w-3.5 h-3.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
            />
            <span>{t("review.skipInLibrary")}</span>
          </label>

          {/* Export Crate & Playlist Actions */}
          <div
            className="flex items-center border border-app-border bg-app-bg divide-x divide-app-border"
            role="group"
            aria-label={t("review.exportDropdown")}
          >
            <button
              type="button"
              onClick={handleExportPlaylist}
              data-testid="export-m3u-button"
              aria-label={t("review.exportM3u")}
              title={t("review.exportM3u")}
              className="px-2.5 py-1.5 hover:bg-app-text-main hover:text-app-bg text-app-text-muted font-mono text-[11px] rounded-none transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green lowercase tracking-wider"
            >
              <span>.m3u8</span>
            </button>
            <button
              type="button"
              onClick={handleExportRekordbox}
              data-testid="export-rekordbox-button"
              aria-label={t("review.exportRekordbox")}
              title={t("review.exportRekordbox")}
              className="px-2.5 py-1.5 hover:bg-app-text-main hover:text-app-bg text-app-text-muted font-mono text-[11px] rounded-none transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green lowercase tracking-wider"
            >
              <span>rekordbox xml</span>
            </button>
            <button
              type="button"
              onClick={handleExportSerato}
              data-testid="export-serato-button"
              aria-label={t("review.exportSerato")}
              title={t("review.exportSerato")}
              className="px-2.5 py-1.5 hover:bg-app-text-main hover:text-app-bg text-app-text-muted font-mono text-[11px] rounded-none transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green lowercase tracking-wider"
            >
              <span>serato .crate</span>
            </button>
            <button
              type="button"
              onClick={handleExportTraktor}
              data-testid="export-traktor-button"
              aria-label={t("review.exportTraktor")}
              title={t("review.exportTraktor")}
              className="px-2.5 py-1.5 hover:bg-app-text-main hover:text-app-bg text-app-text-muted font-mono text-[11px] rounded-none transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green lowercase tracking-wider"
            >
              <span>traktor nml</span>
            </button>
          </div>

          <button
            onClick={downloadSelected}
            disabled={selected.size === 0}
            aria-label={t("review.downloadSelected", { count: selected.size })}
            className="bg-app-text-main hover:bg-app-bg text-app-bg hover:text-app-text-main border border-app-text-main font-mono font-semibold py-1.5 px-5 rounded-none text-xs lowercase tracking-wider disabled:opacity-35 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
          >
            {t("review.downloadSelectedButton")}
          </button>
        </div>
      </header>

      {exportNotice && (
        <div
          role="status"
          aria-live="polite"
          className="mx-6 mt-4 bg-app-bg border border-soul-green/60 text-soul-green px-4 py-2.5 rounded-none text-xs font-mono flex items-center justify-between"
          data-testid="playlist-export-notice"
        >
          <div className="flex items-center space-x-2 min-w-0">
            <span className="font-bold shrink-0">♫</span>
            <span className="truncate lowercase">{exportNotice}</span>
          </div>
          <button
            onClick={() => setExportNotice(null)}
            className="ml-3 text-soul-green hover:text-app-text-main p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green rounded-none"
            aria-label={t("alert.dismiss")}
          >
            x
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mx-6 mt-4 bg-soul-oxblood/40 border border-soul-crimson text-soul-red px-4 py-2.5 rounded-none text-xs font-mono flex items-center justify-between"
          data-testid="playlist-review-error"
        >
          <div className="flex items-center space-x-2 min-w-0">
            <span className="text-soul-crimson font-bold shrink-0">[!]</span>
            <span className="truncate lowercase">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-3 text-soul-red hover:text-app-text-main p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green rounded-none"
            aria-label={t("alert.dismiss")}
            data-testid="playlist-error-dismiss"
          >
            x
          </button>
        </div>
      )}

      {/* Content Table */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden px-0 pb-6 pt-0"
        role="region"
        aria-label={t("review.trackList")}
        tabIndex={0}
      >
        <table className="w-full text-left text-xs font-mono table-fixed">
          <caption className="sr-only">{t("review.caption")}</caption>
          <thead className="text-app-text-dim border-b border-app-border lowercase tracking-wider font-medium text-[11px] sticky top-0 bg-app-bg z-10">
            <tr>
              <th scope="col" className="pb-3 pt-3 pl-6 w-10 text-center">
                <label className="sr-only" htmlFor="select-all-tracks">
                  {t("review.selectAll")}
                </label>
                <input
                  id="select-all-tracks"
                  type="checkbox"
                  checked={selected.size === tracks.length && tracks.length > 0}
                  onChange={() => {
                    if (selected.size === tracks.length) setSelected(new Set());
                    else setSelected(new Set(tracks.map((t) => t.id)));
                  }}
                  className="accent-soul-green bg-app-surface border-app-line rounded-none w-3.5 h-3.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
                />
              </th>
              <th scope="col" className="pb-3 pt-3 pl-4 w-[38%]">
                {t("review.title")}
              </th>
              <th scope="col" className="pb-3 pt-3 w-[24%]">
                {t("review.artist")}
              </th>
              <th scope="col" className="pb-3 pt-3 w-[24%]">
                {t("review.album")}
              </th>
              <th scope="col" className="pb-3 pt-3 pr-6 w-24 text-right">
                {t("review.action")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {tracks.map((track, i) => {
              const thumbnailUrl = !failedThumbnails[track.id]
                ? track.image || track.album?.images?.[0]?.url
                : undefined;

              return (
                <tr
                  key={`${track.id}-${i}`}
                  className="group hover:bg-app-surface-hover/60 transition-colors"
                >
                  <td className="py-2.5 pl-6 text-center">
                    <label
                      className="sr-only"
                      htmlFor={`select-track-${track.id}`}
                    >
                      {t("review.selectTrack", { name: track.name })}
                    </label>
                    <input
                      id={`select-track-${track.id}`}
                      type="checkbox"
                      checked={selected.has(track.id)}
                      onChange={() => toggleSelect(track.id)}
                      className="accent-soul-green bg-app-surface border-app-line rounded-none w-3.5 h-3.5 cursor-pointer opacity-60 group-hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green focus:opacity-100"
                    />
                  </td>
                  <td className="py-2.5 pl-4 font-medium text-app-text-main overflow-hidden">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt=""
                          aria-hidden="true"
                          referrerPolicy="no-referrer"
                          data-testid={`track-thumbnail-${track.id}`}
                          onError={() =>
                            setFailedThumbnails((prev) => ({
                              ...prev,
                              [track.id]: true,
                            }))
                          }
                          className="w-8 h-8 object-cover border border-app-border shrink-0"
                        />
                      ) : (
                        <div
                          data-testid={`track-thumbnail-fallback-${track.id}`}
                          aria-hidden="true"
                          className="w-8 h-8 flex items-center justify-center border border-app-border bg-app-surface text-app-text-dim font-mono text-[10px] shrink-0"
                        >
                          ♫
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                        <EditableCell
                          value={track.name}
                          onChange={(val) =>
                            handleUpdateTrack(track.id, "name", val)
                          }
                          aria-label={t("review.editTitle", {
                            name: track.name,
                          })}
                        />
                        {libraryStatus[track.id]?.inLibrary && (
                          <span
                            className="px-1.5 py-0.5 rounded-none text-[10px] font-mono border border-soul-green/50 bg-soul-green/5 text-soul-green uppercase tracking-wider shrink-0 font-semibold"
                            data-testid={`in-library-badge-${track.id}`}
                            title={
                              libraryStatus[track.id]?.filePath ||
                              t("review.inLibrary")
                            }
                          >
                            {t("review.inLibrary")}
                          </span>
                        )}
                        {(() => {
                          const queueItem = queue.find(
                            (q) => q.id === track.id || q.track.id === track.id,
                          );
                          const formatInfo =
                            track.formatInfo || queueItem?.formatInfo;
                          if (!formatInfo?.camelotKey && !formatInfo?.bpm)
                            return null;
                          return (
                            <span
                              data-testid={`camelot-badge-${track.id}`}
                              className="px-1.5 py-0.5 rounded-none text-[10px] font-mono border border-soul-cyan/40 bg-soul-cyan/5 text-soul-cyan uppercase tracking-wider shrink-0 font-semibold"
                              title={t("track.camelotBadgeTitle", {
                                key: formatInfo.camelotKey || "Unknown",
                                bpm: formatInfo.bpm || "Unknown",
                              })}
                              aria-label={t("track.camelotBadgeAria", {
                                key: formatInfo.camelotKey || "Unknown",
                                bpm: formatInfo.bpm || "Unknown",
                              })}
                            >
                              {formatInfo.camelotKey && formatInfo.bpm
                                ? `[${formatInfo.camelotKey} / ${formatInfo.bpm} BPM]`
                                : formatInfo.camelotKey
                                  ? `[${formatInfo.camelotKey}]`
                                  : `[${formatInfo.bpm} BPM]`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </td>

                  <td className="py-2.5 text-app-text-muted overflow-hidden">
                    <EditableCell
                      value={track.artists.map((a) => a.name).join(", ")}
                      onChange={(val) =>
                        handleUpdateTrack(track.id, "artist", val)
                      }
                      aria-label={t("review.editArtist", { name: track.name })}
                    />
                  </td>
                  <td className="py-2.5 text-app-text-dim overflow-hidden">
                    <EditableCell
                      value={track.album?.name || ""}
                      onChange={(val) =>
                        handleUpdateTrack(track.id, "album", val)
                      }
                      aria-label={t("review.editAlbum", { name: track.name })}
                    />
                  </td>
                  <td className="py-2.5 pr-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {libraryStatus[track.id]?.filePath && (
                        <button
                          type="button"
                          onClick={() =>
                            playTrack({
                              id: track.id,
                              title: track.name,
                              artist: track.artists[0]?.name || "Unknown",
                              filePath: libraryStatus[track.id]?.filePath || "",
                            })
                          }
                          data-testid={`preview-track-${track.id}`}
                          aria-label={
                            currentTrack?.id === track.id && isPlaying
                              ? t("player.pause")
                              : t("player.play")
                          }
                          title={
                            currentTrack?.id === track.id && isPlaying
                              ? t("player.pause")
                              : t("player.play")
                          }
                          className={`p-1 rounded-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-soul-green ${
                            currentTrack?.id === track.id && isPlaying
                              ? "text-soul-green font-bold animate-pulse"
                              : "text-app-text-dim hover:text-soul-green"
                          }`}
                        >
                          {currentTrack?.id === track.id && isPlaying
                            ? "⏸"
                            : "▶"}
                        </button>
                      )}
                      <button
                        onClick={() => handleDownloadTrack(track)}
                        aria-label={t("review.downloadTrack", {
                          name: track.name,
                        })}
                        className="text-soul-green hover:text-app-bg text-[10px] border border-soul-green/40 hover:bg-soul-green hover:border-soul-green px-2.5 py-1 rounded-none opacity-60 group-hover:opacity-100 focus:opacity-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green uppercase"
                      >
                        {t("review.get")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
