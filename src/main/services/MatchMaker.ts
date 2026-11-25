import { Track, SlskdFile } from "../../shared/types";
import log from "../utils/logger";

export class MatchMaker {
  private formatPriority: string[];

  constructor(formatPriority: string[] = ["aiff", "wav", "flac", "mp3"]) {
    this.formatPriority = formatPriority;
  }

  public updateFormatPriority(formats: string[]) {
    this.formatPriority = formats;
  }

  /**
   * Generates a multi-tier search query cascade:
   * Tier 1 (Exact): Artist Title (sanitized).
   * Tier 2 (Cleaned): Strip parenthetical/bracketed noisy suffixes (e.g. (feat. ...), [Remastered ...], (Club Mix)).
   * Tier 3 (Minimalist): Primary artist only + core track title.
   */
  public buildQueryCascade(track: Track): string[] {
    const primaryArtist = track.artists[0]?.name
      ? track.artists[0].name.trim()
      : "Unknown";
    const rawTitle = track.name.trim();

    // Tier 1: Exact / Full
    const tier1 = `${primaryArtist} ${rawTitle}`.trim();

    // Tier 2: Strip parenthetical / bracketed noisy suffixes
    const noisySuffixPattern =
      /\s*[\(\[](?:feat\.?|ft\.?|remaster(?:ed)?|mix|edit|version|dub|instrumental|bonus|vip|club|extended|radio|deluxe|hq|official|audio|video|original)[^\)\]]*[\)\]]/gi;
    const cleanedTitle = rawTitle
      .replace(noisySuffixPattern, "")
      .replace(/\s+/g, " ")
      .trim();
    const tier2 = `${primaryArtist} ${cleanedTitle || rawTitle}`.trim();

    // Tier 3: Minimalist (primary artist + core title without brackets or punctuation)
    const coreTitle = (cleanedTitle || rawTitle)
      .replace(/[\(\[][^\)\]]*[\)\]]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const tier3 =
      `${primaryArtist} ${coreTitle || cleanedTitle || rawTitle}`.trim();

    // Deduplicate in order
    const cascade: string[] = [];
    for (const q of [tier1, tier2, tier3]) {
      if (q && !cascade.includes(q)) {
        cascade.push(q);
      }
    }

    return cascade.length > 0 ? cascade : [tier1];
  }

  /**
   * Finds the next best matching file, excluding peers that failed or stalled.
   */
  public findNextBestMatch(
    track: Track,
    searchResults: SlskdFile[],
    excludedUsernames: string[] = [],
  ): SlskdFile | null {
    const excludedSet = new Set(excludedUsernames.map((u) => u.toLowerCase()));
    const nonExcluded = searchResults.filter(
      (file) => !excludedSet.has(file.username.toLowerCase()),
    );
    return this.findBestMatch(track, nonExcluded);
  }

  public normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[()\[\]{}\-_+]/g, " ") // replace special chars with spaces
      .replace(/\s+/g, " ") // collapse multiple spaces
      .trim();
  }

  public calculateRelevance(track: Track, file: SlskdFile): number {
    const normalizedFilename = this.normalizeString(file.filename);
    const normalizedArtist = this.normalizeString(track.artists[0].name);
    const normalizedTrack = this.normalizeString(track.name);
    const noisySuffixPattern =
      /\s*[\(\[](?:feat\.?|ft\.?|remaster(?:ed)?|mix|edit|version|dub|instrumental|bonus|vip|club|extended|radio|deluxe|hq|official|audio|video|original)[^\)\]]*[\)\]]/gi;
    const cleanedTrack = this.normalizeString(
      track.name
        .replace(noisySuffixPattern, "")
        .replace(/\s+(?:feat\.?|ft\.?)\s+.*$/i, ""),
    );
    const normalizedAlbum = track.album?.name
      ? this.normalizeString(track.album.name)
      : "";

    // console.log(`[MatchMaker] Checking file: "${file.filename}"`)
    // console.log(`[MatchMaker] Normalized: "${normalizedFilename}"`)

    let score = 0;

    // artist match (required - 100 points)
    if (normalizedFilename.includes(normalizedArtist)) {
      score += 100;
    } else {
      return 0; // no match without artist
    }

    // track name match (required - 100 points)
    if (
      normalizedFilename.includes(normalizedTrack) ||
      (cleanedTrack.length >= 2 && normalizedFilename.includes(cleanedTrack))
    ) {
      score += 100;
    } else {
      return 0; // no match without track name
    }

    // album match (bonus - 50 points)
    if (
      normalizedAlbum &&
      normalizedFilename.includes(normalizedAlbum) &&
      normalizedAlbum !== "unknown" &&
      normalizedAlbum.length > 3
    ) {
      score += 50;
    }

    // Penalize "Remix", "Live", etc. if not in original track name
    const penaltyKeywords = [
      "remix",
      "mix",
      "live",
      "edit",
      "cover",
      "dub",
      "instrumental",
      "acapella",
      "vip",
      "demo",
    ];

    for (const word of penaltyKeywords) {
      // Check if file has "remix" but user didn't ask for "remix"
      if (
        normalizedFilename.includes(` ${word}`) ||
        normalizedFilename.includes(`${word} `)
      ) {
        if (!normalizedTrack.includes(word)) {
          score -= 40;
        }
      }
    }

    return score;
  }

  public findBestMatch(
    track: Track,
    searchResults: SlskdFile[],
  ): SlskdFile | null {
    // STEP 1: filter by relevance
    const MIN_RELEVANCE_SCORE = 150;

    const relevantFiles = searchResults
      .map((file) => ({
        file,
        relevance: this.calculateRelevance(track, file),
      }))
      .filter((item) => item.relevance >= MIN_RELEVANCE_SCORE)
      .filter((item) => {
        const file = item.file;
        const ext = file.filename.split(".").pop()?.toLowerCase() || "";

        // Always allow lossless formats
        if (["flac", "wav", "aiff"].includes(ext)) return true;

        // For MP3, strictly require 320kbps
        if (ext === "mp3") {
          return file.bitRate >= 320;
        }

        return false;
      });

    if (relevantFiles.length === 0) {
      // log.debug('[MatchMaker] no files matched relevance criteria')
      return null;
    }

    log.info(
      `[MatchMaker] ${relevantFiles.length}/${searchResults.length} files matched relevance criteria`,
    );

    // STEP 2: sort by relevance THEN quality
    relevantFiles.sort((a, b) => {
      // 0. Relevance Score (Primary Sort)
      if (a.relevance !== b.relevance) return b.relevance - a.relevance;

      // 1. Format Priority
      const fileA = a.file;
      const fileB = b.file;

      const extA = fileA.filename.split(".").pop()?.toLowerCase() || "";
      const extB = fileB.filename.split(".").pop()?.toLowerCase() || "";
      const idxA = this.formatPriority.indexOf(extA);
      const idxB = this.formatPriority.indexOf(extB);

      if (idxA !== -1 && idxB !== -1 && idxA !== idxB) return idxA - idxB; // Lower index = Higher priority
      if (idxA !== -1 && idxB === -1) return -1;
      if (idxA === -1 && idxB !== -1) return 1;

      // 2. Availability (Free Slots preferred)
      if (fileA.slotsFree && !fileB.slotsFree) return -1;
      if (!fileA.slotsFree && fileB.slotsFree) return 1;

      // 3. Bitrate (Higher is better)
      if (fileA.bitRate !== fileB.bitRate) return fileB.bitRate - fileA.bitRate;

      // 4. Queue Length (Lower is better)
      if (fileA.queueLength !== fileB.queueLength)
        return fileA.queueLength - fileB.queueLength;

      return 0;
    });

    if (relevantFiles.length > 0) {
      log.info(
        `[MatchMaker] Best match: ${relevantFiles[0].file.filename} (Score: ${relevantFiles[0].relevance})`,
      );
    }

    return relevantFiles.length > 0 ? relevantFiles[0].file : null;
  }
}
