import { z } from "zod";

export const appLocaleSchema = z.enum(["es-CL", "en"]);
export const appRegionSchema = z.enum(["CL"]);

export type AppLocale = z.infer<typeof appLocaleSchema>;
export type AppRegion = z.infer<typeof appRegionSchema>;

export interface AppPreferences {
  downloadPath: string;
  formatPriority: string[];
  locale: AppLocale;
  region: AppRegion;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  downloadPath: "",
  formatPriority: ["aiff", "wav", "flac", "mp3"],
  locale: "es-CL",
  region: "CL",
};

export const preferencesSchema = z.object({
  downloadPath: z.string(),
  formatPriority: z.array(z.string().min(1)).min(1),
  locale: appLocaleSchema,
  region: appRegionSchema,
});

export const partialPreferencesSchema = preferencesSchema.partial();

export function mergePreferences(
  preferences: Partial<AppPreferences>,
): AppPreferences {
  return preferencesSchema.parse({
    ...DEFAULT_PREFERENCES,
    ...preferences,
  });
}
