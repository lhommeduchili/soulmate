import { useState, useEffect } from "react";
import { useI18n } from "../context/I18nContext";

const FORMATS = ["aiff", "wav", "flac", "mp3"];

export function FormatSelector(): JSX.Element {
  const [priority, setPriority] = useState<string[]>(FORMATS);
  const { t } = useI18n();

  useEffect(() => {
    window.api.queue.getPriority().then((p: string[]) => {
      if (p && p.length > 0) setPriority(p);
    });
  }, []);

  const handleMove = (index: number, direction: -1 | 1) => {
    const newPriority = [...priority];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newPriority.length) return;

    const temp = newPriority[index];
    newPriority[index] = newPriority[targetIndex];
    newPriority[targetIndex] = temp;

    setPriority(newPriority);
    window.api.queue.setPriority(newPriority);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full flex items-center justify-center mb-4">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-app-border" />
        <h3 className="relative px-3 bg-app-surface text-soul-green/70 text-xs font-mono uppercase tracking-widest text-center">
          {t("format.title")}
        </h3>
      </div>
      <div className="flex bg-app-surface/80 p-1 rounded-lg border border-app-border">
        {priority.map((fmt, idx) => (
          <div key={fmt} className="group relative flex items-center">
            <div className="px-4 py-2 bg-app-bg border border-app-border rounded mx-1 text-app-text-muted font-mono text-sm uppercase group-hover:border-soul-green/50 group-hover:text-soul-green transition-colors cursor-default">
              {fmt}
            </div>

            {/* Hover Controls */}
            <div className="absolute inset-0 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity px-1 pointer-events-none">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMove(idx, -1);
                }}
                disabled={idx === 0}
                tabIndex={-1}
                aria-label={t("format.moveLeft", { format: fmt.toUpperCase() })}
                className="pointer-events-auto text-soul-green disabled:opacity-0 hover:bg-soul-green/20 rounded-full p-1"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMove(idx, 1);
                }}
                disabled={idx === priority.length - 1}
                tabIndex={-1}
                aria-label={t("format.moveRight", {
                  format: fmt.toUpperCase(),
                })}
                className="pointer-events-auto text-soul-green disabled:opacity-0 hover:bg-soul-green/20 rounded-full p-1"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-app-text-dim mt-2 font-mono">
        {t("format.highest")}
        <span className="mx-2">◄──────────►</span>
        {t("format.lowest")}
      </div>
    </div>
  );
}
