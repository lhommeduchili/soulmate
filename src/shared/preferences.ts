import {
  AppLocale,
  AppLocaleSchema,
  AppRegion,
  AppRegionSchema,
  FormatPriority,
  FormatPrioritySchema,
  PartialUserPreferencesSchema,
  UserPreferences,
  UserPreferencesSchema,
} from "./schemas";

export const appLocaleSchema = AppLocaleSchema;
export const appRegionSchema = AppRegionSchema;
export const formatPrioritySchema = FormatPrioritySchema;

export type { AppLocale, AppRegion, FormatPriority };
export type AppPreferences = UserPreferences;

export const DEFAULT_PREFERENCES: AppPreferences = {
  downloadPath: "",
  formatPriority: "flac",
  locale: "es-CL",
  region: "CL",
  maxConcurrentDownloads: 2,
  autoQueryCascade: true,
  downloadSpeedLimit: 0,
  enableReplayGain: true,
};

export const preferencesSchema = UserPreferencesSchema;
export const partialPreferencesSchema = PartialUserPreferencesSchema;

export function mergePreferences(
  preferences?: Partial<AppPreferences> | null,
): AppPreferences {
  const raw: Record<string, unknown> = {
    ...DEFAULT_PREFERENCES,
    ...(preferences || {}),
  };

  // Gracefully migrate legacy array formatPriority to new enum
  if (Array.isArray(raw.formatPriority)) {
    raw.formatPriority = "flac";
  }

  return preferencesSchema.parse(raw);
}
