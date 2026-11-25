import { useEffect, useRef, useState, useMemo } from "react";
import { Track, Playlist } from "../../../shared/types";
import { parseSetlist } from "../../../shared/setlistParser";
import { useI18n } from "../context/I18nContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (playlist: Playlist, tracks: Track[]) => void;
}

const focusableSelector = [
  'button:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function SetlistImportModal({
  isOpen,
  onClose,
  onImportSuccess,
}: Props): JSX.Element | null {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"paste" | "file">("paste");
  const [pasteContent, setPasteContent] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [setlistName, setSetlistName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus restoration & trapping
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((el) => !el.hasAttribute("disabled"));

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  // Real-time track parsing
  const currentContent = activeTab === "paste" ? pasteContent : fileContent;
  const detectedTracks = useMemo<Track[]>(() => {
    if (!currentContent.trim()) return [];
    try {
      return parseSetlist(
        currentContent,
        activeTab === "file" ? selectedFileName : undefined,
      );
    } catch {
      return [];
    }
  }, [currentContent, activeTab, selectedFileName]);

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = (file: File) => {
    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        setFileContent(text);
        if (!setlistName) {
          // Default playlist name to file name without extension
          const baseName = file.name.replace(/\.[^/.]+$/, "");
          setSetlistName(baseName);
        }
      }
    };
    reader.onerror = () => {
      setError(t("setlist.parseError"));
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (detectedTracks.length === 0) {
      setError(t("setlist.parseError"));
      return;
    }

    const playlistId = `setlist-${Date.now()}`;
    const name = setlistName.trim() || t("setlist.importTitle");

    const playlist: Playlist = {
      id: playlistId,
      name,
      description: `${detectedTracks.length} tracks imported from setlist notes`,
      images: [],
      tracks: { total: detectedTracks.length },
      owner: { display_name: "DJ Setlist" },
      type: "setlist",
    };

    try {
      if (window.api?.setlist?.save) {
        await window.api.setlist.save({
          id: playlistId,
          tracks: detectedTracks,
          name,
        });
      }
      onImportSuccess(playlist, detectedTracks);
      onClose();
    } catch (err) {
      console.error("[SetlistImportModal] Save failed:", err);
      setError(t("error.importFailed"));
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setlist-import-title"
        aria-describedby="setlist-import-subtitle"
        data-testid="setlist-import-modal"
        className="relative w-full max-w-2xl bg-app-bg border border-app-line rounded-none flex flex-col max-h-[90vh] overflow-hidden font-mono"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-app-border bg-app-surface">
          <div>
            <h2
              id="setlist-import-title"
              className="font-editorial italic text-xl text-app-text-main flex items-center gap-2 tracking-tight lowercase"
            >
              <span className="w-1.5 h-1.5 rounded-none bg-soul-green animate-pulse" />
              {t("setlist.importTitle")}
            </h2>
            <p
              id="setlist-import-subtitle"
              className="text-xs text-app-text-dim mt-0.5 lowercase"
            >
              {t("setlist.importSubtitle")}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            data-testid="setlist-modal-close"
            aria-label={t("setlist.close")}
            className="px-1.5 py-0.5 text-app-text-dim hover:text-soul-crimson border border-transparent hover:border-soul-crimson/50 rounded-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green font-mono text-xs"
          >
            x
          </button>
        </div>

        {/* Mode Tabs */}
        <div
          role="tablist"
          aria-label={t("setlist.importTitle")}
          className="flex border-b border-app-border bg-app-bg text-xs px-6 pt-2"
        >
          <button
            role="tab"
            aria-selected={activeTab === "paste"}
            data-testid="setlist-tab-paste"
            onClick={() => {
              setActiveTab("paste");
              setError(null);
            }}
            className={`pb-2 px-3 font-semibold tracking-wider lowercase transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green ${
              activeTab === "paste"
                ? "border-soul-green text-soul-green"
                : "border-transparent text-app-text-dim hover:text-app-text-main"
            }`}
          >
            {t("setlist.tabPaste")}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "file"}
            data-testid="setlist-tab-file"
            onClick={() => {
              setActiveTab("file");
              setError(null);
            }}
            className={`pb-2 px-3 font-semibold tracking-wider lowercase transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green ${
              activeTab === "file"
                ? "border-soul-green text-soul-green"
                : "border-transparent text-app-text-dim hover:text-app-text-main"
            }`}
          >
            {t("setlist.tabFile")}
          </button>
        </div>

        {/* Modal Body */}
        <form
          onSubmit={handleSubmit}
          className="p-6 flex flex-col gap-4 overflow-y-auto"
        >
          {/* Setlist Name */}
          <div>
            <label
              htmlFor="setlist-name"
              className="block text-xs font-semibold text-app-text-muted mb-1 lowercase"
            >
              {t("setlist.setlistName")}
            </label>
            <input
              id="setlist-name"
              type="text"
              value={setlistName}
              onChange={(e) => setSetlistName(e.target.value)}
              placeholder={t("setlist.setlistNamePlaceholder")}
              data-testid="setlist-name-input"
              className="w-full bg-app-surface border border-app-border focus:border-soul-green rounded-none px-3 py-2 text-xs text-app-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
            />
          </div>

          {/* Mode 1: Paste Textarea */}
          {activeTab === "paste" && (
            <div>
              <label
                htmlFor="setlist-textarea"
                className="block text-xs font-semibold text-app-text-muted mb-1 lowercase"
              >
                {t("setlist.tabPaste")}
              </label>
              <textarea
                id="setlist-textarea"
                rows={9}
                value={pasteContent}
                onChange={(e) => {
                  setPasteContent(e.target.value);
                  setError(null);
                }}
                placeholder={t("setlist.pastePlaceholder")}
                data-testid="setlist-paste-textarea"
                className="w-full bg-app-surface border border-app-border focus:border-soul-green rounded-none p-3 text-xs text-app-text-main placeholder-app-text-dim/40 leading-relaxed font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green resize-none"
              />
            </div>
          )}

          {/* Mode 2: File Drop */}
          {activeTab === "file" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleFileInputChange}
                data-testid="setlist-file-input"
                className="hidden"
              />
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                data-testid="setlist-dropzone"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`border rounded-none p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green ${
                  isDragging
                    ? "border-soul-green bg-soul-green/10"
                    : "border-app-line hover:border-soul-green bg-app-surface"
                }`}
              >
                <div className="w-10 h-10 rounded-none border border-soul-green/40 bg-app-bg flex items-center justify-center text-soul-green">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <p className="text-xs text-app-text-muted max-w-sm lowercase leading-relaxed">
                  {selectedFileName
                    ? t("setlist.fileSelected", { filename: selectedFileName })
                    : t("setlist.fileDropHint")}
                </p>
                {selectedFileName && (
                  <span className="text-[10px] text-soul-green bg-app-bg border border-soul-green/40 px-2 py-0.5 rounded-none">
                    {selectedFileName}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              data-testid="setlist-error-msg"
              className="text-xs text-soul-red bg-soul-oxblood/50 border border-soul-crimson px-3 py-2 rounded-none font-mono lowercase"
            >
              {error}
            </div>
          )}

          {/* Footer Telemetry & Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-app-border">
            <div
              data-testid="setlist-track-count"
              className="text-xs text-soul-green font-mono flex items-center gap-1.5 lowercase tabular-nums"
            >
              <span className="w-1.5 h-1.5 rounded-none bg-soul-green" />
              <span>
                {t("setlist.tracksDetected", { count: detectedTracks.length })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-app-text-dim hover:text-app-text-main border border-app-border hover:border-app-text-main transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green rounded-none lowercase"
              >
                {t("sidebar.cancelQuery")}
              </button>
              <button
                type="submit"
                disabled={detectedTracks.length === 0}
                data-testid="setlist-submit-btn"
                className="px-4 py-1.5 bg-app-text-main text-app-bg hover:bg-soul-green border border-app-text-main hover:border-soul-green disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-xs lowercase tracking-wider rounded-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
              >
                {t("setlist.importButton")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
