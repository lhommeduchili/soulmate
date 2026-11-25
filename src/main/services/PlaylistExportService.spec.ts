import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "fs";
import { tmpdir } from "os";
import { PlaylistExportService } from "./PlaylistExportService";
import { LibraryService } from "./LibraryService";
import { Track } from "../../shared/types";

describe("PlaylistExportService & LibraryService (Unit)", () => {
  let tempDir: string;
  let playlistExportService: PlaylistExportService;
  let libraryService: LibraryService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "soulmate-export-unit-"));
    libraryService = new LibraryService();
    playlistExportService = new PlaylistExportService(libraryService);
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const sampleTracks: Track[] = [
    {
      id: "track-1",
      name: "Around the World",
      artists: [{ name: "Daft Punk" }],
      album: { name: "Homework" },
      duration_ms: 429000,
      track_number: 7,
      year: 1997,
    },
    {
      id: "track-2",
      name: "One More Time",
      artists: [{ name: "Daft Punk" }, { name: "Romanthony" }],
      album: { name: "Discovery" },
      duration_ms: 320000,
      track_number: 1,
      year: 2001,
    },
  ];

  describe("M3U8 Manifest Generation & Relative Paths", () => {
    it("generates extended #EXTM3U formatting with valid duration, artist - title, and relative audio paths", () => {
      const playlistDir = join(tempDir, "Playlists");
      const content = playlistExportService.generateM3u8Content({
        tracks: sampleTracks,
        downloadDir: tempDir,
        playlistDir,
      });

      expect(content).toContain("#EXTM3U\n");
      // Around the World: 429s -> #EXTINF:429,Daft Punk - Around the World
      expect(content).toContain("#EXTINF:429,Daft Punk - Around the World");
      // One More Time: 320s -> #EXTINF:320,Daft Punk, Romanthony - One More Time
      expect(content).toContain(
        "#EXTINF:320,Daft Punk, Romanthony - One More Time",
      );
      // Relative path: from <downloadDir>/Playlists to <downloadDir>/Daft Punk/Homework/...
      expect(content).toContain(
        "../Daft Punk/Homework/07 - Around the World.flac",
      );
      expect(content).toContain(
        "../Daft Punk, Romanthony/Discovery/01 - One More Time.flac",
      );
    });

    it("uses forward slashes '/' in relative paths even on Windows for cross-platform DJ software compatibility", () => {
      const playlistDir = join(tempDir, "Playlists");
      const content = playlistExportService.generateM3u8Content({
        tracks: [sampleTracks[0]],
        downloadDir: tempDir,
        playlistDir,
      });

      // Must never contain unescaped Windows backslashes in track paths
      const lines = content.split("\n").filter((l) => l && !l.startsWith("#"));
      expect(lines.length).toBe(1);
      expect(lines[0]).not.toContain("\\");
      expect(lines[0]).toBe("../Daft Punk/Homework/07 - Around the World.flac");
    });

    it("handles tracks with unknown duration or missing album gracefully", () => {
      const singleTrack: Track = {
        id: "single-1",
        name: "Unknown Track Spec",
        artists: [{ name: "Unknown DJ" }],
        album: { name: "Unknown" },
        duration_ms: 0,
      };

      const playlistDir = join(tempDir, "Playlists");
      const content = playlistExportService.generateM3u8Content({
        tracks: [singleTrack],
        downloadDir: tempDir,
        playlistDir,
      });

      expect(content).toContain("#EXTINF:-1,Unknown DJ - Unknown Track Spec");
      expect(content).toContain(
        "../Unknown DJ/Unknown DJ - Unknown Track Spec.flac",
      );
    });
  });

  describe("Playlist Export to File & Directory Creation", () => {
    it("sanitizes playlist filename and automatically creates <DownloadDir>/Playlists directory", () => {
      const dirtyPlaylistName =
        'DJ Set: Live / Summer * 2026? "Peak-Time" | Main';
      const result = playlistExportService.exportPlaylist({
        playlistName: dirtyPlaylistName,
        tracks: sampleTracks,
        downloadDir: tempDir,
        reveal: false,
      });

      expect(result.success).toBe(true);
      expect(result.trackCount).toBe(2);
      expect(existsSync(result.filePath)).toBe(true);

      // Verify directory was created
      const playlistDir = join(tempDir, "Playlists");
      expect(existsSync(playlistDir)).toBe(true);

      // File name should be sanitized (no colons, slashes, quotes, pipes, asterisks)
      expect(result.filePath).not.toContain(":");
      expect(result.filePath).not.toContain("*");
      expect(result.filePath).not.toContain("?");
      expect(result.filePath).not.toContain('"');
      expect(result.filePath).not.toContain("|");

      const fileContent = readFileSync(result.filePath, "utf-8");
      expect(fileContent).toContain("#EXTM3U");
      expect(fileContent).toContain("Around the World");
    });
  });

  describe("Library Duplicate Detection", () => {
    it("detects existing files in library for both .flac and .mp3 formats", () => {
      // Create Daft Punk Homework directory and a FLAC file
      const daftDir = join(tempDir, "Daft Punk", "Homework");
      mkdirSync(daftDir, { recursive: true });
      const flacPath = join(daftDir, "07 - Around the World.flac");
      writeFileSync(flacPath, Buffer.from("fLaC_dummy_data"));

      const checkFlac = libraryService.isTrackInLibrary(
        sampleTracks[0],
        tempDir,
      );
      expect(checkFlac.inLibrary).toBe(true);
      expect(checkFlac.filePath).toBe(flacPath);

      // Second track not downloaded yet
      const checkDiscovery = libraryService.isTrackInLibrary(
        sampleTracks[1],
        tempDir,
      );
      expect(checkDiscovery.inLibrary).toBe(false);

      // Now create an MP3 version for One More Time
      const discDir = join(tempDir, "Daft Punk, Romanthony", "Discovery");
      mkdirSync(discDir, { recursive: true });
      const mp3Path = join(discDir, "01 - One More Time.mp3");
      writeFileSync(mp3Path, Buffer.from("ID3_dummy_mp3_data"));

      const checkMp3 = libraryService.isTrackInLibrary(
        sampleTracks[1],
        tempDir,
      );
      expect(checkMp3.inLibrary).toBe(true);
      expect(checkMp3.filePath).toBe(mp3Path);
    });

    it("batch checks tracks and returns map of existing library files", () => {
      const daftDir = join(tempDir, "Daft Punk", "Homework");
      mkdirSync(daftDir, { recursive: true });
      const flacPath = join(daftDir, "07 - Around the World.flac");
      writeFileSync(flacPath, Buffer.from("fLaC_data"));

      const results = libraryService.checkTracks(sampleTracks, tempDir);
      expect(results["track-1"]).toEqual({
        inLibrary: true,
        filePath: flacPath,
      });
      expect(results["track-2"]).toEqual({
        inLibrary: false,
      });
    });
  });
});
