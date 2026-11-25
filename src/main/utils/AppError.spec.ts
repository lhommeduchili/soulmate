import { describe, it, expect } from "vitest";
import {
  AppError,
  isAppError,
  isSerializedAppError,
  APP_ERROR_CODES,
  AppErrorCode,
} from "./AppError";
import { z } from "zod";

describe("AppError Domain & Serialization", () => {
  it("creates an AppError with code, message, fallback, and details", () => {
    const err = new AppError(
      "SEARCH_TIMEOUT",
      "Soulseek search timed out after 30s",
      "The network search took too long",
      { query: "Aphex Twin", timeoutMs: 30000 },
    );

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe("AppError");
    expect(err.code).toBe("SEARCH_TIMEOUT");
    expect(err.message).toBe("Soulseek search timed out after 30s");
    expect(err.fallbackMessage).toBe("The network search took too long");
    expect(err.details).toEqual({ query: "Aphex Twin", timeoutMs: 30000 });
  });

  it("includes all required standardized error codes", () => {
    const expectedCodes: AppErrorCode[] = [
      "SLSKD_DAEMON_OFFLINE",
      "SLSKD_NOT_CONFIGURED",
      "SEARCH_TIMEOUT",
      "DOWNLOAD_ABORTED",
      "INGESTION_RATE_LIMIT",
      "STORAGE_IO_ERROR",
      "INVALID_PAYLOAD",
      "SPOTIFY_AUTH_FAILED",
      "PLAYLIST_NOT_FOUND",
      "NETWORK_ERROR",
      "UNKNOWN_ERROR",
    ];

    expectedCodes.forEach((code) => {
      expect(APP_ERROR_CODES).toContain(code);
    });
  });

  it("serializes AppError safely stripping sensitive file paths", () => {
    const internalPath = "/Users/developer/dev/soulmate/resources/slskd";
    const winPath = "C:\\Users\\admin\\AppData\\Roaming\\soulmate\\data.db";
    const err = new AppError(
      "STORAGE_IO_ERROR",
      `Failed to write database file at ${internalPath} and backup at ${winPath}`,
      "Storage error",
      { targetPath: internalPath, winPath },
    );

    const serialized = AppError.serialize(err);

    expect(serialized.name).toBe("AppError");
    expect(serialized.code).toBe("STORAGE_IO_ERROR");
    expect(serialized.message).not.toContain("/Users/developer");
    expect(serialized.message).not.toContain("C:\\Users\\admin");
    expect(serialized.message).toContain("[path]");
    expect(serialized.details?.targetPath).toBe("[path]");
    expect(serialized.details?.winPath).toBe("[path]");
  });

  it("serializes AppError safely stripping credentials, tokens, and api keys", () => {
    const err = new AppError(
      "SPOTIFY_AUTH_FAILED",
      "Auth failed for Bearer BQA1234567890abcdef and token=secretToken12345",
      "Spotify authentication error",
      {
        apiKey: "SUPER_SECRET_KEY",
        password: "pAssword123!",
        accessToken: "BQA_SECRET_TOKEN",
        safeParam: "playlist-123",
      },
    );

    const serialized = AppError.serialize(err);

    expect(serialized.code).toBe("SPOTIFY_AUTH_FAILED");
    expect(serialized.message).not.toContain("BQA1234567890abcdef");
    expect(serialized.message).not.toContain("secretToken12345");
    expect(serialized.message).toContain("[redacted]");

    // Sensitive detail keys should be redacted
    expect(serialized.details?.apiKey).toBe("[redacted]");
    expect(serialized.details?.password).toBe("[redacted]");
    expect(serialized.details?.accessToken).toBe("[redacted]");
    expect(serialized.details?.safeParam).toBe("playlist-123");
  });

  it("serializes ZodError into an INVALID_PAYLOAD AppError", () => {
    const schema = z.object({
      id: z.string(),
      count: z.number(),
    });

    try {
      schema.parse({ id: 123, count: "invalid" });
      expect.fail("Should have thrown ZodError");
    } catch (zodErr) {
      const serialized = AppError.serialize(zodErr);
      expect(serialized.code).toBe("INVALID_PAYLOAD");
      expect(serialized.name).toBe("AppError");
      expect(serialized.message).toContain("Invalid payload");
    }
  });

  it("serializes generic standard Error into UNKNOWN_ERROR with sanitized message", () => {
    const rawErr = new Error(
      "Failed connecting to /var/run/slskd.sock with secret_token=abc1234",
    );
    const serialized = AppError.serialize(rawErr);

    expect(serialized.code).toBe("UNKNOWN_ERROR");
    expect(serialized.name).toBe("AppError");
    expect(serialized.message).not.toContain("/var/run");
    expect(serialized.message).not.toContain("abc1234");
  });

  it("serializes unknown primitive errors gracefully", () => {
    const strErr = "Something broke in /home/user/app";
    const serialized = AppError.serialize(strErr);
    expect(serialized.code).toBe("UNKNOWN_ERROR");
    expect(serialized.message).not.toContain("/home/user");
  });

  it("deserializes a SerializedAppError back into an AppError instance", () => {
    const serialized = {
      name: "AppError" as const,
      code: "SLSKD_DAEMON_OFFLINE" as const,
      message: "Soulseek daemon is not reachable",
      fallbackMessage: "Daemon offline",
      details: { port: 5030 },
    };

    const deserialized = AppError.deserialize(serialized);

    expect(deserialized).toBeInstanceOf(AppError);
    expect(deserialized).toBeInstanceOf(Error);
    expect(deserialized.code).toBe("SLSKD_DAEMON_OFFLINE");
    expect(deserialized.message).toBe("Soulseek daemon is not reachable");
    expect(deserialized.fallbackMessage).toBe("Daemon offline");
    expect(deserialized.details).toEqual({ port: 5030 });
  });

  it("identifies AppError and SerializedAppError via type guards", () => {
    const appErr = new AppError("NETWORK_ERROR", "Network down");
    const serialized = appErr.toJSON();
    const standardErr = new Error("Standard error");

    expect(isAppError(appErr)).toBe(true);
    expect(isAppError(standardErr)).toBe(false);

    expect(isSerializedAppError(serialized)).toBe(true);
    expect(isSerializedAppError(standardErr)).toBe(false);
    expect(isSerializedAppError(null)).toBe(false);
    expect(isSerializedAppError({ code: "UNKNOWN" })).toBe(false);
  });
});
