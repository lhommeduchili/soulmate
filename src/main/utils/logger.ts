import log from "electron-log";
import { app } from "electron";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Returns a reliable log directory even if app.getPath('userData') is unavailable
 * (e.g. in test suites, worker threads, or before Electron app initialization).
 */
export function getSafeLogDirectory(): string {
  try {
    if (app && typeof app.getPath === "function") {
      return join(app.getPath("userData"), "logs");
    }
  } catch {
    // app.getPath threw in test or uninitialized environment
  }

  return (
    process.env.SOULMATE_LOG_DIR ||
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? join(
          process.env.HOME || tmpdir(),
          "Library/Application Support/soulmate/logs",
        )
      : join(process.env.HOME || tmpdir(), ".config/soulmate/logs"))
  );
}

const logDirectory = getSafeLogDirectory();
log.transports.file.resolvePathFn = () => join(logDirectory, "main.log");
log.transports.file.level = "info";
log.transports.console.level = "debug";

// Structured log format: timestamp, level, component scope, text
const logFormat = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope} {text}";
log.transports.console.format = logFormat;
log.transports.file.format = logFormat;

/**
 * Creates a component-scoped logger for structured component tagging
 */
export function createComponentLogger(component: string) {
  return typeof log.scope === "function" ? log.scope(component) : log;
}

export default log;
