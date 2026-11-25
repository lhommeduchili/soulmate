import { useState, useEffect } from "react";
import { MatrixText } from "./MatrixText";
import { useI18n } from "../context/I18nContext";
import { Playlist, Track } from "../../../shared/types";
import { SetlistImportModal } from "./SetlistImportModal";

interface Props {
  onSelect: (playlistId: string) => void;
  isAuthenticated?: boolean;
  onLoginRequested?: () => void;
  searchResults?: Playlist[] | null;
  isSearching?: boolean;
  addedPlaylists?: Playlist[];
  onClearAdded?: () => void;
  onRemoveAdded?: (playlistId: string) => void;
  onImportSetlist?: (playlist: Playlist, tracks: Track[]) => void;
}

export function PlaylistSelector({
  onSelect,
  isAuthenticated = false,
  searchResults,
  isSearching,
  addedPlaylists = [],
  onClearAdded,
  onRemoveAdded,
  onImportSetlist,
}: Props): JSX.Element {
  const { t } = useI18n();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSetlistModalOpen, setIsSetlistModalOpen] = useState(false);

  if (
    typeof window !== "undefined" &&
    (window as unknown as { __simulateComponentCrash?: string })
      .__simulateComponentCrash === "playlists"
  ) {
    throw new Error("Simulated PlaylistSelector subsystem fault");
  }

  // Fetch library on mount (only if authenticated)
  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setLoading(false);
      setPlaylists([]);
      setError("");
      return;
    }

    setLoading(true);
    window.api.spotify
      .getPlaylists()
      .then((data: Playlist[]) => {
        if (!cancelled) {
          setPlaylists(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          console.error(err);
          setError(t("playlist.loadingError"));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, t]);

  // Prefer search results if active (even if empty array), otherwise show library
  const displayPlaylists =
    searchResults !== null && typeof searchResults !== "undefined"
      ? searchResults
      : playlists;
  const isShowingSearch =
    searchResults !== null && typeof searchResults !== "undefined";

  if (loading && !isShowingSearch)
    return (
      <div className="fixed inset-0 z-50 bg-app-bg nocturne-ground flex flex-col items-center justify-center p-8 text-center font-mono">
        <div className="text-xl text-soul-green mb-2 lowercase tracking-tight flex items-center">
          <style>{`
            @keyframes blink-cursor {
              0%, 100% { opacity: 1; }
              50% { opacity: 0; }
            }
            .blink-cursor {
              animation: blink-cursor 1s step-end infinite;
            }
          `}</style>
          <MatrixText text={t("loading.loadingLibrary")} />
          <span className="ml-2 w-2.5 h-5 bg-soul-green inline-block blink-cursor"></span>
        </div>
      </div>
    );

  if (isSearching)
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[50vh] text-app-text-dim font-mono p-8"
        role="status"
        aria-live="polite"
        aria-label={t("loading.decryptingPlaylist")}
      >
        <div className="text-xl text-soul-green mb-2 lowercase tracking-tight flex items-center">
          <style>{`
            @keyframes blink-cursor {
              0%, 100% { opacity: 1; }
              50% { opacity: 0; }
            }
            .blink-cursor {
              animation: blink-cursor 1s step-end infinite;
            }
          `}</style>
          <MatrixText text={t("loading.decryptingPlaylist")} />
          <span className="ml-2 w-2.5 h-5 bg-soul-green inline-block blink-cursor"></span>
        </div>
        <p className="text-xs text-app-text-muted lowercase tracking-widest mt-2">
          {t("sidebar.searching")}
        </p>
      </div>
    );

  if (error)
    return <div className="p-8 text-soul-red font-mono lowercase">{error}</div>;

  return (
    <div className="px-8 pt-2 pb-8">
      {/* Top Action Bar for DJ Setlist Import */}
      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={() => setIsSetlistModalOpen(true)}
          data-testid="import-setlist-trigger"
          aria-label={t("setlist.triggerAria")}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-none border border-soul-green/50 bg-app-bg hover:bg-soul-green hover:text-app-bg text-soul-green text-xs font-mono lowercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green cursor-pointer"
        >
          <span>[{t("setlist.trigger")}]</span>
        </button>
      </div>

      {/* Added Playlists Section */}
      {addedPlaylists.length > 0 && !isShowingSearch && (
        <section className="mb-12" aria-labelledby="added-playlists-heading">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-app-border group/header">
            <h2
              id="added-playlists-heading"
              className="font-editorial italic text-2xl text-app-text-main tracking-tight lowercase"
            >
              {t("playlist.added")}
            </h2>
            {onClearAdded && (
              <button
                onClick={onClearAdded}
                className="text-xs font-mono text-app-text-dim hover:text-soul-crimson transition-colors lowercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green px-2 py-1 border border-transparent hover:border-soul-crimson/50"
                aria-label={t("playlist.clearAll")}
              >
                [{t("playlist.clearAll")}]
              </button>
            )}
          </div>
          <div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
            role="list"
            aria-label={t("playlist.addedList")}
          >
            {addedPlaylists.map((pl) => (
              <div key={pl.id} role="listitem" className="relative group">
                <button
                  onClick={() => onSelect(pl.id)}
                  className="w-full text-left bg-app-bg/85 hover:bg-app-surface border border-app-border hover:border-app-text-main transition-colors p-3 rounded-none cursor-pointer flex flex-col items-start text-left relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
                  aria-label={t("playlist.selectAdded", { name: pl.name })}
                >
                  <div className="w-full aspect-square bg-app-surface border border-app-border mb-3 relative rounded-none overflow-hidden">
                    {pl.images && pl.images[0] ? (
                      <img
                        src={pl.images[0].url}
                        alt=""
                        aria-hidden="true"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center bg-app-surface text-app-text-dim font-mono"
                        aria-hidden="true"
                      >
                        <span className="text-3xl">♫</span>
                      </div>
                    )}
                  </div>
                  <h3 className="text-app-text-main font-mono font-medium text-xs truncate w-full mb-1 lowercase">
                    {pl.name}
                  </h3>
                  <span className="text-app-text-dim font-mono text-[11px] lowercase tabular-nums">
                    {t("playlist.tracksCount", {
                      count: pl.tracks?.total || 0,
                    })}
                  </span>
                </button>
                {/* Remove Button */}
                {onRemoveAdded && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveAdded(pl.id);
                    }}
                    className="absolute top-1.5 right-1.5 text-app-text-dim hover:text-soul-crimson opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10 px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green bg-app-bg/90 border border-app-border rounded-none font-mono text-[11px]"
                    aria-label={t("playlist.remove", { name: pl.name })}
                    title={t("playlist.remove", { name: pl.name })}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Welcoming Zero-Login Workspace (Shown when no playlists added and not searching) */}
      {!isAuthenticated && !isShowingSearch && addedPlaylists.length === 0 && (
        <div
          className="flex flex-col items-start justify-center min-h-[55vh] max-w-3xl mx-auto px-2 py-8 font-mono"
          role="region"
          aria-labelledby="welcome-workspace-title"
        >
          <p className="text-[11px] text-soul-green uppercase tracking-[0.18em] mb-2">
            $ soulmate // p2p audio substrate
          </p>

          <h2
            id="welcome-workspace-title"
            className="font-editorial italic text-4xl md:text-5xl text-app-text-main tracking-tight lowercase mb-4"
          >
            <MatrixText text={t("workspace.welcomeTitle")} />
          </h2>

          <p className="text-app-text-muted text-xs max-w-xl mb-8 leading-relaxed lowercase border-l border-soul-crimson pl-3">
            {t("workspace.welcomeSubtitle")}
          </p>

          {/* Guidance Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full mb-8 text-left">
            <div className="bg-app-bg/85 border border-app-border rounded-none p-3.5 transition-colors hover:border-soul-green/60">
              <div className="text-[11px] font-semibold text-soul-green lowercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span>+</span>
                <span>{t("workspace.spotifyGuidance")}</span>
              </div>
              <p className="text-[11px] text-app-text-dim font-mono break-all lowercase">
                {t("workspace.spotifyExample")}
              </p>
            </div>

            <div className="bg-app-bg/85 border border-app-border rounded-none p-3.5 transition-colors hover:border-soul-green/60">
              <div className="text-[11px] font-semibold text-soul-green lowercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span>+</span>
                <span>{t("workspace.youtubeGuidance")}</span>
              </div>
              <p className="text-[11px] text-app-text-dim font-mono break-all lowercase">
                {t("workspace.youtubeExample")}
              </p>
            </div>

            <div className="bg-app-bg/85 border border-app-border rounded-none p-3.5 transition-colors hover:border-soul-green/60">
              <div className="text-[11px] font-semibold text-soul-green lowercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span>+</span>
                <span>{t("workspace.soundCloudGuidance")}</span>
              </div>
              <p className="text-[11px] text-app-text-dim font-mono break-all lowercase">
                {t("workspace.soundCloudExample")}
              </p>
            </div>

            <div className="bg-app-bg/85 border border-app-border rounded-none p-3.5 transition-colors hover:border-soul-green/60">
              <div className="text-[11px] font-semibold text-soul-green lowercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span>+</span>
                <span>{t("workspace.bandcampGuidance")}</span>
              </div>
              <p className="text-[11px] text-app-text-dim font-mono break-all lowercase">
                {t("workspace.bandcampExample")}
              </p>
            </div>
          </div>

          {/* Action Prompt & DJ Setlist Trigger */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-soul-cyan bg-app-bg border border-app-border px-3.5 py-2 rounded-none lowercase">
              <span className="w-1.5 h-1.5 rounded-none bg-soul-green animate-pulse" />
              <span>{t("workspace.pasteHint")}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsSetlistModalOpen(true)}
              data-testid="import-setlist-trigger-hero"
              aria-label={t("setlist.triggerAria")}
              className="inline-flex items-center gap-1.5 text-xs text-app-bg hover:text-app-text-main bg-app-text-main hover:bg-app-bg border border-app-text-main px-4 py-2 rounded-none font-semibold lowercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green cursor-pointer"
            >
              <span>[{t("setlist.trigger")}]</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Playlists Section (Search Results or Authenticated Library) */}
      {(isShowingSearch || isAuthenticated) && (
        <section aria-labelledby="main-playlists-heading">
          <h2
            id="main-playlists-heading"
            className="font-editorial italic text-2xl mb-6 pb-2 border-b border-app-border text-app-text-main tracking-tight lowercase"
          >
            {isShowingSearch
              ? t("playlist.searchResults")
              : t("playlist.yours")}
            {isShowingSearch && (
              <span
                className="ml-3 text-xs text-app-text-dim font-normal font-mono not-italic"
                aria-label={t("playlist.foundAria", {
                  count: displayPlaylists.length,
                })}
              >
                {t("playlist.foundCount", { count: displayPlaylists.length })}
              </span>
            )}
          </h2>

          <div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
            role="list"
            aria-labelledby="main-playlists-heading"
          >
            {isAuthenticated &&
              !isShowingSearch &&
              displayPlaylists.length === 0 && (
                <div
                  className="col-span-full text-app-text-dim font-mono lowercase text-center py-12"
                  role="status"
                >
                  {t("playlist.noPlaylists")}
                </div>
              )}

            {isShowingSearch && displayPlaylists.length === 0 && (
              <div
                className="col-span-full text-app-text-dim font-mono lowercase text-center py-12"
                role="status"
              >
                {t("playlist.noResults")}
              </div>
            )}

            {displayPlaylists.map((pl) => (
              <button
                key={pl.id}
                role="listitem"
                onClick={() => onSelect(pl.id)}
                className="w-full text-left group bg-app-bg/85 hover:bg-app-surface border border-app-border hover:border-app-text-main transition-colors p-3 rounded-none cursor-pointer flex flex-col items-start text-left relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
                aria-label={t("playlist.selectAdded", { name: pl.name })}
              >
                <div
                  className="w-full aspect-square bg-app-surface border border-app-border mb-3 relative rounded-none overflow-hidden"
                  aria-hidden="true"
                >
                  {pl.images && pl.images[0] ? (
                    <img
                      src={pl.images[0].url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-app-surface text-app-text-dim font-mono">
                      <span className="text-3xl">♫</span>
                    </div>
                  )}
                </div>
                <h3 className="text-app-text-main font-mono font-medium text-xs truncate w-full mb-1 lowercase">
                  {pl.name}
                </h3>
                <span className="text-app-text-dim font-mono text-[11px] lowercase tabular-nums">
                  {t("playlist.tracksCount", { count: pl.tracks?.total || 0 })}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <SetlistImportModal
        isOpen={isSetlistModalOpen}
        onClose={() => setIsSetlistModalOpen(false)}
        onImportSuccess={(playlist, tracks) => {
          if (onImportSetlist) {
            onImportSetlist(playlist, tracks);
          }
        }}
      />
    </div>
  );
}
