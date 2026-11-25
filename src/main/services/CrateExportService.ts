import { join, extname } from "path";
import { mkdirSync, writeFileSync, existsSync, statSync } from "fs";
import { shell } from "electron";
import { Track } from "../../shared/types";
import { sanitizeFilename, buildTargetFilePath } from "./MetadataService";
import { LibraryService } from "./LibraryService";
import log from "../utils/logger";
import {
  isPathWithinDirectory,
  sanitizeExportFileName,
} from "../utils/security";

export interface GenerateRekordboxXmlOptions {
  playlistName: string;
  tracks: Track[];
  downloadDir: string;
}

export interface SerializeSeratoCrateOptions {
  playlistName: string;
  tracks: Track[];
  downloadDir: string;
}

export interface GenerateTraktorNmlOptions {
  playlistName: string;
  tracks: Track[];
  downloadDir: string;
}

export interface ExportCrateOptions {
  playlistName: string;
  tracks: Track[];
  downloadDir: string;
  reveal?: boolean;
  fileName?: string;
}

export interface ExportCrateResult {
  filePath: string;
  success: boolean;
  trackCount: number;
}

/**
 * Escapes characters for strict XML serialization (&, <, >, ", ').
 */
export function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Formats a local filesystem path into Traktor Pro NML volume, directory, and file notation.
 * On macOS/Linux: VOLUME="/" and DIR="/:Users/:username/:Music/:.../:"
 * On Windows: VOLUME="C:" and DIR="/:Users/:username/:Music/:.../:"
 */
export function pathToTraktorLocation(filePath: string): {
  volume: string;
  dir: string;
  file: string;
  primaryKey: string;
} {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const file = lastSlash !== -1 ? normalized.slice(lastSlash + 1) : normalized;
  const dirPath = lastSlash !== -1 ? normalized.slice(0, lastSlash) : "";

  let volume = "/";
  let pathWithoutVolume = dirPath;

  // Check Windows drive letter like C:
  if (/^[a-zA-Z]:/.test(dirPath)) {
    volume = dirPath.slice(0, 2);
    pathWithoutVolume = dirPath.slice(2);
  }

  const parts = pathWithoutVolume
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  const dir = parts.length > 0 ? `/:${parts.join("/:")}/:` : "/:";
  const primaryKey = `${volume === "/" ? "" : volume}${dir}${file}`;

  return { volume, dir, file, primaryKey };
}

/**
 * Formats a local filesystem path into Pioneer Rekordbox file://localhost/... URI
 * with percent-encoding for spaces and special characters.
 */
export function pathToRekordboxUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const encodedParts = parts.map((part, idx) => {
    // Preserve Windows drive letters like C:
    if (idx === 0 && /^[a-zA-Z]:$/.test(part)) {
      return part;
    }
    return encodeURIComponent(part);
  });

  let joined = encodedParts.join("/");
  if (!joined.startsWith("/")) {
    joined = "/" + joined;
  }

  return `file://localhost${joined}`;
}

/**
 * Encodes a JavaScript string to a UTF-16 Big-Endian Buffer.
 */
export function stringToUtf16Be(str: string): Buffer {
  const buf = Buffer.alloc(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    buf.writeUInt16BE(str.charCodeAt(i), i * 2);
  }
  return buf;
}

/**
 * Creates a Serato TLV (Tag-Length-Value) record.
 * 4 bytes tag (ASCII), 4 bytes length (uint32BE), followed by value Buffer.
 */
export function createTlvBlock(tag: string, value: Buffer): Buffer {
  const tagBuf = Buffer.from(tag.slice(0, 4), "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(value.length, 0);
  return Buffer.concat([tagBuf, lenBuf, value]);
}

/**
 * Parses a Serato .crate binary buffer back into version and track paths.
 */
export function parseSeratoCrate(buffer: Buffer): {
  version: string;
  trackPaths: string[];
} {
  let version = "";
  const trackPaths: string[] = [];

  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const tag = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32BE(offset + 4);
    offset += 8;

    if (offset + length > buffer.length) break;
    const valueBuf = buffer.subarray(offset, offset + length);
    offset += length;

    if (tag === "vrsn") {
      let str = "";
      for (let i = 0; i < valueBuf.length; i += 2) {
        str += String.fromCharCode(valueBuf.readUInt16BE(i));
      }
      version = str;
    } else if (tag === "otrk") {
      // Parse nested ptrk
      let innerOffset = 0;
      while (innerOffset + 8 <= valueBuf.length) {
        const innerTag = valueBuf.toString(
          "ascii",
          innerOffset,
          innerOffset + 4,
        );
        const innerLength = valueBuf.readUInt32BE(innerOffset + 4);
        innerOffset += 8;

        if (innerOffset + innerLength > valueBuf.length) break;
        const innerVal = valueBuf.subarray(
          innerOffset,
          innerOffset + innerLength,
        );
        innerOffset += innerLength;

        if (innerTag === "ptrk") {
          let pathStr = "";
          for (let j = 0; j < innerVal.length; j += 2) {
            pathStr += String.fromCharCode(innerVal.readUInt16BE(j));
          }
          trackPaths.push(pathStr);
        }
      }
    }
  }

  return { version, trackPaths };
}

export class CrateExportService {
  private libraryService: LibraryService;

  constructor(libraryService: LibraryService = new LibraryService()) {
    this.libraryService = libraryService;
  }

  /**
   * Resolves the verified or DJ-standard target filesystem path for a track.
   */
  resolveTrackPath(track: Track, downloadDir: string): string {
    const possibleTrack = track as Track & {
      targetPath?: string;
      filePath?: string;
    };

    if (possibleTrack.targetPath && existsSync(possibleTrack.targetPath)) {
      return possibleTrack.targetPath;
    }
    if (possibleTrack.filePath && existsSync(possibleTrack.filePath)) {
      return possibleTrack.filePath;
    }

    const inLib = this.libraryService.findTrackInLibrary(track, downloadDir);
    if (inLib) return inLib;

    return buildTargetFilePath({
      downloadDir,
      track,
      extension: track.formatInfo?.format === "MP3" ? "mp3" : "flac",
      trackNumber: track.track_number,
      year: track.year,
    });
  }

  /**
   * Generates pure Pioneer Rekordbox XML (<DJ_PLAYLISTS Version="1.0.0">) collection.
   */
  generateRekordboxXml(options: GenerateRekordboxXmlOptions): string {
    const { playlistName, tracks, downloadDir } = options;
    const now = new Date().toISOString().slice(0, 10);

    const trackEntries: string[] = [];
    const playlistNodes: string[] = [];

    tracks.forEach((track, index) => {
      const trackId = String(index + 1);
      const audioPath = this.resolveTrackPath(track, downloadDir);
      const location = pathToRekordboxUri(audioPath);

      const title = track.name || "Unknown Track";
      const artist =
        track.artists && track.artists.length > 0
          ? track.artists.map((a) => a.name).join(", ")
          : "Unknown Artist";
      const album = track.album?.name || "";
      const durationSec =
        track.duration_ms && track.duration_ms > 0
          ? Math.round(track.duration_ms / 1000)
          : 0;

      let fileSize = 0;
      if (existsSync(audioPath)) {
        try {
          fileSize = statSync(audioPath).size;
        } catch {}
      }

      const isFlac =
        track.formatInfo?.format === "FLAC" ||
        extname(audioPath).toLowerCase() === ".flac";
      const kind = isFlac ? "FLAC File" : "MP3 File";
      const sampleRate = track.formatInfo?.sampleRate || 44100;
      const bitRate = track.formatInfo?.bitrate || (isFlac ? 1411 : 320);
      const tonality = track.formatInfo?.camelotKey || "";
      const bpm =
        track.formatInfo?.bpm && track.formatInfo.bpm > 0
          ? track.formatInfo.bpm.toFixed(2)
          : "";

      trackEntries.push(
        `    <TRACK TrackID="${trackId}" Name="${escapeXml(title)}" Artist="${escapeXml(artist)}" Composer="" Album="${escapeXml(album)}" Grouping="" Genre="" Kind="${kind}" Size="${fileSize}" TotalTime="${durationSec}" DiscNumber="1" TrackNumber="${track.track_number || index + 1}" Year="${track.year || ""}" AverageBpm="${bpm}" DateAdded="${now}" BitRate="${bitRate}" SampleRate="${sampleRate}" Comments="" PlayCount="0" Rating="0" Location="${location}" Tonality="${tonality}"/>`,
      );

      playlistNodes.push(`        <TRACK Key="${trackId}"/>`);
    });

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<DJ_PLAYLISTS Version="1.0.0">',
      '  <PRODUCT Name="rekordbox" Version="6.0.0" Company="Pioneer DJ"/>',
      `  <COLLECTION Entries="${tracks.length}">`,
      ...trackEntries,
      "  </COLLECTION>",
      "  <PLAYLISTS>",
      '    <NODE Type="0" Name="ROOT">',
      `      <NODE Name="${escapeXml(playlistName)}" Type="1" KeyType="0" Entries="${tracks.length}">`,
      ...playlistNodes,
      "      </NODE>",
      "    </NODE>",
      "  </PLAYLISTS>",
      "</DJ_PLAYLISTS>",
      "",
    ].join("\n");
  }

  /**
   * Serializes playlist into pure Serato .crate binary Tag-Length-Value format.
   */
  serializeSeratoCrate(options: SerializeSeratoCrateOptions): Buffer {
    const { tracks, downloadDir } = options;

    // Header block: vrsn -> 1.0/Serato ScratchLive Crate
    const versionStr = "1.0/Serato ScratchLive Crate";
    const vrsnVal = stringToUtf16Be(versionStr);
    const vrsnBlock = createTlvBlock("vrsn", vrsnVal);

    const otrkBlocks: Buffer[] = [];

    for (const track of tracks) {
      const audioPath = this.resolveTrackPath(track, downloadDir);
      let seratoPath = audioPath.replace(/\\/g, "/");

      // Serato expects path relative to drive root without leading slash or drive letter
      if (/^[a-zA-Z]:\/?/.test(seratoPath)) {
        seratoPath = seratoPath.replace(/^[a-zA-Z]:\/?/, "");
      }
      seratoPath = seratoPath.replace(/^\/+/, "");

      const ptrkVal = stringToUtf16Be(seratoPath);
      const ptrkBlock = createTlvBlock("ptrk", ptrkVal);
      const otrkBlock = createTlvBlock("otrk", ptrkBlock);
      otrkBlocks.push(otrkBlock);
    }

    return Buffer.concat([vrsnBlock, ...otrkBlocks]);
  }

  /**
   * Exports Pioneer Rekordbox XML collection to disk and optionally reveals in OS file explorer.
   */
  exportRekordboxXml(options: ExportCrateOptions): ExportCrateResult {
    const {
      playlistName,
      tracks,
      downloadDir,
      reveal = false,
      fileName = "rekordbox.xml",
    } = options;

    mkdirSync(downloadDir, { recursive: true });
    const safeFileName = sanitizeExportFileName(
      fileName,
      "rekordbox.xml",
      ".xml",
    );
    const filePath = join(downloadDir, safeFileName);
    if (!isPathWithinDirectory(filePath, downloadDir)) {
      throw new Error("Invalid export file path");
    }
    const content = this.generateRekordboxXml({
      playlistName,
      tracks,
      downloadDir,
    });

    writeFileSync(filePath, content, "utf-8");
    log.info(`[CrateExportService] Exported Rekordbox XML to: ${filePath}`);

    const isTest =
      process.env.NODE_ENV === "test" ||
      Boolean(process.env.PLAYWRIGHT_TEST) ||
      Boolean(process.env.TEST_USER_DATA_DIR);

    if (reveal && !isTest) {
      try {
        if (existsSync(filePath)) {
          shell.showItemInFolder(filePath);
        }
      } catch (err) {
        log.warn(
          `[CrateExportService] Failed to reveal Rekordbox XML in folder: ${filePath}`,
          err,
        );
      }
    }

    return {
      filePath,
      success: true,
      trackCount: tracks.length,
    };
  }

  /**
   * Exports Serato .crate subcrate file to disk and optionally reveals in OS file explorer.
   */
  exportSeratoCrate(options: ExportCrateOptions): ExportCrateResult {
    const { playlistName, tracks, downloadDir, reveal = false } = options;
    const sanitizedName = sanitizeFilename(playlistName) || "Soulmate Playlist";
    const defaultName = `${sanitizedName}.crate`;
    const safeFileName = sanitizeExportFileName(
      options.fileName,
      defaultName,
      ".crate",
    );

    mkdirSync(downloadDir, { recursive: true });
    const filePath = join(downloadDir, safeFileName);
    if (!isPathWithinDirectory(filePath, downloadDir)) {
      throw new Error("Invalid export file path");
    }
    const buffer = this.serializeSeratoCrate({
      playlistName,
      tracks,
      downloadDir,
    });

    writeFileSync(filePath, buffer);
    log.info(`[CrateExportService] Exported Serato subcrate to: ${filePath}`);

    const isTest =
      process.env.NODE_ENV === "test" ||
      Boolean(process.env.PLAYWRIGHT_TEST) ||
      Boolean(process.env.TEST_USER_DATA_DIR);

    if (reveal && !isTest) {
      try {
        if (existsSync(filePath)) {
          shell.showItemInFolder(filePath);
        }
      } catch (err) {
        log.warn(
          `[CrateExportService] Failed to reveal Serato crate in folder: ${filePath}`,
          err,
        );
      }
    }

    return {
      filePath,
      success: true,
      trackCount: tracks.length,
    };
  }

  /**
   * Generates pure Native Instruments Traktor Pro NML (<NML VERSION="19">) collection.
   */
  generateTraktorNml(options: GenerateTraktorNmlOptions): string {
    const { playlistName, tracks, downloadDir } = options;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const importDate = `${yyyy}/${mm}/${dd}`;

    const entryNodes: string[] = [];
    const playlistNodes: string[] = [];

    tracks.forEach((track, index) => {
      const audioPath = this.resolveTrackPath(track, downloadDir);
      const loc = pathToTraktorLocation(audioPath);

      const title = track.name || "Unknown Track";
      const artist =
        track.artists && track.artists.length > 0
          ? track.artists.map((a) => a.name).join(", ")
          : "Unknown Artist";
      const album = track.album?.name || "";
      const trackNumber = String(track.track_number || index + 1);
      const durationSec =
        track.duration_ms && track.duration_ms > 0
          ? Math.round(track.duration_ms / 1000)
          : 0;

      let fileSize = 0;
      if (existsSync(audioPath)) {
        try {
          fileSize = statSync(audioPath).size;
        } catch {}
      }

      const isFlac =
        track.formatInfo?.format === "FLAC" ||
        extname(audioPath).toLowerCase() === ".flac";
      const bitRate = track.formatInfo?.bitrate || (isFlac ? 1411 : 320);
      const tonality = track.formatInfo?.camelotKey || "";
      const bpm =
        track.formatInfo?.bpm && track.formatInfo.bpm > 0
          ? track.formatInfo.bpm.toFixed(6)
          : "120.000000";

      const keyTag = tonality
        ? `        <KEY>${escapeXml(tonality)}</KEY>\n`
        : "";

      entryNodes.push(
        `    <ENTRY ARTIST="${escapeXml(artist)}" TITLE="${escapeXml(title)}">\n` +
          `      <LOCATION DIR="${escapeXml(loc.dir)}" FILE="${escapeXml(loc.file)}" VOLUME="${escapeXml(loc.volume)}" VOLUMEID=""/>\n` +
          `      <ALBUM TITLE="${escapeXml(album)}" TRACK="${trackNumber}"/>\n` +
          `      <INFO BITRATE="${bitRate}" GENRE="" PLAYTIME="${durationSec}" PLAYTIME_FLOAT="${durationSec.toFixed(6)}" IMPORT_DATE="${importDate}" FILESIZE="${fileSize}" FLAGS="1" KEY="${escapeXml(tonality)}">\n` +
          keyTag +
          `      </INFO>\n` +
          `      <TEMPO BPM="${bpm}" BPM_QUALITY="100.000000"/>\n` +
          `    </ENTRY>`,
      );

      playlistNodes.push(
        `          <ENTRY>\n` +
          `            <PRIMARYKEY TYPE="TRACK" KEY="${escapeXml(loc.primaryKey)}"/>\n` +
          `          </ENTRY>`,
      );
    });

    const playlistUuid =
      "soulmate-" +
      Math.abs(
        playlistName
          .split("")
          .reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0),
      ).toString(16);

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<NML VERSION="19">',
      '  <HEAD COMPANY="Native Instruments" PROGRAM="Traktor"/>',
      `  <COLLECTION ENTRIES="${tracks.length}">`,
      entryNodes.join("\n"),
      "  </COLLECTION>",
      "  <PLAYLISTS>",
      '    <NODE TYPE="FOLDER" NAME="$ROOT">',
      '      <SUBNODES COUNT="1">',
      `        <NODE TYPE="PLAYLIST" NAME="${escapeXml(playlistName)}">`,
      `          <PLAYLIST ENTRIES="${tracks.length}" TYPE="LIST" UUID="${playlistUuid}">`,
      playlistNodes.join("\n"),
      "          </PLAYLIST>",
      "        </NODE>",
      "      </SUBNODES>",
      "    </NODE>",
      "  </PLAYLISTS>",
      "</NML>",
      "",
    ].join("\n");
  }

  /**
   * Exports Traktor Pro NML collection to disk and optionally reveals in OS file explorer.
   */
  exportTraktorNml(options: ExportCrateOptions): ExportCrateResult {
    const {
      playlistName,
      tracks,
      downloadDir,
      reveal = false,
      fileName = "collection.nml",
    } = options;

    mkdirSync(downloadDir, { recursive: true });
    const safeFileName = sanitizeExportFileName(
      fileName,
      "collection.nml",
      ".nml",
    );
    const filePath = join(downloadDir, safeFileName);
    if (!isPathWithinDirectory(filePath, downloadDir)) {
      throw new Error("Invalid export file path");
    }
    const content = this.generateTraktorNml({
      playlistName,
      tracks,
      downloadDir,
    });

    writeFileSync(filePath, content, "utf-8");
    log.info(`[CrateExportService] Exported Traktor NML to: ${filePath}`);

    const isTest =
      process.env.NODE_ENV === "test" ||
      Boolean(process.env.PLAYWRIGHT_TEST) ||
      Boolean(process.env.TEST_USER_DATA_DIR);

    if (reveal && !isTest) {
      try {
        if (existsSync(filePath)) {
          shell.showItemInFolder(filePath);
        }
      } catch (err) {
        log.warn(
          `[CrateExportService] Failed to reveal Traktor NML in folder: ${filePath}`,
          err,
        );
      }
    }

    return {
      filePath,
      success: true,
      trackCount: tracks.length,
    };
  }
}
