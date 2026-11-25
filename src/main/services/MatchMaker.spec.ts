import { describe, it, expect } from "vitest";
import { MatchMaker } from "./MatchMaker";
import { Track, SlskdFile } from "../../shared/types";

describe("MatchMaker (Unit)", () => {
  const matchMaker = new MatchMaker(["flac", "wav", "aiff", "mp3"]);

  describe("buildQueryCascade", () => {
    it("generates 3-tier cascade for tracks with noisy parentheticals and featured artists", () => {
      const track: Track = {
        id: "track-1",
        name: "expectations (feat. Chappell Roan)",
        artists: [{ name: "Olivia Rodrigo" }, { name: "Chappell Roan" }],
        album: { name: "GUTS" },
        duration_ms: 240000,
      };

      const cascade = matchMaker.buildQueryCascade(track);
      expect(cascade.length).toBeGreaterThanOrEqual(2);

      // Tier 1 (Exact): contains full title with feat
      expect(cascade[0]).toContain("expectations");
      expect(cascade[0]).toContain("feat");

      // Tier 2 (Cleaned): strips parenthetical/bracketed noisy suffixes
      expect(cascade[1]).toBe("Olivia Rodrigo expectations");

      // Tier 3: primary artist and core title
      if (cascade[2]) {
        expect(cascade[2]).toBe("Olivia Rodrigo expectations");
      }
    });

    it("strips club mix, remastered, and brackets in Tier 2 and Tier 3", () => {
      const track: Track = {
        id: "track-2",
        name: "Glue (Original Club Mix) [Remastered 2024]",
        artists: [{ name: "Bicep" }],
        album: { name: "Bicep" },
        duration_ms: 269000,
      };

      const cascade = matchMaker.buildQueryCascade(track);
      expect(cascade[0]).toContain("(Original Club Mix)");
      expect(cascade[1]).toBe("Bicep Glue");
    });

    it("deduplicates identical queries when title has no noisy suffixes", () => {
      const track: Track = {
        id: "track-3",
        name: "Glue",
        artists: [{ name: "Bicep" }],
        album: { name: "Bicep" },
        duration_ms: 269000,
      };

      const cascade = matchMaker.buildQueryCascade(track);
      expect(cascade).toEqual(["Bicep Glue"]);
    });
  });

  describe("findNextBestMatch", () => {
    const track: Track = {
      id: "track-4",
      name: "Glue",
      artists: [{ name: "Bicep" }],
      album: { name: "Bicep" },
      duration_ms: 269000,
    };

    const files: SlskdFile[] = [
      {
        filename: "Bicep - Glue.flac",
        bitRate: 1000,
        size: 35000000,
        username: "stalled_peer",
        speed: 500000,
        slotsFree: true,
        queueLength: 0,
      },
      {
        filename: "Bicep - Glue.flac",
        bitRate: 1000,
        size: 35000000,
        username: "backup_peer_1",
        speed: 600000,
        slotsFree: true,
        queueLength: 0,
      },
      {
        filename: "Bicep - Glue (Original Mix).mp3",
        bitRate: 320,
        size: 11000000,
        username: "backup_peer_2",
        speed: 400000,
        slotsFree: true,
        queueLength: 0,
      },
      {
        filename: "Unrelated - Song.flac",
        bitRate: 1000,
        size: 30000000,
        username: "other_peer",
        speed: 100000,
        slotsFree: true,
        queueLength: 0,
      },
    ];

    it("excludes specified peer usernames and chooses the next best match", () => {
      const result = matchMaker.findNextBestMatch(track, files, [
        "stalled_peer",
      ]);
      expect(result).not.toBeNull();
      expect(result?.username).toBe("backup_peer_1");
      expect(result?.filename).toBe("Bicep - Glue.flac");
    });

    it("returns subsequent match when multiple peers are excluded", () => {
      const result = matchMaker.findNextBestMatch(track, files, [
        "stalled_peer",
        "backup_peer_1",
      ]);
      expect(result).not.toBeNull();
      expect(result?.username).toBe("backup_peer_2");
    });

    it("returns null when all relevant matching peers are excluded", () => {
      const result = matchMaker.findNextBestMatch(track, files, [
        "stalled_peer",
        "backup_peer_1",
        "backup_peer_2",
      ]);
      expect(result).toBeNull();
    });
  });
});
