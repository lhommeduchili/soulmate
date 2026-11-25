import { Track, Artist } from "./types";

export interface ParsedLineResult {
  artist: string;
  title: string;
  album?: string;
  trackNumber?: number;
}

const NOISE_LINE_PATTERNS = [
  /^\s*#/,
  /^\s*\/\//,
  /^\s*tracklist/i,
  /^\s*setlist/i,
  /^\s*1001tracklists/i,
  /^\s*track\s+title\s+artist/i,
];

/**
 * Splits artist string into individual artist objects when separated by '&', 'x', 'vs.', etc.
 */
export function extractArtists(artistStr: string): Artist[] {
  const trimmed = artistStr.trim();
  if (!trimmed) return [{ name: "Unknown" }];

  // Split on common DJ collaboration separators
  const parts = trimmed
    .split(/\s+(?:&|x|feat\.?|ft\.?|vs\.?)\s+|,\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) {
    return [{ name: trimmed }];
  }

  return parts.map((name) => ({ name }));
}

/**
 * Parses a single plaintext tracklist line into artist and title.
 */
export function parseSetlistLine(rawLine: string): ParsedLineResult | null {
  const line = rawLine.trim();
  if (!line) return null;

  // Filter comment / noise lines
  for (const pattern of NOISE_LINE_PATTERNS) {
    if (pattern.test(line)) return null;
  }

  let cleaned = line;

  // 1. Strip bracketed or bare timestamps: [00:00], [01:23:45], 00:00, 01:23:45
  cleaned = cleaned
    .replace(/^\[\s*\d{1,2}:\d{2}(?::\d{2})?\s*\]\s*[-–—]?\s*/, "")
    .replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*[-–—]?\s*/, "")
    .trim();

  // 2. Strip track numbering: "01. ", "01 - ", "[01] ", "(01) ", "1. ", "1 - "
  cleaned = cleaned
    .replace(/^\[\s*\d+\s*\]\s*[-–—]?\s*/, "")
    .replace(/^\(\s*\d+\s*\)\s*[-–—]?\s*/, "")
    .replace(/^\d+[\.\)]\s*[-–—]?\s*/, "")
    .replace(/^\d+\s*[-–—]\s*/, "")
    .trim();

  if (!cleaned) return null;

  // 3. Find separator between Artist and Title
  // Priority 1: Dash with spaces or standard dashes: " - ", " – ", " — "
  let artist = "";
  let title = "";

  const dashMatch = cleaned.match(/\s+[-–—]\s+/);
  if (dashMatch && dashMatch.index !== undefined) {
    artist = cleaned.slice(0, dashMatch.index).trim();
    title = cleaned.slice(dashMatch.index + dashMatch[0].length).trim();
  } else if (cleaned.includes("\t")) {
    const parts = cleaned
      .split("\t")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      artist = parts[0];
      title = parts[1];
    }
  } else if (cleaned.includes(";")) {
    const parts = cleaned
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      artist = parts[0];
      title = parts[1];
    }
  } else if (cleaned.includes(": ")) {
    const colonIdx = cleaned.indexOf(": ");
    artist = cleaned.slice(0, colonIdx).trim();
    title = cleaned.slice(colonIdx + 2).trim();
  } else if (cleaned.includes(" - ")) {
    const parts = cleaned.split(" - ");
    artist = parts[0].trim();
    title = parts.slice(1).join(" - ").trim();
  }

  // Fallback: If still not separated, check if line is simply single word or doesn't have a valid separator
  if (!artist || !title) {
    return null;
  }

  // Final sanity check: artist and title shouldn't be empty or only noise
  if (artist.length < 1 || title.length < 1) {
    return null;
  }

  return { artist, title };
}

/**
 * Parses CSV lines handling escaped quotes.
 */
function parseCsvRow(row: string, delimiter: string = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses CSV setlist exports (Rekordbox, Traktor, Serato).
 */
export function parseCsvSetlist(content: string): Track[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  // Detect delimiter in first non-empty line
  const firstLine = lines[0];
  let delimiter = ",";
  if (
    firstLine.includes("\t") &&
    firstLine.split("\t").length > firstLine.split(",").length
  ) {
    delimiter = "\t";
  } else if (
    firstLine.includes(";") &&
    firstLine.split(";").length > firstLine.split(",").length
  ) {
    delimiter = ";";
  }

  const headerCells = parseCsvRow(firstLine, delimiter).map((c) =>
    c.toLowerCase().replace(/['"]/g, "").trim(),
  );

  let titleIdx = -1;
  let artistIdx = -1;
  let albumIdx = -1;
  let trackNumIdx = -1;

  for (let i = 0; i < headerCells.length; i++) {
    const h = headerCells[i];
    if (
      titleIdx === -1 &&
      /^(track\s*title|title|song\s*title|song|name)$/i.test(h)
    ) {
      titleIdx = i;
    } else if (
      artistIdx === -1 &&
      /^(artist|artists|artist\s*name|performer)$/i.test(h)
    ) {
      artistIdx = i;
    } else if (albumIdx === -1 && /^(album|album\s*title|release)$/i.test(h)) {
      albumIdx = i;
    } else if (
      trackNumIdx === -1 &&
      /^([#]|track|track_?number|position|index)$/i.test(h)
    ) {
      trackNumIdx = i;
    }
  }

  // If valid CSV headers for title & artist were identified:
  if (titleIdx !== -1 && artistIdx !== -1) {
    const tracks: Track[] = [];
    for (let r = 1; r < lines.length; r++) {
      const cells = parseCsvRow(lines[r], delimiter);
      const title = cells[titleIdx]?.trim();
      const artist = cells[artistIdx]?.trim();
      const album = albumIdx !== -1 ? cells[albumIdx]?.trim() : undefined;
      const numRaw =
        trackNumIdx !== -1 ? parseInt(cells[trackNumIdx], 10) : undefined;
      const trackNumber = !isNaN(numRaw ?? NaN) ? numRaw : tracks.length + 1;

      if (title && artist) {
        tracks.push({
          id: `setlist-${tracks.length + 1}-${encodeURIComponent(title.slice(0, 16))}`,
          name: title,
          artists: extractArtists(artist),
          album: { name: album || "Setlist Import" },
          duration_ms: 0,
          track_number: trackNumber,
        });
      }
    }
    return tracks;
  }

  // Fallback: If no recognized headers, parse each line as plaintext
  return parsePlaintextSetlist(content);
}

/**
 * Parses raw plaintext tracklists (e.g. 1001Tracklists, notepad).
 */
export function parsePlaintextSetlist(content: string): Track[] {
  const lines = content.split(/\r?\n/);
  const tracks: Track[] = [];

  for (const rawLine of lines) {
    const parsed = parseSetlistLine(rawLine);
    if (parsed) {
      tracks.push({
        id: `setlist-${tracks.length + 1}-${encodeURIComponent(parsed.title.slice(0, 16))}`,
        name: parsed.title,
        artists: extractArtists(parsed.artist),
        album: { name: parsed.album || "Setlist Import" },
        duration_ms: 0,
        track_number: tracks.length + 1,
      });
    }
  }

  return tracks;
}

/**
 * High-level parser auto-detecting CSV vs plaintext.
 */
export function parseSetlist(content: string, filename?: string): Track[] {
  if (!content || !content.trim()) return [];

  const isCsv =
    (filename &&
      (filename.toLowerCase().endsWith(".csv") ||
        filename.toLowerCase().endsWith(".tsv"))) ||
    content.startsWith("#\t") ||
    content.startsWith("#,") ||
    content.toLowerCase().startsWith("track title,") ||
    content.toLowerCase().startsWith("name,artist");

  if (isCsv) {
    return parseCsvSetlist(content);
  }

  return parsePlaintextSetlist(content);
}
