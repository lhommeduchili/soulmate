import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";

import { tmpdir } from "os";
import {
  CrateExportService,
  escapeXml,
  pathToRekordboxUri,
  pathToTraktorLocation,
  stringToUtf16Be,
  parseSeratoCrate,
} from "./CrateExportService";
import { LibraryService } from "./LibraryService";
import { Track } from "../../shared/types";

describe("CrateExportService (Unit)", () => {
  let tempDir: string;
  let crateExportService: CrateExportService;
  let libraryService: LibraryService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "soulmate-crate-export-unit-"));
    libraryService = new LibraryService();
    crateExportService = new CrateExportService(libraryService);
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  const sampleTracks: Track[] = [
    {
      id: "track-1",
      name: "Around the World & Back",
      artists: [{ name: "Daft Punk" }],
      album: { name: "Homework <Deluxe>" },
      duration_ms: 429000,
      track_number: 7,
      year: 1997,
      formatInfo: {
        format: "FLAC",
        sampleRate: 44100,
        bitDepth: 16,
        bitrate: 1411,
        camelotKey: "8A",
        bpm: 126,
      },
    },
    {
      id: "track-2",
      name: 'One "More" Time',
      artists: [{ name: "Daft Punk" }, { name: "Romanthony" }],
      album: { name: "Discovery 'Live'" },
      duration_ms: 320000,
      track_number: 1,
      year: 2001,
      formatInfo: {
        format: "MP3",
        sampleRate: 48000,
        bitrate: 320,
        camelotKey: "12B",
        bpm: 128,
      },
    },
  ];

  describe("XML Helper & Rekordbox URI Formatting", () => {
    it("escapes special XML characters", () => {
      expect(escapeXml(`Daft & Punk <"Homework" '97>`)).toBe(
        "Daft &amp; Punk &lt;&quot;Homework&quot; &apos;97&gt;",
      );
    });

    it("formats filesystem paths into valid Rekordbox file://localhost/ URIs with percent-encoding", () => {
      const uri = pathToRekordboxUri(
        "/Music/Daft Punk/01 - Around The World.mp3",
      );
      expect(uri).toBe(
        "file://localhost/Music/Daft%20Punk/01%20-%20Around%20The%20World.mp3",
      );
      expect(uri.startsWith("file://localhost/")).toBe(true);
      expect(uri).not.toContain(" ");
    });

    it("handles Windows drive paths by formatting as file://localhost/C:/...", () => {
      const uri = pathToRekordboxUri("C:\\Music\\DJ Sets\\Track.flac");
      expect(uri.startsWith("file://localhost/C:/")).toBe(true);
      expect(uri).toContain("DJ%20Sets");
      expect(uri).not.toContain("\\");
    });
  });

  describe("Rekordbox XML Collection Generation", () => {
    it("generates valid Rekordbox XML conforming to Pioneer specification", () => {
      const xml = crateExportService.generateRekordboxXml({
        playlistName: "Festival Mainstage",
        tracks: sampleTracks,
        downloadDir: tempDir,
      });

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<DJ_PLAYLISTS Version="1.0.0">');
      expect(xml).toContain(
        '<PRODUCT Name="rekordbox" Version="6.0.0" Company="Pioneer DJ"/>',
      );
      expect(xml).toContain('<COLLECTION Entries="2">');
      expect(xml).toContain("<PLAYLISTS>");
      expect(xml).toContain('<NODE Type="0" Name="ROOT">');
      expect(xml).toContain(
        '<NODE Name="Festival Mainstage" Type="1" KeyType="0" Entries="2">',
      );
      expect(xml).toContain('<TRACK Key="1"/>');
      expect(xml).toContain('<TRACK Key="2"/>');

      // Check track attributes and XML escaping
      expect(xml).toContain('Name="Around the World &amp; Back"');
      expect(xml).toContain('Album="Homework &lt;Deluxe&gt;"');
      expect(xml).toContain('Tonality="8A"');
      expect(xml).toContain('AverageBpm="126.00"');
      expect(xml).toContain('TotalTime="429"');
      expect(xml).toContain('Kind="FLAC File"');

      // Second track
      expect(xml).toContain('Name="One &quot;More&quot; Time"');
      expect(xml).toContain('Album="Discovery &apos;Live&apos;"');
      expect(xml).toContain('Tonality="12B"');
      expect(xml).toContain('AverageBpm="128.00"');
      expect(xml).toContain('TotalTime="320"');
      expect(xml).toContain('Kind="MP3 File"');
    });

    it("handles tracks with missing metadata gracefully", () => {
      const minimalTracks: Track[] = [
        {
          id: "min-1",
          name: "Minimal Track",
          artists: [],
          album: { name: "" },
          duration_ms: 0,
        },
      ];

      const xml = crateExportService.generateRekordboxXml({
        playlistName: "Minimal",
        tracks: minimalTracks,
        downloadDir: tempDir,
      });

      expect(xml).toContain('<COLLECTION Entries="1">');
      expect(xml).toContain('Artist="Unknown Artist"');
      expect(xml).toContain('TotalTime="0"');
      expect(xml).toContain('Tonality=""');
    });
  });

  describe("Serato Subcrate Binary Serialization", () => {
    it("converts strings into UTF-16BE byte buffer", () => {
      const buf = stringToUtf16Be("Serato");
      expect(buf.length).toBe(12);
      // 'S' is 0x0053
      expect(buf.readUInt16BE(0)).toBe(0x0053);
      // 'e' is 0x0065
      expect(buf.readUInt16BE(2)).toBe(0x0065);
    });

    it("serializes valid Serato crate TLV binary structure with vrsn, otrk, and ptrk tags", () => {
      const buffer = crateExportService.serializeSeratoCrate({
        playlistName: "Club Weapons",
        tracks: sampleTracks,
        downloadDir: tempDir,
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(60);

      // Verify with parser helper
      const parsed = parseSeratoCrate(buffer);
      expect(parsed.version).toBe("1.0/Serato ScratchLive Crate");
      expect(parsed.trackPaths.length).toBe(2);
      // Tracks paths should be relative to drive root without leading slash
      expect(parsed.trackPaths[0]).not.toMatch(/^[/\\]/);
      expect(parsed.trackPaths[0]).toContain("Around the World");
      expect(parsed.trackPaths[1]).toContain("One More Time");
    });
  });

  describe("Export File Persistence & System Integration", () => {
    it("exports rekordbox.xml to download directory", () => {
      const result = crateExportService.exportRekordboxXml({
        playlistName: "Ibiza 2026",
        tracks: sampleTracks,
        downloadDir: tempDir,
        reveal: false,
      });

      expect(result.success).toBe(true);
      expect(result.trackCount).toBe(2);
      expect(existsSync(result.filePath)).toBe(true);
      expect(result.filePath.endsWith(".xml")).toBe(true);

      const content = readFileSync(result.filePath, "utf-8");
      expect(content).toContain("<DJ_PLAYLISTS Version=");
    });

    it("exports .crate file to download directory", () => {
      const result = crateExportService.exportSeratoCrate({
        playlistName: "Techno Subcrate",
        tracks: sampleTracks,
        downloadDir: tempDir,
        reveal: false,
      });

      expect(result.success).toBe(true);
      expect(result.trackCount).toBe(2);
      expect(existsSync(result.filePath)).toBe(true);
      expect(result.filePath.endsWith("Techno Subcrate.crate")).toBe(true);

      const buffer = readFileSync(result.filePath);
      const parsed = parseSeratoCrate(buffer);
      expect(parsed.version).toBe("1.0/Serato ScratchLive Crate");
    });

    it("exports collection.nml file to download directory", () => {
      const result = crateExportService.exportTraktorNml({
        playlistName: "Warehouse Rave",
        tracks: sampleTracks,
        downloadDir: tempDir,
        reveal: false,
      });

      expect(result.success).toBe(true);
      expect(result.trackCount).toBe(2);
      expect(existsSync(result.filePath)).toBe(true);
      expect(result.filePath.endsWith("collection.nml")).toBe(true);

      const content = readFileSync(result.filePath, "utf-8");
      expect(content).toContain('<NML VERSION="19">');
      expect(content).toContain('NAME="Warehouse Rave"');
    });
  });

  describe("Traktor Pro NML Exporter", () => {
    it("formats POSIX file paths into Traktor DIR and VOLUME notation", () => {
      const loc = pathToTraktorLocation(
        "/Users/djalice/Music/Soulmate/Track.flac",
      );
      expect(loc.volume).toBe("/");
      expect(loc.dir).toBe("/:Users/:djalice/:Music/:Soulmate/:");
      expect(loc.file).toBe("Track.flac");
      expect(loc.primaryKey).toBe(
        "/:Users/:djalice/:Music/:Soulmate/:Track.flac",
      );
    });

    it("formats Windows file paths into Traktor C: drive and DIR notation", () => {
      const loc = pathToTraktorLocation(
        "C:\\Users\\djalice\\Music\\Track.flac",
      );
      expect(loc.volume).toBe("C:");
      expect(loc.dir).toBe("/:Users/:djalice/:Music/:");
      expect(loc.file).toBe("Track.flac");
      expect(loc.primaryKey).toBe("C:/:Users/:djalice/:Music/:Track.flac");
    });

    it("generates compliant Traktor Collection NML version 19 with collection and playlist nodes", () => {
      const nml = crateExportService.generateTraktorNml({
        playlistName: "Peak Time Techno",
        tracks: sampleTracks,
        downloadDir: tempDir,
      });

      expect(nml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(nml).toContain('<NML VERSION="19">');
      expect(nml).toContain(
        '<HEAD COMPANY="Native Instruments" PROGRAM="Traktor"/>',
      );
      expect(nml).toContain('<COLLECTION ENTRIES="2">');

      // Track 1 checks
      expect(nml).toContain('ARTIST="Daft Punk"');
      expect(nml).toContain('TITLE="Around the World &amp; Back"');
      expect(nml).toContain(
        '<ALBUM TITLE="Homework &lt;Deluxe&gt;" TRACK="7"/>',
      );
      expect(nml).toContain('BITRATE="1411"');
      expect(nml).toContain('PLAYTIME="429"');
      expect(nml).toContain(
        '<TEMPO BPM="126.000000" BPM_QUALITY="100.000000"/>',
      );
      expect(nml).toContain('KEY="8A"');

      // Track 2 checks
      expect(nml).toContain('ARTIST="Daft Punk, Romanthony"');
      expect(nml).toContain('TITLE="One &quot;More&quot; Time"');
      expect(nml).toContain('BITRATE="320"');
      expect(nml).toContain('KEY="12B"');

      // Playlist hierarchy checks
      expect(nml).toContain("<PLAYLISTS>");
      expect(nml).toContain('<NODE TYPE="FOLDER" NAME="$ROOT">');
      expect(nml).toContain('<NODE TYPE="PLAYLIST" NAME="Peak Time Techno">');
      expect(nml).toContain('<PLAYLIST ENTRIES="2" TYPE="LIST"');
      expect(nml).toContain('<PRIMARYKEY TYPE="TRACK"');
    });
  });
});
