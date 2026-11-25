import { useSafeI18n } from "../context/I18nContext";

export interface PageErrorFallbackProps {
  page: string;
  error?: Error;
  onRetry?: () => void;
  onResetWorkspace?: () => void;
}

export function PageErrorFallback({
  page,
  error,
  onRetry,
  onResetWorkspace,
}: PageErrorFallbackProps): JSX.Element {
  const { t } = useSafeI18n();

  const handleResetWorkspace = () => {
    if (typeof window !== "undefined") {
      (
        window as unknown as { __simulateComponentCrash?: unknown }
      ).__simulateComponentCrash = undefined;
    }
    if (onResetWorkspace) {
      onResetWorkspace();
    }
    // Safe navigation to home hash route
    try {
      window.location.hash = "#/";
    } catch {
      window.location.href = "/";
    }
    if (onRetry) {
      onRetry();
    }
  };

  const handleRetry = () => {
    if (typeof window !== "undefined") {
      (
        window as unknown as { __simulateComponentCrash?: unknown }
      ).__simulateComponentCrash = undefined;
    }
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center h-full min-h-[320px] w-full bg-app-bg nocturne-ground text-app-text-main p-6 font-mono border border-app-line rounded-none relative overflow-hidden"
      role="alert"
      aria-live="assertive"
      data-testid="page-error-fallback"
    >
      {/* Matrix Subsystem Fault Badge */}
      <div className="z-10 inline-flex items-center gap-2 px-3 py-1 rounded-none bg-soul-oxblood/60 border border-soul-crimson text-soul-red text-xs font-mono tracking-widest uppercase mb-3">
        <span className="w-2 h-2 rounded-none bg-soul-crimson animate-ping" />
        <span>{t("error.boundary.title")}</span>
      </div>

      {/* Subsystem Name Title */}
      <h2 className="z-10 text-base md:text-lg font-bold text-soul-green mb-1 lowercase tracking-wide">
        {t("error.boundary.pageTitle", { page })}
      </h2>

      <p className="z-10 text-xs text-app-text-muted mb-4 text-center max-w-md lowercase">
        {t("error.boundary.subtitle")}
      </p>

      {/* Diagnostic telemetry box */}
      <div className="z-10 w-full max-w-lg bg-app-surface border border-app-border rounded-none p-3 mb-5 text-xs font-mono">
        <div className="text-[10px] text-app-text-dim uppercase tracking-wider mb-1 flex items-center justify-between">
          <span>{t("error.boundary.diagnostics")}</span>
          <span className="text-soul-green">STATUS: RECOVERABLE</span>
        </div>
        <div className="text-soul-red font-mono text-[11px] break-words line-clamp-3 select-all">
          {error?.message || "Subsystem fault detected without error detail"}
        </div>
      </div>

      {/* Recovery Actions */}
      <div className="z-10 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-app-text-main hover:bg-soul-green text-app-bg font-semibold rounded-none border border-app-text-main hover:border-soul-green text-xs lowercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
          aria-label={t("error.boundary.retryAria")}
          data-testid="error-retry-button"
        >
          {t("error.boundary.retry")}
        </button>

        <button
          onClick={handleResetWorkspace}
          className="px-4 py-2 bg-app-bg hover:bg-app-text-main text-app-text-main hover:text-app-bg border border-app-line rounded-none text-xs lowercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
          aria-label={t("error.boundary.resetWorkspaceAria")}
          data-testid="error-reset-workspace-button"
        >
          {t("error.boundary.resetWorkspace")}
        </button>

        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-app-bg hover:bg-app-surface-hover text-app-text-dim border border-app-border hover:text-app-text-main rounded-none text-xs lowercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green"
          aria-label={t("error.boundary.reloadAria")}
          data-testid="error-reload-button"
        >
          {t("error.boundary.reload")}
        </button>
      </div>
    </div>
  );
}
