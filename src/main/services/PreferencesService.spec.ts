import { vi, describe, it, expect, beforeEach } from "vitest";
import { PreferencesService } from "./PreferencesService";
import { store } from "../store";
import {
  AppLocaleSchema,
  AppRegionSchema,
  FormatPrioritySchema,
  UserPreferencesSchema,
} from "../../shared/schemas";

// Mock electron
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/mock/downloads"),
    setPath: vi.fn(),
  },
}));

// Mock store
vi.mock("../store", () => ({
  store: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("PreferencesService & UserPreferencesSchema", () => {
  let service: PreferencesService;
  let mockStoreData: Record<string, unknown>;

  beforeEach(() => {
    mockStoreData = {};
    vi.mocked(store.get).mockImplementation(
      (key: string) => mockStoreData[key] as never,
    );
    vi.mocked(store.set).mockImplementation(
      (keyOrObject: string | Record<string, unknown>, val?: unknown): void => {
        if (typeof keyOrObject === "string") {
          mockStoreData[keyOrObject] = val;
        }
      },
    );
    service = new PreferencesService();
  });

  describe("Schema Validation (Zod)", () => {
    it("validates supported locales (es-CL, en)", () => {
      expect(AppLocaleSchema.parse("es-CL")).toBe("es-CL");
      expect(AppLocaleSchema.parse("en")).toBe("en");
      expect(() => AppLocaleSchema.parse("fr-FR")).toThrow();
      expect(() => AppLocaleSchema.parse("de")).toThrow();
    });

    it("validates supported regions with CL as default", () => {
      expect(AppRegionSchema.parse("CL")).toBe("CL");
      expect(AppRegionSchema.parse("US")).toBe("US");
      expect(AppRegionSchema.parse("GB")).toBe("GB");
      expect(() => AppRegionSchema.parse("UNKNOWN")).toThrow();
    });

    it("validates format priority options (flac, 320kbps, any)", () => {
      expect(FormatPrioritySchema.parse("flac")).toBe("flac");
      expect(FormatPrioritySchema.parse("320kbps")).toBe("320kbps");
      expect(FormatPrioritySchema.parse("any")).toBe("any");
      expect(() => FormatPrioritySchema.parse("128kbps")).toThrow();
    });

    it("validates full preferences payload with defaults", () => {
      const parsed = UserPreferencesSchema.parse({});
      expect(parsed.locale).toBe("es-CL");
      expect(parsed.region).toBe("CL");
      expect(parsed.formatPriority).toBe("flac");
      expect(parsed.downloadPath).toBe("");
    });
  });

  describe("PreferencesService Defaults & Persistence", () => {
    it("returns default preferences when store is empty", () => {
      const prefs = service.getPreferences();
      expect(prefs.locale).toBe("es-CL");
      expect(prefs.region).toBe("CL");
      expect(prefs.formatPriority).toBe("flac");
      expect(prefs.downloadPath).toBe("/mock/downloads/soulmate downloads");
    });

    it("persists updated preferences and merges partial updates", () => {
      const updated = service.updatePreferences({
        locale: "en",
        formatPriority: "320kbps",
      });

      expect(updated.locale).toBe("en");
      expect(updated.formatPriority).toBe("320kbps");
      expect(updated.region).toBe("CL"); // preserved

      expect(store.set).toHaveBeenCalledWith(
        "preferences",
        expect.objectContaining({
          locale: "en",
          formatPriority: "320kbps",
          region: "CL",
        }),
      );

      // Verify subsequent getPreferences returns saved values
      const current = service.getPreferences();
      expect(current.locale).toBe("en");
      expect(current.formatPriority).toBe("320kbps");
    });

    it("updates download directory correctly", () => {
      const updated = service.setDownloadPath("/custom/music/path");
      expect(updated.downloadPath).toBe("/custom/music/path");
      expect(service.getDownloadPath()).toBe("/custom/music/path");
    });

    it("updates format priority correctly", () => {
      const updated = service.setFormatPriority("320kbps");
      expect(updated.formatPriority).toBe("320kbps");
      expect(service.getFormatPriority()).toBe("320kbps");
    });

    it("updates maxConcurrentDownloads correctly", () => {
      expect(service.getMaxConcurrentDownloads()).toBe(2);
      const updated = service.setMaxConcurrentDownloads(3);
      expect(updated.maxConcurrentDownloads).toBe(3);
      expect(service.getMaxConcurrentDownloads()).toBe(3);

      const unlimited = service.setMaxConcurrentDownloads(0);
      expect(unlimited.maxConcurrentDownloads).toBe(0);
      expect(service.getMaxConcurrentDownloads()).toBe(0);
    });

    it("updates and retrieves autoQueryCascade preference", () => {
      expect(service.isAutoQueryCascadeEnabled()).toBe(true);
      const updated = service.setAutoQueryCascade(false);
      expect(updated.autoQueryCascade).toBe(false);
      expect(service.isAutoQueryCascadeEnabled()).toBe(false);
    });

    it("updates and retrieves downloadSpeedLimit preference (0 = unlimited, 500, 2000, 5000 KB/s)", () => {
      expect(service.getDownloadSpeedLimit()).toBe(0);
      const updated = service.setDownloadSpeedLimit(2000);
      expect(updated.downloadSpeedLimit).toBe(2000);
      expect(service.getDownloadSpeedLimit()).toBe(2000);

      const unlimited = service.setDownloadSpeedLimit(0);
      expect(unlimited.downloadSpeedLimit).toBe(0);
      expect(service.getDownloadSpeedLimit()).toBe(0);
    });

    it("rejects invalid partial preference payloads", () => {
      expect(() => {
        // @ts-expect-error test invalid locale
        service.updatePreferences({ locale: "it-IT" });
      }).toThrow();

      expect(() => {
        // @ts-expect-error test invalid formatPriority
        service.updatePreferences({ formatPriority: "invalid-quality" });
      }).toThrow();

      expect(() => {
        service.updatePreferences({ maxConcurrentDownloads: -1 });
      }).toThrow();
    });
  });
});
