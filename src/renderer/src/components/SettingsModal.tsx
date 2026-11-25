import { useEffect, useMemo, useRef, useState } from "react";
import { AppLocale } from "../../../shared/preferences";
import { UpdateStatus } from "../../../shared/types";
import { useI18n } from "../context/I18nContext";
import { usePreferences } from "../hooks/usePreferences";
import { useSpotifyAuthContext } from "../context/SpotifyAuthContext";
import { FormatSelector } from "./FormatSelector";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const focusableSelector = [
  'button:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function SettingsModal({ isOpen, onClose }: Props): JSX.Element | null {
  const { t } = useI18n();
  const { preferences, updatePreferences } = usePreferences();
  const {
    isAuthenticated: isSpotifyConnected,
    login: loginSpotify,
    logout: logoutSpotify,
  } = useSpotifyAuthContext();
  const [isDirChanged, setIsDirChanged] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !window.api?.update) return;

    window.api.update
      .getStatus()
      .then((status) => setUpdateStatus(status))
      .catch((err) => console.debug("[SettingsModal] getStatus error:", err));

    const unsubscribe = window.api.update.onStatusChange((status) => {
      setUpdateStatus(status);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  const handleCheckUpdates = async () => {
    if (!window.api?.update) return;
    setIsCheckingUpdate(true);
    try {
      const status = await window.api.update.check();
      setUpdateStatus(status);
    } catch (err) {
      console.debug("[SettingsModal] check error:", err);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const languageOptions = useMemo<Array<{ value: AppLocale; label: string }>>(
    () => [
      { value: "es-CL", label: t("settings.language.es-CL") },
      { value: "en", label: t("settings.language.en") },
    ],
    [t],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setIsDirChanged(false);
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

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

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleChangeDir = async () => {
    const newPath = await window.api.settings.selectDirectory();
    if (newPath) {
      await updatePreferences({ downloadPath: newPath });
      setIsDirChanged(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings-modal"
        className="bg-app-bg border border-app-line rounded-none p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative font-mono"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={t("settings.close")}
          data-testid="settings-close-button"
          className="absolute top-4 right-4 text-app-text-dim hover:text-soul-crimson focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green rounded-none px-1.5 py-0.5 border border-transparent hover:border-soul-crimson/50 font-mono text-xs transition-colors"
        >
          x
        </button>

        <h2
          id="settings-title"
          className="font-editorial italic text-2xl text-app-text-main mb-5 tracking-tight lowercase"
        >
          {t("settings.title")}
        </h2>
        <div className="space-y-6">
          {/* Download Directory */}
          <div className="space-y-2 flex flex-col items-center w-full">
            <div className="relative w-full flex items-center justify-center mb-1">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
              <span className="relative px-3 bg-app-bg text-soul-green text-[11px] font-mono lowercase tracking-widest text-center">
                {t("settings.downloadDirectory")}
              </span>
            </div>
            <div className="flex gap-2 w-full">
              <div
                className="flex-1 min-w-0 bg-app-surface border border-app-border rounded-none px-3 py-2 text-xs text-app-text-muted font-mono truncate cursor-default"
                title={preferences.downloadPath}
              >
                {preferences.downloadPath || "..."}
              </div>
              <button
                type="button"
                onClick={handleChangeDir}
                data-testid="downloads-directory-button"
                className="px-3 py-2 bg-app-bg border border-app-line hover:bg-app-text-main hover:text-app-bg text-app-text-main rounded-none text-xs font-mono lowercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
              >
                {t("settings.changeDirectory")}
              </button>
            </div>
            {isDirChanged && (
              <div
                className="text-[10px] text-soul-red lowercase"
                role="status"
                aria-live="polite"
              >
                {t("settings.restartWarning")}
              </div>
            )}
          </div>

          {/* Language Selection */}
          <div>
            <label className="flex flex-col gap-2 text-sm text-app-text-main">
              <div className="relative w-full flex items-center justify-center mb-1">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
                <span className="relative px-3 bg-app-bg text-soul-green text-[11px] font-mono lowercase tracking-widest text-center">
                  {t("settings.language")}
                </span>
              </div>
              <select
                value={preferences.locale}
                data-testid="language-select"
                onChange={(event) => {
                  void updatePreferences({
                    locale: event.target.value as AppLocale,
                  });
                }}
                className="bg-app-surface border border-app-border focus:border-soul-green rounded-none px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green text-xs font-mono lowercase"
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Max Concurrent Downloads */}
          <div>
            <label className="flex flex-col gap-2 text-sm text-app-text-main">
              <div className="relative w-full flex items-center justify-center mb-1">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
                <span className="relative px-3 bg-app-bg text-soul-green text-[11px] font-mono lowercase tracking-widest text-center">
                  {t("settings.concurrency")}
                </span>
              </div>
              <select
                value={preferences.maxConcurrentDownloads ?? 2}
                data-testid="concurrency-select"
                onChange={(event) => {
                  void updatePreferences({
                    maxConcurrentDownloads: parseInt(event.target.value, 10),
                  });
                }}
                className="bg-app-surface border border-app-border focus:border-soul-green rounded-none px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green text-xs font-mono lowercase"
              >
                <option value="1">1</option>
                <option value="2">
                  2 ({t("settings.concurrency.default")})
                </option>
                <option value="3">3</option>
                <option value="0">{t("settings.concurrency.unlimited")}</option>
              </select>
            </label>
          </div>

          {/* Format Priority */}
          <div>
            <FormatSelector />
          </div>

          {/* Smart Search Query Expansion Cascade */}
          <div className="space-y-2 flex flex-col items-center w-full">
            <div className="relative w-full flex items-center justify-center mb-1">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
              <span className="relative px-3 bg-app-bg text-soul-green text-[11px] font-mono lowercase tracking-widest text-center">
                {t("settings.autoQueryCascade")}
              </span>
            </div>
            <div className="flex items-center justify-between w-full bg-app-surface border border-app-border rounded-none px-4 py-3">
              <div className="flex flex-col pr-4">
                <span className="text-xs font-mono text-app-text-main lowercase">
                  {t("settings.autoQueryCascade")}
                </span>
                <span className="text-[10px] font-mono text-app-text-dim lowercase leading-relaxed">
                  {t("settings.autoQueryCascadeDesc")}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  data-testid="auto-query-cascade-toggle"
                  checked={preferences.autoQueryCascade ?? true}
                  onChange={(e) => {
                    void updatePreferences({
                      autoQueryCascade: e.target.checked,
                    });
                  }}
                  className="sr-only peer"
                  aria-label={t("settings.autoQueryCascade")}
                />
                <div className="w-9 h-5 bg-app-bg border border-app-line peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-soul-green rounded-none peer peer-checked:after:translate-x-full peer-checked:after:bg-app-bg after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-app-text-main after:rounded-none after:h-4 after:w-4 after:transition-all peer-checked:bg-soul-green peer-checked:border-soul-green" />
              </label>
            </div>
          </div>

          {/* Dynamic Bandwidth Rate Limiting */}
          <div className="space-y-2 flex flex-col items-center w-full">
            <div className="relative w-full flex items-center justify-center mb-1">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
              <span className="relative px-3 bg-app-bg text-soul-green text-[11px] font-mono lowercase tracking-widest text-center">
                {t("settings.bandwidthLimit")}
              </span>
            </div>
            <div className="flex items-center justify-between w-full bg-app-surface border border-app-border rounded-none px-4 py-3">
              <div className="flex flex-col pr-4">
                <span className="text-xs font-mono text-app-text-main lowercase">
                  {t("settings.bandwidthLimit")}
                </span>
                <span className="text-[10px] font-mono text-app-text-dim lowercase leading-relaxed">
                  {t("settings.bandwidthLimitDesc")}
                </span>
              </div>
              <select
                data-testid="bandwidth-limit-select"
                value={String(preferences.downloadSpeedLimit ?? 0)}
                onChange={(e) => {
                  void updatePreferences({
                    downloadSpeedLimit: Number(e.target.value),
                  });
                }}
                className="bg-app-bg border border-app-line rounded-none px-3 py-1.5 text-xs font-mono text-app-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green cursor-pointer shrink-0 lowercase"
                aria-label={t("settings.bandwidthLimit")}
              >
                <option value="0">{t("settings.bandwidthUnlimited")}</option>
                <option value="500">{t("settings.bandwidth500KB")}</option>
                <option value="2000">{t("settings.bandwidth2MB")}</option>
                <option value="5000">{t("settings.bandwidth5MB")}</option>
              </select>
            </div>
          </div>

          {/* ReplayGain 2.0 / EBU R128 Loudness Normalization */}
          <div className="space-y-2 flex flex-col items-center w-full">
            <div className="relative w-full flex items-center justify-center mb-1">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
              <span className="relative px-3 bg-app-bg text-soul-green text-[11px] font-mono lowercase tracking-widest text-center">
                {t("settings.replayGain")}
              </span>
            </div>
            <div className="flex items-center justify-between w-full bg-app-surface border border-app-border rounded-none px-4 py-3">
              <div className="flex flex-col pr-4">
                <span className="text-xs font-mono text-app-text-main lowercase">
                  {t("settings.replayGain")}
                </span>
                <span className="text-[10px] font-mono text-app-text-dim lowercase leading-relaxed">
                  {t("settings.replayGainDesc")}
                </span>
              </div>
              <label
                data-testid="replaygain-toggle-label"
                className="relative inline-flex items-center cursor-pointer shrink-0"
              >
                <input
                  type="checkbox"
                  data-testid="replaygain-toggle"
                  checked={preferences.enableReplayGain ?? true}
                  onChange={(e) => {
                    void updatePreferences({
                      enableReplayGain: e.target.checked,
                    });
                  }}
                  className="sr-only peer"
                  aria-label={t("settings.replayGain")}
                />
                <div className="w-9 h-5 bg-app-bg border border-app-line peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-soul-green rounded-none peer peer-checked:after:translate-x-full peer-checked:after:bg-app-bg after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-app-text-main after:rounded-none after:h-4 after:w-4 after:transition-all peer-checked:bg-soul-green peer-checked:border-soul-green" />
              </label>
            </div>
          </div>

          {/* Spotify Account (Optional Sync) */}
          <div className="space-y-2 flex flex-col items-center w-full">
            <div className="relative w-full flex items-center justify-center mb-1">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
              <span className="relative px-3 bg-app-bg text-soul-green text-[11px] font-mono lowercase tracking-widest text-center">
                {t("settings.spotifySync")}
              </span>
            </div>
            <p className="text-xs text-app-text-dim text-center mb-1 lowercase leading-relaxed">
              {t("settings.spotifySyncDesc")}
            </p>
            <div className="flex items-center justify-between w-full bg-app-surface border border-app-border rounded-none px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-none ${
                    isSpotifyConnected
                      ? "bg-soul-green animate-pulse"
                      : "bg-app-text-dim/40"
                  }`}
                  aria-hidden="true"
                />
                <span className="text-xs font-mono text-app-text-muted lowercase">
                  {isSpotifyConnected
                    ? t("settings.spotifyConnected")
                    : t("settings.spotifyDisconnected")}
                </span>
              </div>
              {isSpotifyConnected ? (
                <button
                  type="button"
                  onClick={logoutSpotify}
                  data-testid="settings-spotify-logout"
                  className="px-3 py-1.5 bg-app-bg border border-soul-crimson/60 hover:bg-soul-oxblood/50 text-soul-red rounded-none text-xs font-mono lowercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
                  aria-label={t("settings.spotifyDisconnect")}
                >
                  {t("settings.spotifyDisconnect")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={loginSpotify}
                  data-testid="settings-spotify-connect"
                  className="px-3 py-1.5 bg-app-text-main hover:bg-soul-green text-app-bg border border-app-text-main hover:border-soul-green rounded-none text-xs font-mono font-semibold lowercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
                  aria-label={t("settings.spotifyConnect")}
                >
                  {t("settings.spotifyConnect")}
                </button>
              )}
            </div>
          </div>

          {/* Software Updates */}
          <div className="space-y-2 flex flex-col items-center w-full">
            <div className="relative w-full flex items-center justify-center mb-1">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
              <span className="relative px-3 bg-app-bg text-soul-green text-[11px] font-mono lowercase tracking-widest text-center">
                {t("settings.updatesTitle")}
              </span>
            </div>
            <div className="flex items-center justify-between w-full bg-app-surface border border-app-border rounded-none px-4 py-3">
              <div className="flex flex-col">
                <span className="text-xs font-mono text-app-text-main lowercase">
                  soulmate{" "}
                  {updateStatus?.version
                    ? `v${updateStatus.version}`
                    : "v1.1.2"}
                </span>
                <span className="text-[10px] font-mono text-app-text-dim lowercase">
                  {updateStatus?.status === "downloaded"
                    ? t("update.downloaded")
                    : updateStatus?.status === "checking" || isCheckingUpdate
                      ? t("update.checking")
                      : updateStatus?.status === "available"
                        ? t("update.available", {
                            version: updateStatus.version
                              ? `v${updateStatus.version}`
                              : "",
                          })
                        : t("update.upToDate")}
                </span>
              </div>
              {updateStatus?.status === "downloaded" ? (
                <button
                  type="button"
                  onClick={() => window.api.update?.install()}
                  data-testid="install-update-button"
                  className="px-3 py-1.5 bg-soul-green text-app-bg border border-soul-green font-semibold rounded-none text-xs font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green lowercase tracking-wide"
                >
                  {t("update.install")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCheckUpdates}
                  data-testid="check-updates-button"
                  disabled={isCheckingUpdate}
                  className="px-3 py-1.5 bg-app-bg border border-app-line hover:bg-app-text-main hover:text-app-bg text-app-text-muted rounded-none text-xs font-mono lowercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green disabled:opacity-50"
                >
                  {isCheckingUpdate ? t("update.checking") : t("update.check")}
                </button>
              )}
            </div>
          </div>

          {/* Close Action */}
          <div className="flex justify-end pt-3 w-full border-t border-app-border">
            <button
              type="button"
              onClick={onClose}
              data-testid="settings-dismiss-button"
              className="px-4 py-2 bg-app-bg border border-app-line hover:bg-app-text-main hover:text-app-bg text-app-text-main rounded-none text-xs font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green lowercase"
              aria-label={t("settings.close")}
            >
              {t("settings.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
