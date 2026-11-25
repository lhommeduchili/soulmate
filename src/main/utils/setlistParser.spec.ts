import { describe, it, expect } from "vitest";
import {
  parseSetlist,
  parseSetlistLine,
  parseCsvSetlist,
} from "./setlistParser";
import { TracksArraySchema } from "../../shared/schemas";

describe("setlistParser (Unit)", () => {
  describe("parseSetlistLine", () => {
    it("parses standard 'Artist - Title' format", () => {
      const result = parseSetlistLine("Bicep - Glue");
      expect(result).not.toBeNull();
      expect(result?.artist).toBe("Bicep");
      expect(result?.title).toBe("Glue");
    });

    it("parses numbered tracklist items: '01. Artist - Title' and '1 - Artist - Title'", () => {
      const res1 = parseSetlistLine("01. Overmono - So U Kno");
      expect(res1?.artist).toBe("Overmono");
      expect(res1?.title).toBe("So U Kno");

      const res2 = parseSetlistLine(
        "2 - Mall Grab - Liverpool Street In The Rain",
      );
      expect(res2?.artist).toBe("Mall Grab");
      expect(res2?.title).toBe("Liverpool Street In The Rain");

      const res3 = parseSetlistLine("[03] Fred again.. - Jungle");
      expect(res3?.artist).toBe("Fred again..");
      expect(res3?.title).toBe("Jungle");
    });

    it("parses lines with timestamps e.g. '[00:00] Artist - Title' or '03:45 Artist - Title'", () => {
      const res1 = parseSetlistLine("[00:00] Four Tet - Baby");
      expect(res1?.artist).toBe("Four Tet");
      expect(res1?.title).toBe("Baby");

      const res2 = parseSetlistLine("01:23:45 Burial - Archangel");
      expect(res2?.artist).toBe("Burial");
      expect(res2?.title).toBe("Archangel");

      const res3 = parseSetlistLine(
        "12:30 - Peggy Gou - (It Goes Like) Nanana",
      );
      expect(res3?.artist).toBe("Peggy Gou");
      expect(res3?.title).toBe("(It Goes Like) Nanana");
    });

    it("handles en-dash (–) and em-dash (—) separators", () => {
      const res1 = parseSetlistLine("Floating Points – Falaise");
      expect(res1?.artist).toBe("Floating Points");
      expect(res1?.title).toBe("Falaise");

      const res2 = parseSetlistLine("Jon Hopkins — Emerald Rush");
      expect(res2?.artist).toBe("Jon Hopkins");
      expect(res2?.title).toBe("Emerald Rush");
    });

    it("handles tab, semicolon and colon delimiters", () => {
      const resTab = parseSetlistLine("Aphex Twin\tWindowlicker");
      expect(resTab?.artist).toBe("Aphex Twin");
      expect(resTab?.title).toBe("Windowlicker");

      const resSemi = parseSetlistLine("Daft Punk; One More Time");
      expect(resSemi?.artist).toBe("Daft Punk");
      expect(resSemi?.title).toBe("One More Time");
    });

    it("parses mix/remix titles properly", () => {
      const res = parseSetlistLine("CamelPhat & Elderbrook - Cola (Club Mix)");
      expect(res?.artist).toBe("CamelPhat & Elderbrook");
      expect(res?.title).toBe("Cola (Club Mix)");
    });

    it("ignores comments, empty lines, and noisy headers", () => {
      expect(parseSetlistLine("")).toBeNull();
      expect(parseSetlistLine("   ")).toBeNull();
      expect(parseSetlistLine("# Tracklist from 1001Tracklists")).toBeNull();
      expect(parseSetlistLine("// Recorded live at Printworks")).toBeNull();
      expect(parseSetlistLine("TRACKLIST:")).toBeNull();
      expect(parseSetlistLine("1001Tracklists - Tracklist")).toBeNull();
      expect(parseSetlistLine("JustOneWord")).toBeNull();
    });
  });

  describe("parseCsvSetlist", () => {
    it("parses Rekordbox history export CSV", () => {
      const rekordboxCsv = `#	Track Title	Artist	Album	BPM	Rating	Time	Genre	Key
1	Glue	Bicep	Bicep	130	***	04:29	Electronic	8A
2	So U Kno	Overmono	So U Kno - Single	134	****	05:43	Bass	11B
`;
      const tracks = parseCsvSetlist(rekordboxCsv);
      expect(tracks).toHaveLength(2);
      expect(tracks[0].name).toBe("Glue");
      expect(tracks[0].artists[0].name).toBe("Bicep");
      expect(tracks[0].album.name).toBe("Bicep");
      expect(tracks[0].track_number).toBe(1);

      expect(tracks[1].name).toBe("So U Kno");
      expect(tracks[1].artists[0].name).toBe("Overmono");
      expect(tracks[1].album.name).toBe("So U Kno - Single");
      expect(tracks[1].track_number).toBe(2);
    });

    it("parses Traktor history export (comma-delimited)", () => {
      const traktorCsv = `#,Title,Artist,Album,Time,BPM
1,"Hypercolour","CamelPhat","Dark Matter","04:12","125"
2,"Breathe","Eric Prydz","Opus","03:59","126"
`;
      const tracks = parseCsvSetlist(traktorCsv);
      expect(tracks).toHaveLength(2);
      expect(tracks[0].name).toBe("Hypercolour");
      expect(tracks[0].artists[0].name).toBe("CamelPhat");
      expect(tracks[0].album.name).toBe("Dark Matter");

      expect(tracks[1].name).toBe("Breathe");
      expect(tracks[1].artists[0].name).toBe("Eric Prydz");
      expect(tracks[1].album.name).toBe("Opus");
    });

    it("parses Serato history export CSV", () => {
      const seratoCsv = `name,artist,album,playtime
"Music Sounds Better With You","Stardust","Roule","06:45"
"Around The World","Daft Punk","Homework","07:09"
`;
      const tracks = parseCsvSetlist(seratoCsv);
      expect(tracks).toHaveLength(2);
      expect(tracks[0].name).toBe("Music Sounds Better With You");
      expect(tracks[0].artists[0].name).toBe("Stardust");
      expect(tracks[0].album.name).toBe("Roule");
      expect(tracks[1].name).toBe("Around The World");
      expect(tracks[1].artists[0].name).toBe("Daft Punk");
    });

    it("falls back to plaintext parsing if CSV headers are not found", () => {
      const textCsv = `Underworld - Born Slippy (NXXT)
Faithless - Insomnia (Monster Mix)
`;
      const tracks = parseCsvSetlist(textCsv);
      expect(tracks).toHaveLength(2);
      expect(tracks[0].name).toBe("Born Slippy (NXXT)");
      expect(tracks[0].artists[0].name).toBe("Underworld");
      expect(tracks[1].name).toBe("Insomnia (Monster Mix)");
      expect(tracks[1].artists[0].name).toBe("Faithless");
    });
  });

  describe("parseSetlist (High-Level)", () => {
    it("parses raw textarea plaintext setlists and validates conforming to TracksArraySchema", () => {
      const rawText = `
// Festival Set 2026
01. Bicep - Glue
02. Overmono - So U Kno
[00:10:45] Fred again.. & Swedish House Mafia - Turn On The Lights again.. (feat. Future)
Mall Grab - Liverpool Street In The Rain (Club Edit)
      `;

      const tracks = parseSetlist(rawText, "plaintext.txt");
      expect(tracks).toHaveLength(4);

      // Verify schema compliance
      const validated = TracksArraySchema.safeParse(tracks);
      expect(validated.success).toBe(true);

      expect(tracks[0].name).toBe("Glue");
      expect(tracks[0].artists[0].name).toBe("Bicep");
      expect(tracks[0].track_number).toBe(1);

      expect(tracks[2].name).toBe("Turn On The Lights again.. (feat. Future)");
      expect(tracks[2].artists.length).toBeGreaterThanOrEqual(1);
    });

    it("handles CSV filename inputs automatically via parseSetlist", () => {
      const csvData = `Track Title,Artist,Album
Energy,Disclosure,ENERGY
Latch,Disclosure,Settle
`;
      const tracks = parseSetlist(csvData, "history.csv");
      expect(tracks).toHaveLength(2);
      expect(tracks[0].name).toBe("Energy");
      expect(tracks[0].artists[0].name).toBe("Disclosure");
      expect(tracks[1].name).toBe("Latch");
    });

    it("returns empty array for empty or completely unparseable input", () => {
      expect(parseSetlist("")).toEqual([]);
      expect(parseSetlist("# Only comments\n// and another comment")).toEqual(
        [],
      );
    });
  });
});
