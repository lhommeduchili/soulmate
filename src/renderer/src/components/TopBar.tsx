import { useState } from "react";
import { SettingsModal } from "./SettingsModal";
import { useNavigate, useLocation } from "react-router-dom";
import { useSpotifyAuthContext } from "../context/SpotifyAuthContext";
import { useLibraryContext } from "../context/LibraryContext";
import { useI18n } from "../context/I18nContext";

export function TopBar(): JSX.Element {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { isAuthenticated, logout } = useSpotifyAuthContext();
  const { searchTerm, setSearchTerm, search } = useLibraryContext();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

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
        className="sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center py-4 px-8 gap-4 pointer-events-none"
        aria-label="Top application bar"
      >
        {/* Home Button - Aligned Left */}
        <nav className="pointer-events-auto -ml-1" aria-label="Main navigation">
          <button
            onClick={handleHome}
            disabled={isHome}
            aria-label={t("topBar.home")}
            aria-current={isHome ? "page" : undefined}
            className={`p-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green ${
              isHome
                ? "text-app-text-main/20 cursor-default"
                : "text-app-text-muted hover:text-app-text-main hover:bg-app-surface-hover"
            }`}
            title={t("topBar.home")}
          >
            <svg
              className="w-5 h-5"
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </button>
        </nav>

        {/* Search Bar - Centered */}
        <div
          className="pointer-events-auto w-full max-w-md justify-self-center"
          role="search"
        >
          <style>{`.search-input::-webkit-search-cancel-button{ -webkit-appearance:none; appearance:none; }`}</style>
          <div className="relative group flex items-center">
            <label htmlFor="playlist-search" className="sr-only">
              {t("topBar.searchLabel")}
            </label>
            <input
              id="playlist-search"
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  search(searchTerm);
                }
              }}
              className="search-input block w-full px-4 pr-20 py-2 border border-app-border rounded-full leading-5 bg-app-bg/50 text-app-text-main placeholder-app-text-dim/50 focus:outline-none focus:border-soul-green/50 sm:text-sm transition-all shadow-sm backdrop-blur-sm"
              placeholder={t("topBar.searchPlaceholder")}
            />
            {searchTerm && (
              <button
                className="absolute inset-y-0 right-9 flex items-center px-1 text-app-text-dim hover:text-app-text-main transition-colors"
                aria-label="Clear search"
                onClick={() => setSearchTerm("")}
              >
                <svg
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
            {/* Right Side Actions */}
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                className="px-3 text-app-text-dim hover:text-soul-green focus:text-soul-green transition-colors focus:outline-none rounded-r-full"
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
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="pointer-events-auto mr-1 flex items-center gap-2 bg-app-bg/50 backdrop-blur rounded-full p-2 border border-app-border">
          <button
            onClick={() => setIsSettingsOpen(true)}
            aria-label={t("topBar.settingsOpen")}
            aria-haspopup="dialog"
            data-testid="settings-trigger"
            className="p-2 text-app-text-muted hover:text-app-text-main hover:bg-app-surface-hover rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
            title={t("topBar.settingsOpen")}
          >
            <svg
              className="w-5 h-5"
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>

          <div className="w-px h-4 bg-app-line"></div>

          <button
            onClick={handleLogout}
            aria-label={t("topBar.logout")}
            className="p-2 text-app-text-muted hover:text-red-500 hover:bg-app-surface-hover rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
            title={t("topBar.logout")}
          >
            <svg
              className="w-5 h-5"
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </header>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}
