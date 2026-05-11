import { useEffect, useMemo, useRef, useState } from "react";
import { AppLocale } from "../../../shared/preferences";
import { useI18n } from "../context/I18nContext";
import { usePreferences } from "../hooks/usePreferences";
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
  const [isDirChanged, setIsDirChanged] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 backdrop-blur-sm px-4"
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
        className="bg-app-surface border border-app-line rounded-lg p-6 w-full max-w-md relative shadow-2xl"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={t("settings.close")}
          data-testid="settings-close-button"
          className="absolute top-4 right-4 text-app-text-dim hover:text-app-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green rounded-full p-1"
        >
          <svg
            className="w-6 h-6"
            aria-hidden="true"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h2
          id="settings-title"
          className="text-xl font-bold text-app-text-main mb-2 tracking-tight lowercase"
        >
          {t("settings.title")}
        </h2>
        <div className="space-y-6">
          <div className="space-y-2 flex flex-col items-center w-full">
            <div className="relative w-full flex items-center justify-center mb-2">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
              <span className="relative px-3 bg-app-surface text-soul-green/70 text-xs font-mono uppercase tracking-widest text-center">
                {t("settings.downloadDirectory")}
              </span>
            </div>
            <div className="flex gap-2 w-full">
              <div
                className="flex-1 min-w-0 bg-app-bg border border-app-border rounded px-3 py-2 text-xs text-app-text-muted font-mono truncate cursor-default"
                title={preferences.downloadPath}
              >
                {preferences.downloadPath || "..."}
              </div>
              <button
                type="button"
                onClick={handleChangeDir}
                data-testid="downloads-directory-button"
                className="px-3 py-2 bg-app-surface-hover hover:bg-app-surface-active text-app-text-main rounded text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
              >
                {t("settings.changeDirectory")}
              </button>
            </div>
            {isDirChanged && (
              <div
                className="text-[10px] text-soul-warning"
                role="status"
                aria-live="polite"
              >
                {t("settings.restartWarning")}
              </div>
            )}
          </div>

          <div>
            <FormatSelector />
          </div>

          <div>
            <label className="flex flex-col gap-2 text-sm text-app-text-main">
              <div className="relative w-full flex items-center justify-center mb-2">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
                <span className="relative px-3 bg-app-surface text-soul-green/70 text-xs font-mono uppercase tracking-widest text-center">
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
                className="bg-app-bg border border-app-border rounded px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
