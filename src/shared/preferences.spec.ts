import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  preferencesSchema,
} from "./preferences";

describe("preferences defaults", () => {
  it("uses chile defaults", () => {
    expect(DEFAULT_PREFERENCES.locale).toBe("es-CL");
    expect(DEFAULT_PREFERENCES.region).toBe("CL");
  });

  it("merges persisted values over defaults", () => {
    expect(mergePreferences({ locale: "es-CL" })).toEqual({
      ...DEFAULT_PREFERENCES,
      locale: "es-CL",
    });
  });

  it("rejects unsupported locale values", () => {
    expect(() =>
      preferencesSchema.parse({ locale: "fr-FR", region: "CL" }),
    ).toThrow();
  });
});
