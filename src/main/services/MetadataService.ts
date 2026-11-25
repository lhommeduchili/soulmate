import { join, dirname, extname, basename } from "path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  copyFileSync,
} from "fs";
import NodeID3 from "node-id3";
import { Track } from "../../shared/types";
import { AppError } from "../utils/AppError";
import log from "../utils/logger";
import { isSafeRemoteUrl } from "../utils/security";

export interface ReplayGainValues {
  trackGain: string;
  trackPeak: string;
  albumGain?: string;
}

export interface AudioMetadata {
  title: string;
  artist: string;
  album: string;
  trackNumber?: string | number;
  year?: string | number;
  coverImageBuffer?: Buffer;
  coverMimeType?: string;
  replayGain?: ReplayGainValues;
}

export interface OrganizeAndTagResult {
  targetPath: string;
  tagged: boolean;
}

const RESERVED_WINDOWS_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * Sanitizes a path segment (artist, album, filename) by eliminating filesystem-forbidden
 * characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) and control characters,
 * while preserving international and Unicode characters across macOS, Windows, and Linux.
 */
export function sanitizeFilename(name: string): string {
  if (!name || typeof name !== "string") return "Unknown";

  let sanitized = name
    .replace(/[/\\]/g, "-") // Convert slashes to dashes
    .replace(/:/g, " - ") // Convert colons to spaced dashes
    .replace(/[*?"<>|]/g, "") // Strip wildcards, quotes, pipes, angles
    .replace(/[\x00-\x1f\x7f-\x9f]/g, "") // Strip control characters
    .replace(/\s+/g, " ") // Normalize multiple spaces
    .replace(/-{2,}/g, "-") // Collapse consecutive dashes
    .trim();

  // Remove leading and trailing dashes, dots, and spaces
  sanitized = sanitized.replace(/^[-_\s.]+|[-_\s.]+$/g, "").trim();

  if (!sanitized) return "Unknown";

  // Neutralize Windows reserved device names (e.g. CON, AUX, NUL)
  const reservedMatch = sanitized.match(RESERVED_WINDOWS_NAMES);
  if (reservedMatch) {
    const baseName = reservedMatch[1];
    const ext = reservedMatch[2] || "";
    sanitized = `_${baseName.toUpperCase()}_${ext}`;
  }

  return sanitized;
}

/**
 * Builds standard DJ directory and file path hierarchy:
 * If album is specified and not "Unknown":
 *   <DownloadDir>/<Artist>/<Album>/<TrackNumber> - <Title>.<ext>
 * Otherwise:
 *   <DownloadDir>/<Artist>/<Artist> - <Title>.<ext>
 */
export function buildTargetFilePath(options: {
  downloadDir: string;
  track: Track;
  extension: string;
  trackNumber?: number | string;
  year?: number | string;
}): string {
  const { downloadDir, track } = options;
  const ext = options.extension.replace(/^\./, "").toLowerCase();

  const primaryArtist =
    track.artists && track.artists.length > 0
      ? track.artists.map((a) => a.name).join(", ")
      : "Unknown Artist";

  const sanitizedArtist = sanitizeFilename(primaryArtist);
  const sanitizedTitle = sanitizeFilename(track.name || "Unknown Track");
  const albumName = track.album?.name?.trim();
  const hasValidAlbum =
    albumName && albumName.toLowerCase() !== "unknown" && albumName.length > 0;

  const trackNum = options.trackNumber ?? track.track_number;
  const trackNumPrefix =
    trackNum !== undefined && trackNum !== null && trackNum !== ""
      ? `${String(trackNum).padStart(2, "0")} - `
      : "";

  if (hasValidAlbum) {
    const sanitizedAlbum = sanitizeFilename(albumName);
    const fileName = `${trackNumPrefix}${sanitizedTitle}.${ext}`;
    return join(downloadDir, sanitizedArtist, sanitizedAlbum, fileName);
  }

  // Without album, build <DownloadDir>/<Artist>/<Artist> - <Title>.<ext>
  const fileName = `${sanitizedArtist} - ${sanitizedTitle}.${ext}`;
  return join(downloadDir, sanitizedArtist, fileName);
}

/**
 * Calculates non-destructive ReplayGain 2.0 / EBU R128 loudness adjustment and peak amplitude.
 * Target loudness reference: -18.00 LUFS.
 */
export function calculateReplayGain(
  buffer: Buffer,
  format: "FLAC" | "MP3" = "FLAC",
): ReplayGainValues {
  let offset = 0;
  if (format === "FLAC") {
    // Skip 'fLaC' and metadata blocks to find audio frames
    if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "fLaC") {
      offset = 4;
      let isLast = false;
      while (offset + 4 <= buffer.length && !isLast) {
        const h0 = buffer.readUInt8(offset);
        isLast = (h0 & 0x80) !== 0;
        const len =
          (buffer.readUInt8(offset + 1) << 16) |
          (buffer.readUInt8(offset + 2) << 8) |
          buffer.readUInt8(offset + 3);
        offset += 4 + len;
      }
    }
  } else if (format === "MP3") {
    // Skip ID3v2 header
    if (buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "ID3") {
      const s0 = buffer.readUInt8(6) & 0x7f;
      const s1 = buffer.readUInt8(7) & 0x7f;
      const s2 = buffer.readUInt8(8) & 0x7f;
      const s3 = buffer.readUInt8(9) & 0x7f;
      const tagLen = (s0 << 21) | (s1 << 14) | (s2 << 7) | s3;
      offset = 10 + tagLen;
    }
  }

  // Sample audio samples to compute peak and RMS
  let peak = 0;
  let sumSq = 0;
  let count = 0;
  const sampleLimit = Math.min(buffer.length - 2, offset + 65536);
  const start = Math.min(offset, buffer.length - 2);

  for (let i = start; i <= sampleLimit; i += 2) {
    const s = buffer.readInt16LE(i);
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
    const norm = s / 32768.0;
    sumSq += norm * norm;
    count++;
  }

  const normalizedPeak =
    count > 0 ? Math.min(1.0, Math.max(0.000001, peak / 32768.0)) : 0.985;
  const rms = count > 0 ? Math.sqrt(sumSq / count) : 0.1;
  const loudness = 20 * Math.log10(rms + 1e-9);
  // ReplayGain 2.0 / EBU R128 target is -18.00 LUFS
  const gain = -18.0 - loudness;
  const sign = gain >= 0 ? "+" : "";
  const trackGain = `${sign}${gain.toFixed(2)} dB`;
  const trackPeak = normalizedPeak.toFixed(6);

  return {
    trackGain,
    trackPeak,
    albumGain: trackGain,
  };
}

/**
 * Pure FLAC Vorbis comment and METADATA_BLOCK_PICTURE byte injector.
 * Rewrites FLAC metadata blocks while preserving original audio frames bit-for-bit.
 */
export function tagFlacBuffer(
  flacBuffer: Buffer,
  metadata: AudioMetadata,
): Buffer {
  if (flacBuffer.length < 4 || flacBuffer.toString("ascii", 0, 4) !== "fLaC") {
    throw new Error("Invalid FLAC stream: missing 'fLaC' magic header");
  }

  let offset = 4;
  let isLast = false;
  const blocks: { type: number; data: Buffer }[] = [];

  while (offset < flacBuffer.length && !isLast) {
    if (offset + 4 > flacBuffer.length) {
      throw new Error("Corrupted FLAC: incomplete metadata block header");
    }
    const headerByte0 = flacBuffer.readUInt8(offset);
    isLast = (headerByte0 & 0x80) !== 0;
    const blockType = headerByte0 & 0x7f;
    const blockLength =
      (flacBuffer.readUInt8(offset + 1) << 16) |
      (flacBuffer.readUInt8(offset + 2) << 8) |
      flacBuffer.readUInt8(offset + 3);

    offset += 4;
    if (offset + blockLength > flacBuffer.length) {
      throw new Error("Corrupted FLAC: block length exceeds file boundary");
    }

    const blockData = flacBuffer.subarray(offset, offset + blockLength);
    offset += blockLength;

    // Retain all non-VORBIS_COMMENT (4) and non-PICTURE (6) blocks
    if (blockType !== 4 && blockType !== 6) {
      blocks.push({ type: blockType, data: Buffer.from(blockData) });
    }
  }

  const audioFrames = flacBuffer.subarray(offset);

  // Construct Vorbis comment block (type 4)
  const vendor = "Soulmate Audio Engine";
  const vendorBuf = Buffer.from(vendor, "utf8");

  const comments: string[] = [
    `TITLE=${metadata.title}`,
    `ARTIST=${metadata.artist}`,
    `ALBUM=${metadata.album}`,
  ];
  if (metadata.trackNumber !== undefined && metadata.trackNumber !== null) {
    comments.push(`TRACKNUMBER=${metadata.trackNumber}`);
  }
  if (metadata.year !== undefined && metadata.year !== null) {
    comments.push(`DATE=${metadata.year}`);
  }
  if (metadata.replayGain) {
    comments.push(`REPLAYGAIN_TRACK_GAIN=${metadata.replayGain.trackGain}`);
    comments.push(`REPLAYGAIN_TRACK_PEAK=${metadata.replayGain.trackPeak}`);
    if (metadata.replayGain.albumGain) {
      comments.push(`REPLAYGAIN_ALBUM_GAIN=${metadata.replayGain.albumGain}`);
    }
  }

  const commentBuffers = comments.map((c) => Buffer.from(c, "utf8"));
  let vorbisSize = 4 + vendorBuf.length + 4;
  for (const cb of commentBuffers) {
    vorbisSize += 4 + cb.length;
  }

  const vorbisData = Buffer.alloc(vorbisSize);
  let vOffset = 0;
  vorbisData.writeUInt32LE(vendorBuf.length, vOffset);
  vOffset += 4;
  vendorBuf.copy(vorbisData, vOffset);
  vOffset += vendorBuf.length;

  vorbisData.writeUInt32LE(commentBuffers.length, vOffset);
  vOffset += 4;

  for (const cb of commentBuffers) {
    vorbisData.writeUInt32LE(cb.length, vOffset);
    vOffset += 4;
    cb.copy(vorbisData, vOffset);
    vOffset += cb.length;
  }

  blocks.push({ type: 4, data: vorbisData });

  // Construct METADATA_BLOCK_PICTURE block (type 6) if cover image provided
  if (metadata.coverImageBuffer && metadata.coverImageBuffer.length > 0) {
    const mime = metadata.coverMimeType || "image/jpeg";
    const mimeBuf = Buffer.from(mime, "ascii");
    const descBuf = Buffer.alloc(0);
    const picData = metadata.coverImageBuffer;

    const picBlockSize =
      4 + // picture type (3 = front cover)
      4 +
      mimeBuf.length +
      4 +
      descBuf.length +
      4 + // width
      4 + // height
      4 + // color depth
      4 + // indexed color count
      4 +
      picData.length;

    const picBlock = Buffer.alloc(picBlockSize);
    let pOffset = 0;
    picBlock.writeUInt32BE(3, pOffset); // Cover (front)
    pOffset += 4;

    picBlock.writeUInt32BE(mimeBuf.length, pOffset);
    pOffset += 4;
    mimeBuf.copy(picBlock, pOffset);
    pOffset += mimeBuf.length;

    picBlock.writeUInt32BE(descBuf.length, pOffset);
    pOffset += 4;

    picBlock.writeUInt32BE(0, pOffset); // width (unspecified)
    pOffset += 4;
    picBlock.writeUInt32BE(0, pOffset); // height
    pOffset += 4;
    picBlock.writeUInt32BE(24, pOffset); // color depth
    pOffset += 4;
    picBlock.writeUInt32BE(0, pOffset); // indexed colors
    pOffset += 4;

    picBlock.writeUInt32BE(picData.length, pOffset);
    pOffset += 4;
    picData.copy(picBlock, pOffset);
    pOffset += picData.length;

    blocks.push({ type: 6, data: picBlock });
  }

  // Calculate new total size
  let totalHeaderSize = 4; // 'fLaC'
  for (const b of blocks) {
    totalHeaderSize += 4 + b.data.length;
  }

  const result = Buffer.alloc(totalHeaderSize + audioFrames.length);
  result.write("fLaC", 0, 4, "ascii");
  let outOffset = 4;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const isBlockLast = i === blocks.length - 1;
    const headerByte0 = (isBlockLast ? 0x80 : 0x00) | (b.type & 0x7f);
    result.writeUInt8(headerByte0, outOffset);
    result.writeUInt8((b.data.length >> 16) & 0xff, outOffset + 1);
    result.writeUInt8((b.data.length >> 8) & 0xff, outOffset + 2);
    result.writeUInt8(b.data.length & 0xff, outOffset + 3);
    outOffset += 4;
    b.data.copy(result, outOffset);
    outOffset += b.data.length;
  }

  audioFrames.copy(result, outOffset);
  return result;
}

/**
 * Reads FLAC Vorbis comments and embedded Picture metadata from a FLAC buffer.
 */
export function readFlacTags(flacBuffer: Buffer): {
  comments: Record<string, string>;
  hasPicture: boolean;
  pictureMime?: string;
} {
  if (flacBuffer.length < 4 || flacBuffer.toString("ascii", 0, 4) !== "fLaC") {
    throw new Error("Invalid FLAC stream");
  }

  let offset = 4;
  let isLast = false;
  const comments: Record<string, string> = {};
  let hasPicture = false;
  let pictureMime: string | undefined;

  while (offset < flacBuffer.length && !isLast) {
    const headerByte0 = flacBuffer.readUInt8(offset);
    isLast = (headerByte0 & 0x80) !== 0;
    const blockType = headerByte0 & 0x7f;
    const blockLength =
      (flacBuffer.readUInt8(offset + 1) << 16) |
      (flacBuffer.readUInt8(offset + 2) << 8) |
      flacBuffer.readUInt8(offset + 3);

    offset += 4;
    const blockData = flacBuffer.subarray(offset, offset + blockLength);
    offset += blockLength;

    if (blockType === 4) {
      // VORBIS_COMMENT
      const vendorLen = blockData.readUInt32LE(0);
      let vCursor = 4 + vendorLen;
      const commentCount = blockData.readUInt32LE(vCursor);
      vCursor += 4;
      for (let i = 0; i < commentCount; i++) {
        const cLen = blockData.readUInt32LE(vCursor);
        vCursor += 4;
        const commentStr = blockData.toString("utf8", vCursor, vCursor + cLen);
        vCursor += cLen;
        const eqIdx = commentStr.indexOf("=");
        if (eqIdx !== -1) {
          const key = commentStr.slice(0, eqIdx).toUpperCase();
          const val = commentStr.slice(eqIdx + 1);
          comments[key] = val;
        }
      }
    } else if (blockType === 6) {
      // PICTURE
      hasPicture = true;
      const mimeLen = blockData.readUInt32BE(4);
      pictureMime = blockData.toString("ascii", 8, 8 + mimeLen);
    }
  }

  return { comments, hasPicture, pictureMime };
}

export class MetadataService {
  /**
   * Fetches high-resolution album art from URL with timeout protection.
   * Returns null gracefully if request fails or times out.
   */
  async fetchAlbumArt(
    imageUrl: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    if (!imageUrl || typeof imageUrl !== "string") return null;
    if (!isSafeRemoteUrl(imageUrl)) {
      log.warn(`[MetadataService] Blocked unsafe album art URL: ${imageUrl}`);
      return null;
    }

    const MAX_ALBUM_ART_BYTES = 10 * 1024 * 1024; // 10 MB cap

    try {
      const res = await fetch(imageUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        log.warn(
          `[MetadataService] Album art HTTP ${res.status} for ${imageUrl}`,
        );
        return null;
      }

      const contentType = res.headers.get("content-type") || "image/jpeg";
      const mimeType = contentType.split(";")[0].trim().toLowerCase();
      if (!mimeType.startsWith("image/")) {
        log.warn(
          `[MetadataService] Rejected non-image album art MIME type: ${mimeType}`,
        );
        return null;
      }

      const contentLength = Number(res.headers.get("content-length") || 0);
      if (contentLength > MAX_ALBUM_ART_BYTES) {
        log.warn(
          `[MetadataService] Album art exceeds size limit (${contentLength} bytes)`,
        );
        return null;
      }

      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > MAX_ALBUM_ART_BYTES) {
        log.warn("[MetadataService] Album art payload exceeded size cap");
        return null;
      }

      return {
        buffer: Buffer.from(arrayBuf),
        mimeType,
      };
    } catch (err) {
      log.warn(
        `[MetadataService] Failed to fetch album art from ${imageUrl}:`,
        err,
      );
      return null;
    }
  }

  /**
   * Tags an audio file on disk with metadata and embedded album art.
   * Supports FLAC (Vorbis comments & METADATA_BLOCK_PICTURE) and MP3 (ID3v2.3/ID3v2.4).
   * Graceful degradation: never corrupts audio file on error.
   */
  async tagFile(
    filePath: string,
    metadata: AudioMetadata,
    options?: { enableReplayGain?: boolean },
  ): Promise<boolean> {
    if (!existsSync(filePath)) {
      log.error(`[MetadataService] File not found for tagging: ${filePath}`);
      return false;
    }

    const ext = extname(filePath).toLowerCase();

    try {
      const enableReplayGain = options?.enableReplayGain ?? true;
      if (enableReplayGain && !metadata.replayGain) {
        try {
          const rawBytes = readFileSync(filePath);
          metadata.replayGain = calculateReplayGain(
            rawBytes,
            ext === ".flac" ? "FLAC" : "MP3",
          );
        } catch {}
      }

      if (ext === ".flac") {
        const originalBytes = readFileSync(filePath);
        const taggedBytes = tagFlacBuffer(originalBytes, metadata);
        const tmpPath = `${filePath}.tmp.${Date.now()}`;
        writeFileSync(tmpPath, taggedBytes);
        renameSync(tmpPath, filePath);
        log.info(
          `[MetadataService] Successfully tagged FLAC: ${basename(filePath)}`,
        );
        return true;
      }

      if (ext === ".mp3") {
        const tags: NodeID3.Tags = {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          trackNumber: metadata.trackNumber
            ? String(metadata.trackNumber)
            : undefined,
          year: metadata.year ? String(metadata.year) : undefined,
        };

        if (enableReplayGain && metadata.replayGain) {
          tags.userDefinedText = [
            {
              description: "REPLAYGAIN_TRACK_GAIN",
              value: metadata.replayGain.trackGain,
            },
            {
              description: "REPLAYGAIN_TRACK_PEAK",
              value: metadata.replayGain.trackPeak,
            },
          ];
        }

        if (metadata.coverImageBuffer && metadata.coverImageBuffer.length > 0) {
          tags.image = {
            mime: metadata.coverMimeType || "image/jpeg",
            type: { id: 3, name: "front cover" },
            description: "Album Art",
            imageBuffer: metadata.coverImageBuffer,
          };
        }

        const success = NodeID3.write(tags, filePath);
        if (success) {
          log.info(
            `[MetadataService] Successfully tagged MP3 with ID3v2: ${basename(filePath)}`,
          );
          return true;
        } else {
          log.warn(
            `[MetadataService] NodeID3 returned false for: ${basename(filePath)}`,
          );
          return false;
        }
      }

      // Other formats (e.g. .wav, .aiff) - leave audio stream untouched
      log.info(
        `[MetadataService] Non-taggable audio format (${ext}), skipping tag injection`,
      );
      return true;
    } catch (err) {
      log.error(
        `[MetadataService] Tagging failed for ${basename(filePath)} (audio preserved):`,
        new AppError(
          "STORAGE_IO_ERROR",
          `Metadata injection failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return false;
    }
  }

  /**
   * Complete Post-Download DJ Organization and Metadata Enrichment Pipeline:
   * 1. Resolves target path inside user's download directory using standard DJ hierarchy.
   * 2. Atomically moves / renames download file into target path.
   * 3. Fetches album art from URL (if available).
   * 4. Enriches file with ID3v2 or Vorbis comment metadata and embedded album art.
   */
  async organizeAndTag(
    sourcePath: string,
    track: Track,
    downloadDir: string,
    options?: {
      albumArtUrl?: string;
      trackNumber?: number | string;
      year?: number | string;
      enableReplayGain?: boolean;
    },
  ): Promise<OrganizeAndTagResult> {
    if (!existsSync(sourcePath)) {
      throw new AppError(
        "STORAGE_IO_ERROR",
        `Source audio file not found on disk: ${sourcePath}`,
      );
    }

    const extension = extname(sourcePath);
    const targetPath = buildTargetFilePath({
      downloadDir,
      track,
      extension,
      trackNumber: options?.trackNumber ?? track.track_number,
      year: options?.year ?? track.year,
    });

    const targetDirectory = dirname(targetPath);
    if (!existsSync(targetDirectory)) {
      mkdirSync(targetDirectory, { recursive: true });
    }

    // Atomic move / copy to avoid partial-read conflicts in DJ software
    if (sourcePath !== targetPath) {
      const tempPath = `${targetPath}.tmp.${Date.now()}`;
      try {
        // Try atomic rename first
        renameSync(sourcePath, targetPath);
      } catch (_err: unknown) {
        // Fallback across different filesystems / mounts (EXDEV)
        try {
          copyFileSync(sourcePath, tempPath);
          renameSync(tempPath, targetPath);
          try {
            unlinkSync(sourcePath);
          } catch {
            // Ignore failure to remove source
          }
        } catch (copyErr) {
          if (existsSync(tempPath)) {
            try {
              unlinkSync(tempPath);
            } catch {}
          }
          throw new AppError(
            "STORAGE_IO_ERROR",
            `Failed to move audio file to DJ directory: ${copyErr instanceof Error ? copyErr.message : String(copyErr)}`,
          );
        }
      }
    }

    // Fetch album art if available
    const coverUrl =
      options?.albumArtUrl || track.image || track.album?.images?.[0]?.url;

    let coverData: { buffer: Buffer; mimeType: string } | null = null;
    if (coverUrl) {
      coverData = await this.fetchAlbumArt(coverUrl);
    }

    const artistName =
      track.artists && track.artists.length > 0
        ? track.artists.map((a) => a.name).join(", ")
        : "Unknown Artist";

    const metadata: AudioMetadata = {
      title: track.name,
      artist: artistName,
      album: track.album?.name || "Unknown",
      trackNumber: options?.trackNumber ?? track.track_number,
      year: options?.year ?? track.year,
      coverImageBuffer: coverData?.buffer,
      coverMimeType: coverData?.mimeType,
    };

    const tagged = await this.tagFile(targetPath, metadata, {
      enableReplayGain: options?.enableReplayGain,
    });

    return {
      targetPath,
      tagged,
    };
  }
}
