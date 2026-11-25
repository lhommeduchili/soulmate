import { BrowserWindow, app } from "electron";
import { is } from "@electron-toolkit/utils";
import log from "../utils/logger";

export type UpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "up-to-date"
  | "error";

export interface UpdateStatus {
  status: UpdateState;
  version?: string;
  releaseNotes?: string;
  progress?: number;
  error?: string;
}

export class UpdateService {
  private currentStatus: UpdateStatus = {
    status: "idle",
  };
  private listeners: ((status: UpdateStatus) => void)[] = [];
  private isConfigured = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private autoUpdaterInstance: any = null;

  constructor() {
    this.currentStatus.version = this.getAppVersion();
    void this.setupAutoUpdater();
  }

  private getAppVersion(): string {
    try {
      if (typeof app?.getVersion === "function") {
        return app.getVersion();
      }
    } catch {
      // In non-electron testing environments
    }
    return "2.0.0";
  }

  private isDevOrTest(): boolean {
    return (
      is.dev ||
      process.env.NODE_ENV === "test" ||
      process.env.TEST_USER_DATA_DIR !== undefined ||
      process.env.SOULMATE_DISABLE_UPDATES === "true" ||
      process.env.VITEST !== undefined
    );
  }

  private async setupAutoUpdater(): Promise<void> {
    if (this.isConfigured || this.isDevOrTest()) {
      return;
    }

    try {
      const { autoUpdater } = await import("electron-updater");
      this.autoUpdaterInstance = autoUpdater;

      autoUpdater.logger = log;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on("checking-for-update", () => {
        this.setStatus({ status: "checking" });
      });

      autoUpdater.on("update-available", (info) => {
        log.info("[UpdateService] Update available:", info.version);
        this.setStatus({
          status: "available",
          version: info.version,
        });
      });

      autoUpdater.on("update-not-available", (info) => {
        log.info("[UpdateService] Up-to-date:", info?.version);
        this.setStatus({
          status: "up-to-date",
          version: info?.version,
        });
      });

      autoUpdater.on("error", (err) => {
        log.warn("[UpdateService] Update error:", err);
        this.setStatus({
          status: "error",
          error: err.message,
        });
      });

      autoUpdater.on("download-progress", (progressObj) => {
        this.setStatus({
          status: "downloading",
          progress: Math.floor(progressObj.percent),
        });
      });

      autoUpdater.on("update-downloaded", (info) => {
        log.info("[UpdateService] Update downloaded:", info.version);
        this.setStatus({
          status: "downloaded",
          version: info.version,
        });
      });

      this.isConfigured = true;
    } catch (err) {
      log.warn("[UpdateService] Failed to configure autoUpdater:", err);
    }
  }

  getStatus(): UpdateStatus {
    return { ...this.currentStatus };
  }

  onStatusChange(callback: (status: UpdateStatus) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private setStatus(newStatus: Partial<UpdateStatus>): void {
    this.currentStatus = {
      ...this.currentStatus,
      ...newStatus,
    };
    this.broadcastStatus();
  }

  private broadcastStatus(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getStatus());
      } catch (err) {
        log.debug("[UpdateService] Error in status listener:", err);
      }
    }

    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents?.send("update:status-changed", this.getStatus());
      }
    } catch {
      // In isolated environments
    }
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (this.isDevOrTest()) {
      log.info(
        "[UpdateService] Dev/Test environment detected; skipping actual update check",
      );
      return this.getStatus();
    }

    try {
      this.setStatus({ status: "checking" });
      if (this.autoUpdaterInstance) {
        await this.autoUpdaterInstance.checkForUpdates();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({ status: "error", error: msg });
    }
    return this.getStatus();
  }

  quitAndInstall(): void {
    if (this.isDevOrTest()) {
      log.info(
        "[UpdateService] Dev/Test environment: quitAndInstall simulated",
      );
      return;
    }

    try {
      if (this.autoUpdaterInstance) {
        this.autoUpdaterInstance.quitAndInstall();
      }
    } catch (err) {
      log.error("[UpdateService] Failed to execute quitAndInstall:", err);
    }
  }

  /**
   * For Playwright and automated testing: simulates an update status transition
   * and broadcasts the event to all renderer windows.
   */
  setSimulatedStatus(status: UpdateStatus): void {
    this.currentStatus = { ...status };
    this.broadcastStatus();
  }
}
