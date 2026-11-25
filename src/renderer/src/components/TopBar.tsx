import { useState, useEffect } from "react";
import { SettingsModal } from "./SettingsModal";
import { useNavigate, useLocation } from "react-router-dom";
import { useSpotifyAuthContext } from "../context/SpotifyAuthContext";
import { useLibraryContext } from "../context/LibraryContext";
import { useI18n } from "../context/I18nContext";
import { UpdateStatus } from "../../../shared/types";

export function TopBar(): JSX.Element {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const { isAuthenticated, logout } = useSpotifyAuthContext();
  const { searchTerm, setSearchTerm, search, isSearching, error, clearError } =
    useLibraryContext();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  useEffect(() => {
    if (!window.api?.update) return;

    window.api.update
      .getStatus()
      .then((status) => {
        setUpdateStatus(status);
      })
      .catch((err) => {
        console.debug("[TopBar] getUpdateStatus failed:", err);
      });

    const unsubscribe = window.api.update.onStatusChange((status) => {
      setUpdateStatus(status);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleHome = () => {
    navigate("/");
  };

  const handleLogout = () => {
    if (!isAuthenticated) return;
    logout();
    navigate("/");
  };

  return (
    <>
      <header
        className="sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center pt-5 pb-4 px-8 gap-4 pointer-events-none app-drag"
        aria-label={t("topBar.aria")}
      >
        {/* Home Button - Aligned Left */}
        <nav
          className="pointer-events-auto -ml-1"
          aria-label={t("topBar.mainNav")}
        >
          <button
            onClick={handleHome}
            disabled={isHome}
            aria-label={t("topBar.home")}
            aria-current={isHome ? "page" : undefined}
            data-testid="topbar-home-button"
            className={`p-2 rounded-none border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green ${
              isHome
                ? "border-app-border text-app-text-dim/30 cursor-default bg-app-bg/50"
                : "border-app-border bg-app-bg/85 text-app-text-muted hover:text-app-bg hover:bg-app-text-main hover:border-app-text-main"
            }`}
            title={t("topBar.home")}
          >
            <svg
              className="w-4 h-4"
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </button>
        </nav>

        {/* Search Bar & Feedback - Centered */}
        <div
          className="pointer-events-auto w-full max-w-lg justify-self-center relative"
          role="search"
        >
          <style>{`.search-input::-webkit-search-cancel-button{ -webkit-appearance:none; appearance:none; }`}</style>
          <div className="relative group flex items-center">
            <label htmlFor="playlist-search" className="sr-only">
              {t("topBar.searchLabel")}
            </label>
            <span
              className="pointer-events-none absolute left-3 text-soul-green font-mono text-xs select-none"
              aria-hidden="true"
            >
              $
            </span>
            <input
              id="playlist-search"
              type="search"
              value={searchTerm}
              disabled={isSearching}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSearching) {
                  search(searchTerm);
                }
              }}
              className="search-input block w-full pl-7 pr-20 py-2 border border-app-line rounded-none leading-5 bg-app-bg/90 text-app-text-main placeholder-app-text-dim/60 font-mono text-xs lowercase focus:outline-none focus:border-soul-green transition-colors disabled:opacity-50"
              placeholder={t("topBar.searchPlaceholder")}
            />
            {searchTerm && !isSearching && (
              <button
                className="absolute inset-y-0 right-9 flex items-center px-1.5 text-app-text-dim hover:text-soul-crimson transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green rounded-none font-mono text-xs"
                aria-label={t("topBar.clearSearch")}
                onClick={() => setSearchTerm("")}
              >
                x
              </button>
            )}

            {/* Right Side Actions / In-Progress Indicator */}
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              {isSearching ? (
                <div
                  className="px-2 flex items-center gap-1.5 text-soul-green font-mono text-xs"
                  role="status"
                  aria-live="polite"
                  aria-label={t("loading.decryptingPlaylist")}
                >
                  <span className="w-1.5 h-1.5 rounded-none bg-soul-green animate-ping" />
                  <svg
                    className="animate-spin h-3.5 w-3.5 text-soul-green"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                </div>
              ) : (
                <button
                  className="p-1.5 text-app-text-dim hover:text-soul-green focus:text-soul-green transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green rounded-none"
                  aria-label={t("topBar.searchBrowseAria")}
                  onClick={() => search(searchTerm)}
                >
                  <svg
                    className="h-4 w-4"
                    aria-hidden="true"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Inline Alert / Feedback for URL import errors */}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="absolute top-full left-0 right-0 mt-2 bg-soul-oxblood/70 border border-soul-crimson text-soul-red px-3.5 py-2 rounded-none text-xs font-mono flex items-center justify-between backdrop-blur-sm z-40"
            >
              <div className="flex items-center space-x-2 min-w-0">
                <span className="text-soul-crimson font-bold shrink-0">
                  [!]
                </span>
                <span className="truncate lowercase">{error}</span>
              </div>
              <button
                onClick={clearError}
                className="ml-2 text-soul-red hover:text-app-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green rounded-none px-1 transition-colors font-mono"
                aria-label={t("alert.dismiss")}
                data-testid="error-alert-dismiss"
              >
                x
              </button>
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="pointer-events-auto mr-1 flex items-center gap-1 bg-app-bg/90 border border-app-border rounded-none p-1">
          {updateStatus &&
            (updateStatus.status === "downloaded" ||
              updateStatus.status === "available") && (
              <button
                type="button"
                onClick={() => {
                  if (updateStatus.status === "downloaded") {
                    void window.api.update?.install();
                  } else {
                    setIsSettingsOpen(true);
                  }
                }}
                data-testid="update-available-pill"
                aria-label={t("update.installRestart")}
                title={t("update.installRestart")}
                className="px-2.5 py-1 bg-soul-green/10 hover:bg-soul-green hover:text-app-bg text-soul-green border border-soul-green/50 rounded-none text-xs font-mono transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
              >
                <span className="w-1.5 h-1.5 rounded-none bg-soul-green animate-pulse" />
                <span className="text-[11px] font-semibold lowercase tracking-wider">
                  {t("update.available", {
                    version: updateStatus.version
                      ? `v${updateStatus.version}`
                      : "",
                  })}
                </span>
              </button>
            )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            aria-label={t("topBar.settingsOpen")}
            aria-haspopup="dialog"
            data-testid="settings-trigger"
            className="p-1.5 text-app-text-muted hover:text-app-bg hover:bg-app-text-main rounded-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
            title={t("topBar.settingsOpen")}
          >
            <svg
              className="w-4 h-4"
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>

          {isAuthenticated && (
            <>
              <div className="w-px h-4 bg-app-border"></div>
              <button
                onClick={handleLogout}
                aria-label={t("topBar.logout")}
                className="p-1.5 text-app-text-muted hover:text-soul-red hover:bg-soul-oxblood/40 rounded-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
                title={t("topBar.logout")}
              >
                <svg
                  className="w-4 h-4"
                  aria-hidden="true"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.75}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}
