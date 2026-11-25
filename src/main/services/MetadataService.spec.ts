import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "fs";
import { tmpdir } from "os";
import NodeID3 from "node-id3";
import {
  MetadataService,
  sanitizeFilename,
  buildTargetFilePath,
  tagFlacBuffer,
  readFlacTags,
  calculateReplayGain,
  AudioMetadata,
  ReplayGainValues,
} from "./MetadataService";
import { Track } from "../../shared/types";

describe("MetadataService - Audiophile Metadata & DJ File Organization", () => {
  let tempDir: string;
  let service: MetadataService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "soulmate-meta-test-"));
    service = new MetadataService();
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignored
      }
    }
    vi.restoreAllMocks();
  });

  describe("Filename Sanitization", () => {
    it("sanitizes forbidden filesystem characters while preserving readability", () => {
      const dangerous = `AC/DC: Who Made Who? *Special Edition* <Vol. 1> | "Rare" & 'Live'\\Track`;
      const clean = sanitizeFilename(dangerous);

      expect(clean).not.toMatch(/[/\\:*?"<>|]/);
      expect(clean).toContain("AC-DC");
      expect(clean).toContain("Who Made Who");
      expect(clean).toContain("Special Edition");
    });

    it("preserves international Unicode characters (accents, Japanese, Cyrillic, Spanish)", () => {
      const unicodeNames = [
        "Björk - Jóga (1997)",
        "Los Prisioneros - ¿Por Qué No Se Van?",
        "坂本龍一 - Merry Christmas Mr. Lawrence",
        "Чайковский - 1812 Overture",
        "Café Tacvba - Eres",
      ];

      for (const name of unicodeNames) {
        const clean = sanitizeFilename(name);
        expect(clean).not.toMatch(/[/\\:*?"<>|]/);
        // Ensure non-ASCII letters are preserved
        if (name.includes("ö")) expect(clean).toContain("ö");
        if (name.includes("¿")) expect(clean).not.toContain("?"); // '?' stripped, '¿' preserved or handled
        if (name.includes("坂本龍一")) expect(clean).toContain("坂本龍一");
        if (name.includes("Чайковский")) expect(clean).toContain("Чайковский");
        if (name.includes("Café")) expect(clean).toContain("Café");
      }
    });

    it("eliminates trailing dots and spaces that break Windows filesystems", () => {
      const input = "Track Name...   ";
      const clean = sanitizeFilename(input);
      expect(clean).toBe("Track Name");
      expect(clean.endsWith(".")).toBe(false);
      expect(clean.endsWith(" ")).toBe(false);
    });

    it("neutralizes reserved Windows filenames", () => {
      expect(sanitizeFilename("CON")).toBe("_CON_");
      expect(sanitizeFilename("AUX")).toBe("_AUX_");
      expect(sanitizeFilename("nul.mp3")).toBe("_NUL_.mp3");
      expect(sanitizeFilename("com1")).toBe("_COM1_");
    });

    it("provides fallback for empty or all-forbidden inputs", () => {
      expect(sanitizeFilename("???///:::")).toBe("Unknown");
      expect(sanitizeFilename("   ")).toBe("Unknown");
      expect(sanitizeFilename("")).toBe("Unknown");
    });
  });

  describe("DJ Directory & Target Path Generation", () => {
    it("builds standard DJ path with Album and zero-padded Track Number", () => {
      const track: Track = {
        id: "t1",
        name: "Strobe (Club Edit)",
        artists: [{ name: "deadmau5" }, { name: "Kaskade" }],
        album: { name: "For Lack of a Better Name" },
        duration_ms: 630000,
        track_number: 2,
        year: 2009,
      };

      const target = buildTargetFilePath({
        downloadDir: tempDir,
        track,
        extension: "flac",
      });

      expect(target).toBe(
        join(
          tempDir,
          "deadmau5, Kaskade",
          "For Lack of a Better Name",
          "02 - Strobe (Club Edit).flac",
        ),
      );
    });

    it("builds DJ path without track number if not provided", () => {
      const track: Track = {
        id: "t2",
        name: "One More Time",
        artists: [{ name: "Daft Punk" }],
        album: { name: "Discovery" },
        duration_ms: 320000,
      };

      const target = buildTargetFilePath({
        downloadDir: tempDir,
        track,
        extension: "mp3",
      });

      expect(target).toBe(
        join(tempDir, "Daft Punk", "Discovery", "One More Time.mp3"),
      );
    });

    it("builds Artist - Title path when Album is Unknown or missing", () => {
      const track: Track = {
        id: "t3",
        name: "Unknown Dubplate",
        artists: [{ name: "Aphex Twin" }],
        album: { name: "Unknown" },
        duration_ms: 240000,
      };

      const target = buildTargetFilePath({
        downloadDir: tempDir,
        track,
        extension: "wav",
      });

      expect(target).toBe(
        join(tempDir, "Aphex Twin", "Aphex Twin - Unknown Dubplate.wav"),
      );
    });
  });

  describe("FLAC Vorbis Comment & METADATA_BLOCK_PICTURE Tagging", () => {
    function createMockFlacBuffer(): Buffer {
      const magic = Buffer.from("fLaC", "ascii");
      const streamInfo = Buffer.alloc(34, 0); // 34 bytes dummy STREAMINFO
      const header = Buffer.from([0x80, 0x00, 0x00, 34]); // is_last=1, type=0, len=34
      const audio = Buffer.from([0x11, 0x22, 0x33, 0x44, 0x55, 0x66]); // Mock PCM frames
      return Buffer.concat([magic, header, streamInfo, audio]);
    }

    it("injects Vorbis comments (TITLE, ARTIST, ALBUM, TRACKNUMBER, DATE) and METADATA_BLOCK_PICTURE", () => {
      const rawFlac = createMockFlacBuffer();
      const mockCover = Buffer.from("mock-jpeg-image-bytes");

      const metadata: AudioMetadata = {
        title: "Around The World",
        artist: "Daft Punk",
        album: "Homework",
        trackNumber: "7",
        year: "1997",
        coverImageBuffer: mockCover,
        coverMimeType: "image/jpeg",
      };

      const taggedFlac = tagFlacBuffer(rawFlac, metadata);
      expect(taggedFlac.length).toBeGreaterThan(rawFlac.length);

      const parsed = readFlacTags(taggedFlac);
      expect(parsed.comments["TITLE"]).toBe("Around The World");
      expect(parsed.comments["ARTIST"]).toBe("Daft Punk");
      expect(parsed.comments["ALBUM"]).toBe("Homework");
      expect(parsed.comments["TRACKNUMBER"]).toBe("7");
      expect(parsed.comments["DATE"]).toBe("1997");
      expect(parsed.hasPicture).toBe(true);
      expect(parsed.pictureMime).toBe("image/jpeg");
    });

    it("preserves audio stream frames bit-for-bit after metadata block injection", () => {
      const rawFlac = createMockFlacBuffer();
      const originalAudio = rawFlac.subarray(4 + 4 + 34); // after STREAMINFO

      const taggedFlac = tagFlacBuffer(rawFlac, {
        title: "Test Track",
        artist: "Test Artist",
        album: "Test Album",
      });

      // The end of taggedFlac must match originalAudio exactly
      const taggedAudio = taggedFlac.subarray(
        taggedFlac.length - originalAudio.length,
      );
      expect(Buffer.compare(originalAudio, taggedAudio)).toBe(0);
    });

    it("throws a descriptive error when trying to tag a non-FLAC file buffer", () => {
      const invalidBuffer = Buffer.from("NOT_A_FLAC_FILE_DATA");
      expect(() =>
        tagFlacBuffer(invalidBuffer, {
          title: "Fail",
          artist: "Fail",
          album: "Fail",
        }),
      ).toThrow(/invalid flac/i);
    });
  });

  describe("MP3 ID3v2 Tagging", () => {
    it("tags MP3 file using ID3v2 tags and reads them back accurately", async () => {
      const mp3Path = join(tempDir, "test.mp3");
      // Dummy MP3 frame data
      const mockMp3 = Buffer.alloc(1024, 0xff);
      writeFileSync(mp3Path, mockMp3);

      const success = await service.tagFile(mp3Path, {
        title: "Titanium (feat. Sia)",
        artist: "David Guetta, Sia",
        album: "Nothing but the Beat",
        trackNumber: "4",
        year: "2011",
        coverImageBuffer: Buffer.from("mock-album-art"),
        coverMimeType: "image/jpeg",
      });

      expect(success).toBe(true);

      const tags = NodeID3.read(mp3Path);
      expect(tags.title).toBe("Titanium (feat. Sia)");
      expect(tags.artist).toBe("David Guetta, Sia");
      expect(tags.album).toBe("Nothing but the Beat");
      expect(tags.trackNumber).toBe("4");
      expect(tags.year).toBe("2011");
      expect(tags.image).toBeDefined();
    });

    it("tags MP3 with ReplayGain 2.0 / EBU R128 TXXX frames when enabled", async () => {
      const mp3Path = join(tempDir, "replaygain.mp3");
      const mockMp3 = Buffer.alloc(1024, 0xaa);
      writeFileSync(mp3Path, mockMp3);

      const replayGain: ReplayGainValues = {
        trackGain: "-6.20 dB",
        trackPeak: "0.985412",
        albumGain: "-6.20 dB",
      };

      const success = await service.tagFile(
        mp3Path,
        {
          title: "Levels",
          artist: "Avicii",
          album: "Levels EP",
          replayGain,
        },
        { enableReplayGain: true },
      );

      expect(success).toBe(true);

      const tags = NodeID3.read(mp3Path);
      const userDefined = tags.userDefinedText || [];
      const gainTag = userDefined.find(
        (u) => u.description === "REPLAYGAIN_TRACK_GAIN",
      );
      const peakTag = userDefined.find(
        (u) => u.description === "REPLAYGAIN_TRACK_PEAK",
      );

      expect(gainTag?.value).toBe("-6.20 dB");
      expect(peakTag?.value).toBe("0.985412");
    });
  });

  describe("ReplayGain 2.0 / EBU R128 Loudness Normalization", () => {
    it("computes pure loudness peak and non-destructive track volume adjustment", () => {
      // Create mock audio frame buffer with alternating samples
      const buf = Buffer.alloc(2048);
      for (let i = 0; i < buf.length; i += 2) {
        buf.writeInt16LE(Math.round(Math.sin(i / 10) * 20000), i);
      }

      const rg = calculateReplayGain(buf, "FLAC");
      expect(rg.trackGain).toMatch(/^[+-]\d+\.\d{2} dB$/);
      expect(rg.trackPeak).toMatch(/^\d\.\d{6}$/);
      expect(rg.albumGain).toBe(rg.trackGain);
      expect(parseFloat(rg.trackPeak)).toBeGreaterThan(0);
      expect(parseFloat(rg.trackPeak)).toBeLessThanOrEqual(1.0);
    });

    it("injects REPLAYGAIN Vorbis comments into FLAC buffer", () => {
      const magic = Buffer.from("fLaC", "ascii");
      const streamInfo = Buffer.alloc(34, 0);
      const header = Buffer.from([0x80, 0x00, 0x00, 34]);
      const audio = Buffer.from([0x11, 0x22, 0x33, 0x44]);
      const rawFlac = Buffer.concat([magic, header, streamInfo, audio]);

      const metadata: AudioMetadata = {
        title: "Test Track",
        artist: "Test Artist",
        album: "Test Album",
        replayGain: {
          trackGain: "-5.40 dB",
          trackPeak: "0.975000",
          albumGain: "-5.40 dB",
        },
      };

      const taggedFlac = tagFlacBuffer(rawFlac, metadata);
      const tags = readFlacTags(taggedFlac);

      expect(tags.comments["REPLAYGAIN_TRACK_GAIN"]).toBe("-5.40 dB");
      expect(tags.comments["REPLAYGAIN_TRACK_PEAK"]).toBe("0.975000");
      expect(tags.comments["REPLAYGAIN_ALBUM_GAIN"]).toBe("-5.40 dB");
    });
  });

  describe("Album Art Fetching & Graceful Degradation", () => {
    it("fetches album art over HTTP with timeout protection", async () => {
      const fakeImageBytes = Buffer.from("fake-remote-image");
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => Uint8Array.from(fakeImageBytes).buffer,
      } as unknown as Response);

      const result = await service.fetchAlbumArt(
        "https://i.scdn.co/image/ab67616d0000b273",
      );
      expect(result).not.toBeNull();
      expect(result?.mimeType).toBe("image/jpeg");
      expect(Buffer.compare(result!.buffer, fakeImageBytes)).toBe(0);
    });

    it("gracefully degrades when album art URL fails, times out, or returns 404", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

      const result = await service.fetchAlbumArt(
        "https://invalid-url.com/art.jpg",
      );
      expect(result).toBeNull();
    });
  });

  describe("Organize and Tag Atomic Pipeline", () => {
    it("atomically moves source file to target DJ path and enriches metadata", async () => {
      // Create source FLAC file
      const sourceDir = join(tempDir, "slskd_staging");
      mkdirSync(sourceDir, { recursive: true });
      const dlDir = join(tempDir, "DJ_Music");
      writeFileSync(
        join(sourceDir, "raw_download.flac"),
        Buffer.concat([
          Buffer.from("fLaC", "ascii"),
          Buffer.from([0x80, 0x00, 0x00, 34]),
          Buffer.alloc(34, 0),
          Buffer.from([0x01, 0x02, 0x03]),
        ]),
      );

      const track: Track = {
        id: "t100",
        name: "Levels (Original Mix)",
        artists: [{ name: "Avicii" }],
        album: { name: "Levels EP" },
        duration_ms: 320000,
        track_number: 1,
        year: 2011,
      };

      const result = await service.organizeAndTag(
        join(sourceDir, "raw_download.flac"),
        track,
        dlDir,
      );

      expect(result.tagged).toBe(true);
      expect(existsSync(result.targetPath)).toBe(true);
      expect(result.targetPath).toContain(
        join("Avicii", "Levels EP", "01 - Levels (Original Mix).flac"),
      );

      // Source file should be moved/cleaned up
      expect(existsSync(join(sourceDir, "raw_download.flac"))).toBe(false);

      // Verify tags inside target file
      const content = readFileSync(result.targetPath);
      const tags = readFlacTags(content);
      expect(tags.comments["TITLE"]).toBe("Levels (Original Mix)");
      expect(tags.comments["ARTIST"]).toBe("Avicii");
    });

    it("gracefully leaves original file intact if tagging encounters error", async () => {
      const sourcePath = join(tempDir, "corrupted.flac");
      const uncorruptedBytes = Buffer.from("NOT_ACTUALLY_FLAC");
      writeFileSync(sourcePath, uncorruptedBytes);

      const track: Track = {
        id: "t101",
        name: "Corrupt Track",
        artists: [{ name: "Unknown" }],
        album: { name: "Unknown" },
        duration_ms: 10000,
      };

      const result = await service.organizeAndTag(sourcePath, track, tempDir);

      expect(existsSync(result.targetPath)).toBe(true);
      // Data must not be lost or truncated
      const finalBytes = readFileSync(result.targetPath);
      expect(Buffer.compare(finalBytes, uncorruptedBytes)).toBe(0);
    });

    it("throws AppError if source file does not exist", async () => {
      const track: Track = {
        id: "t102",
        name: "Ghost",
        artists: [{ name: "Nobody" }],
        album: { name: "None" },
        duration_ms: 1000,
      };

      await expect(
        service.organizeAndTag(
          join(tempDir, "non_existent.mp3"),
          track,
          tempDir,
        ),
      ).rejects.toThrow();
    });
  });
});
