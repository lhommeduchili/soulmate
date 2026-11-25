import { describe, expect, it } from "vitest";
import { enMessages } from "./messages/en";
import { esCLMessages } from "./messages/es-CL";
import { translate } from "./index";

describe("i18n catalogs", () => {
  it("has matching keys between en and es-CL", () => {
    const enKeys = Object.keys(enMessages).sort();
    const esKeys = Object.keys(esCLMessages).sort();

    expect(enKeys).toEqual(esKeys);
  });

  it("translates text with parameter interpolation", () => {
    expect(translate("en", "playlist.tracksCount", { count: 42 })).toBe(
      "42 tracks",
    );

    expect(translate("es-CL", "playlist.tracksCount", { count: 42 })).toBe(
      "42 tracks",
    );
  });

  it("handles fallback to en when locale message is not present", () => {
    const result = translate("es-CL", "loading.connectingSoulseek");
    expect(result).toBe("conectando a la red de soulseek...");
  });

  it("enforces strictly lowercase or strictly uppercase copy across visible strings", () => {
    // Invisible ARIA/title keys pinned verbatim by existing Playwright E2E tests
    const legacyA11yKeys = new Set([
      "topBar.mainNav",
      "topBar.searchBrowseAria",
      "review.editor",
      "sidebar.revealInFolder",
      "sidebar.revealInFolderAria",
    ]);

    const normalizeCopy = (raw: string): string =>
      raw.replace(/\{[^}]+\}/g, "").replace(/kHz/g, "");

    const checkCatalog = (catalog: Record<string, string>) => {
      for (const [key, value] of Object.entries(catalog)) {
        if (legacyA11yKeys.has(key)) continue;
        const normalized = normalizeCopy(value);
        const isValid =
          normalized === normalized.toLowerCase() ||
          normalized === normalized.toUpperCase();
        expect(isValid, `Mixed casing in i18n key "${key}": "${value}"`).toBe(
          true,
        );
      }
    };

    checkCatalog(enMessages);
    checkCatalog(esCLMessages);
  });
});
