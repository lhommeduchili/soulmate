import { app } from "electron";
import { join } from "path";
import { store } from "../store";
import {
  AppPreferences,
  DEFAULT_PREFERENCES,
  FormatPriority,
  partialPreferencesSchema,
  mergePreferences,
} from "../../shared/preferences";

export class PreferencesService {
  getPreferences(): AppPreferences {
    const stored = store.get("preferences");
    const merged = mergePreferences(stored ?? DEFAULT_PREFERENCES);

    if (!merged.downloadPath) {
      return {
        ...merged,
        downloadPath: this.getDefaultDownloadPath(),
      };
    }

    return merged;
  }

  updatePreferences(nextPreferences: Partial<AppPreferences>): AppPreferences {
    const current = this.getPreferences();
    const parsed = partialPreferencesSchema.parse(nextPreferences);
    const merged = mergePreferences({
      ...current,
      ...parsed,
    });

    store.set("preferences", merged);
    return merged;
  }

  getDefaultDownloadPath(): string {
    return join(app.getPath("downloads"), "soulmate downloads");
  }

  getDownloadPath(): string {
    return this.getPreferences().downloadPath || this.getDefaultDownloadPath();
  }

  setDownloadPath(downloadPath: string): AppPreferences {
    return this.updatePreferences({ downloadPath });
  }

  getFormatPriority(): FormatPriority {
    return this.getPreferences().formatPriority;
  }

  setFormatPriority(formatPriority: FormatPriority): AppPreferences {
    return this.updatePreferences({ formatPriority });
  }

  getRegion(): AppPreferences["region"] {
    return this.getPreferences().region;
  }

  setRegion(region: AppPreferences["region"]): AppPreferences {
    return this.updatePreferences({ region });
  }

  getLocale(): AppPreferences["locale"] {
    return this.getPreferences().locale;
  }

  setLocale(locale: AppPreferences["locale"]): AppPreferences {
    return this.updatePreferences({ locale });
  }

  getMaxConcurrentDownloads(): number {
    return this.getPreferences().maxConcurrentDownloads ?? 2;
  }

  setMaxConcurrentDownloads(maxConcurrentDownloads: number): AppPreferences {
    return this.updatePreferences({ maxConcurrentDownloads });
  }

  isAutoQueryCascadeEnabled(): boolean {
    return this.getPreferences().autoQueryCascade ?? true;
  }

  setAutoQueryCascade(autoQueryCascade: boolean): AppPreferences {
    return this.updatePreferences({ autoQueryCascade });
  }

  getDownloadSpeedLimit(): number {
    return this.getPreferences().downloadSpeedLimit ?? 0;
  }

  setDownloadSpeedLimit(downloadSpeedLimit: number): AppPreferences {
    return this.updatePreferences({ downloadSpeedLimit });
  }
}
