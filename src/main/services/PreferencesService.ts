import { app } from "electron";
import { join } from "path";
import { store } from "../store";
import {
  AppPreferences,
  DEFAULT_PREFERENCES,
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
    const parsed = partialPreferencesSchema.parse(nextPreferences);
    const merged = mergePreferences({
      ...this.getPreferences(),
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

  getFormatPriority(): string[] {
    return this.getPreferences().formatPriority;
  }

  setFormatPriority(formatPriority: string[]): AppPreferences {
    return this.updatePreferences({ formatPriority });
  }

  getRegion(): AppPreferences["region"] {
    return this.getPreferences().region;
  }
}
