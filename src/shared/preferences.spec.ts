import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  preferencesSchema,
} from "./preferences";

describe("preferences defaults & validation", () => {
  it("uses chile defaults", () => {
    expect(DEFAULT_PREFERENCES.locale).toBe("es-CL");
    expect(DEFAULT_PREFERENCES.region).toBe("CL");
    expect(DEFAULT_PREFERENCES.formatPriority).toBe("flac");
    expect(DEFAULT_PREFERENCES.maxConcurrentDownloads).toBe(2);
  });

  it("merges persisted values over defaults", () => {
    expect(mergePreferences({ locale: "es-CL" })).toEqual({
      ...DEFAULT_PREFERENCES,
      locale: "es-CL",
    });

    expect(
      mergePreferences({ formatPriority: "320kbps", region: "US" }),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      formatPriority: "320kbps",
      region: "US",
    });
  });

  it("migrates legacy array formatPriority to flac default", () => {
    const merged = mergePreferences({
      // @ts-expect-error test migration from legacy array
      formatPriority: ["aiff", "wav", "flac", "mp3"],
    });
    expect(merged.formatPriority).toBe("flac");
  });

  it("rejects unsupported locale values", () => {
    expect(() =>
      preferencesSchema.parse({ locale: "fr-FR", region: "CL" }),
    ).toThrow();
  });

  it("rejects unsupported region values", () => {
    expect(() =>
      preferencesSchema.parse({ locale: "es-CL", region: "ZZ" }),
    ).toThrow();
  });

  it("rejects unsupported formatPriority values", () => {
    expect(() =>
      preferencesSchema.parse({
        locale: "es-CL",
        region: "CL",
        formatPriority: "mp3_128",
      }),
    ).toThrow();
  });
});
