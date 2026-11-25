import { existsSync, openSync, readSync, closeSync } from "fs";
import log from "../utils/logger";

import NodeID3 from "node-id3";
import { readFlacTags } from "./MetadataService";

export interface AudioFormatInfo {
  format: "FLAC" | "MP3";
  sampleRate: number;
  bitDepth?: number;
  bitrate?: number;
  channels?: number;
  isVbr?: boolean;
  bpm?: number;
  camelotKey?: string;
  integrity?: "genuine" | "suspect_transcode" | "unverified";
  cutoffFrequency?: number;
}

const CAMELOT_MINOR_MAP: Record<string, string> = {
  ABM: "1A",
  "G#M": "1A",
  EBM: "2A",
  "D#M": "2A",
  BBM: "3A",
  "A#M": "3A",
  FM: "4A",
  CM: "5A",
  GM: "6A",
  DM: "7A",
  AM: "8A",
  EM: "9A",
  BM: "10A",
  "F#M": "11A",
  GBM: "11A",
  "C#M": "12A",
  DBM: "12A",
};

const CAMELOT_MAJOR_MAP: Record<string, string> = {
  B: "1B",
  CB: "1B",
  "F#": "2B",
  GB: "2B",
  "C#": "3B",
  DB: "3B",
  AB: "4B",
  "G#": "4B",
  EB: "5B",
  "D#": "5B",
  BB: "6B",
  "A#": "6B",
  F: "7B",
  C: "8B",
  G: "9B",
  D: "10B",
  A: "11B",
  E: "12B",
};

/**
 * Converts standard musical keys or existing notation into standardized Camelot wheel format (e.g. 8A, 12B).
 */
export function toCamelotKey(input?: string | null): string | undefined {
  if (!input || typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // 1. Direct Camelot notation check (e.g. "8A", "08A", "12B", "8a")
  const camelotMatch = trimmed.match(/\b0?([1-9]|1[0-2])([abAB])\b/);
  if (camelotMatch) {
    return `${parseInt(camelotMatch[1], 10)}${camelotMatch[2].toUpperCase()}`;
  }

  // 2. Open Key notation check (e.g. "8d" -> "8B", "8m" -> "8A")
  const openKeyMatch = trimmed.match(/\b0?([1-9]|1[0-2])([dmDM])\b/);
  if (openKeyMatch) {
    const num = parseInt(openKeyMatch[1], 10);
    const letter = openKeyMatch[2].toUpperCase() === "M" ? "A" : "B";
    return `${num}${letter}`;
  }

  // 3. Musical Root + Mode parser (e.g. "Am", "C#m", "G Major", "Eb Minor", "A minor")
  const rootMatch = trimmed.match(/^([A-Ga-g][#b]?)(.*)$/);
  if (!rootMatch) return undefined;

  const rawRoot = rootMatch[1];
  const root =
    rawRoot[0].toUpperCase() + (rawRoot.length > 1 ? rawRoot[1] : "");
  const rest = rootMatch[2].trim().toLowerCase();

  const isMinor =
    rest === "m" ||
    rest.startsWith("min") ||
    rest.startsWith("minor") ||
    rest.startsWith("m ") ||
    rest.startsWith("m/") ||
    rest.startsWith("m-") ||
    trimmed.toLowerCase().includes("minor");

  if (isMinor) {
    const key = `${root.toUpperCase()}M`;
    return CAMELOT_MINOR_MAP[key];
  } else {
    const key = root.toUpperCase();
    return CAMELOT_MAJOR_MAP[key];
  }
}

/**
 * Parses and normalizes BPM string or numeric tag values.
 */
export function parseBpm(input?: string | number | null): number | undefined {
  if (input === undefined || input === null) return undefined;

  let val: number;
  if (typeof input === "number") {
    val = input;
  } else if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    const match = trimmed.replace(/,/g, ".").match(/\b(\d+(?:\.\d+)?)\b/);
    if (!match) return undefined;
    val = parseFloat(match[1]);
  } else {
    return undefined;
  }

  if (isNaN(val) || val < 30 || val > 300) {
    return undefined;
  }

  // Round to at most 1 decimal place if decimal, or integer if whole
  return Math.round(val * 10) / 10;
}

const MPEG1_LAYER3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];

const MPEG2_LAYER3_BITRATES = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];

const MPEG1_SAMPLE_RATES = [44100, 48000, 32000, 0];
const MPEG2_SAMPLE_RATES = [22050, 24000, 16000, 0];
const MPEG25_SAMPLE_RATES = [11025, 12000, 8000, 0];

/**
 * Inspects a buffer containing FLAC stream data.
 * Reads the STREAMINFO metadata block (block type 0).
 */
export function inspectFlacHeader(buffer: Buffer): AudioFormatInfo | null {
  if (buffer.length < 42 || buffer.toString("ascii", 0, 4) !== "fLaC") {
    return null;
  }

  let offset = 4;
  let isLast = false;

  while (offset + 4 <= buffer.length && !isLast) {
    const headerByte0 = buffer.readUInt8(offset);
    isLast = (headerByte0 & 0x80) !== 0;
    const blockType = headerByte0 & 0x7f;
    const blockLength =
      (buffer.readUInt8(offset + 1) << 16) |
      (buffer.readUInt8(offset + 2) << 8) |
      buffer.readUInt8(offset + 3);

    offset += 4;
    if (offset + blockLength > buffer.length && blockType !== 0) {
      break;
    }

    if (blockType === 0) {
      // STREAMINFO block (minimum 34 bytes)
      if (blockLength < 34 || offset + 34 > buffer.length) {
        return null;
      }

      // Stream info offsets relative to block data start:
      // Byte 10..12: sample rate (20 bits)
      // Byte 12 bits 3..1: channels (3 bits, value + 1)
      // Byte 12 bit 0 + Byte 13 bits 7..4: bits per sample (5 bits, value + 1)
      const b10 = buffer.readUInt8(offset + 10);
      const b11 = buffer.readUInt8(offset + 11);
      const b12 = buffer.readUInt8(offset + 12);
      const b13 = buffer.readUInt8(offset + 13);

      const sampleRate = (b10 << 12) | (b11 << 4) | (b12 >> 4);
      const channels = ((b12 >> 1) & 0x07) + 1;
      const bitDepth = (((b12 & 0x01) << 4) | (b13 >> 4)) + 1;

      return {
        format: "FLAC",
        sampleRate,
        bitDepth,
        channels,
      };
    }

    offset += blockLength;
  }

  return null;
}

/**
 * Inspects a buffer containing MP3 stream data.
 * Skips ID3v2 container headers and inspects MPEG audio frame header + Xing/Info VBR tags.
 */
export function inspectMp3Header(buffer: Buffer): AudioFormatInfo | null {
  if (buffer.length < 4) return null;

  let offset = 0;

  // Skip ID3v2 tag if present
  if (buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "ID3") {
    const flags = buffer.readUInt8(5);
    const s0 = buffer.readUInt8(6) & 0x7f;
    const s1 = buffer.readUInt8(7) & 0x7f;
    const s2 = buffer.readUInt8(8) & 0x7f;
    const s3 = buffer.readUInt8(9) & 0x7f;
    const tagLength = (s0 << 21) | (s1 << 14) | (s2 << 7) | s3;
    const hasFooter = (flags & 0x10) !== 0;
    offset = 10 + tagLength + (hasFooter ? 10 : 0);
  }

  // Search for MPEG frame sync
  const searchLimit = Math.min(buffer.length - 4, offset + 32768);
  for (let i = offset; i <= searchLimit; i++) {
    const b0 = buffer.readUInt8(i);
    const b1 = buffer.readUInt8(i + 1);

    if (b0 === 0xff && (b1 & 0xe0) === 0xe0) {
      const versionBits = (b1 >> 3) & 0x03;
      const layerBits = (b1 >> 1) & 0x03;

      if (versionBits === 0x01 || layerBits === 0x00) {
        // Reserved version or layer
        continue;
      }

      const b2 = buffer.readUInt8(i + 2);
      const b3 = buffer.readUInt8(i + 3);

      const bitrateIndex = (b2 >> 4) & 0x0f;
      const sampleRateIndex = (b2 >> 2) & 0x03;
      const channelMode = (b3 >> 6) & 0x03;

      if (bitrateIndex === 0x0f || sampleRateIndex === 0x03) {
        continue; // Invalid index
      }

      const isMpeg1 = versionBits === 3;
      const isMpeg2 = versionBits === 2;
      const isMpeg25 = versionBits === 0;

      let bitrate = 0;
      if (layerBits === 1) {
        // Layer III
        bitrate = isMpeg1
          ? MPEG1_LAYER3_BITRATES[bitrateIndex] || 0
          : MPEG2_LAYER3_BITRATES[bitrateIndex] || 0;
      } else {
        // Fallback for Layer I/II if encountered
        bitrate = isMpeg1
          ? MPEG1_LAYER3_BITRATES[bitrateIndex] || 0
          : MPEG2_LAYER3_BITRATES[bitrateIndex] || 0;
      }

      let sampleRate = 0;
      if (isMpeg1) sampleRate = MPEG1_SAMPLE_RATES[sampleRateIndex] || 0;
      else if (isMpeg2) sampleRate = MPEG2_SAMPLE_RATES[sampleRateIndex] || 0;
      else if (isMpeg25) sampleRate = MPEG25_SAMPLE_RATES[sampleRateIndex] || 0;

      const channels = channelMode === 3 ? 1 : 2;

      // Check for Xing / Info / VBRI VBR headers
      let xingOffset = 0;
      if (isMpeg1) {
        xingOffset = channels === 1 ? i + 4 + 17 : i + 4 + 32;
      } else {
        xingOffset = channels === 1 ? i + 4 + 9 : i + 4 + 17;
      }

      let isVbr = false;
      if (xingOffset + 4 <= buffer.length) {
        const tag = buffer.toString("ascii", xingOffset, xingOffset + 4);
        if (tag === "Xing") {
          isVbr = true;
          // Calculate average bitrate if frames and bytes flags present
          if (xingOffset + 16 <= buffer.length) {
            const xingFlags = buffer.readUInt32BE(xingOffset + 4);
            const hasFrames = (xingFlags & 0x01) !== 0;
            const hasBytes = (xingFlags & 0x02) !== 0;
            if (hasFrames && hasBytes && sampleRate > 0) {
              const frames = buffer.readUInt32BE(xingOffset + 8);
              const bytes = buffer.readUInt32BE(xingOffset + 12);
              const samplesPerFrame = isMpeg1 ? 1152 : 576;
              const durationSec = (frames * samplesPerFrame) / sampleRate;
              if (durationSec > 0) {
                bitrate = Math.round((bytes * 8) / durationSec / 1000);
              }
            }
          }
        } else if (tag === "Info") {
          isVbr = false; // LAME CBR
        }
      }

      // Check VBRI (Fraunhofer) at frame start + 36
      if (!isVbr && i + 36 + 4 <= buffer.length) {
        if (buffer.toString("ascii", i + 36, i + 36 + 4) === "VBRI") {
          isVbr = true;
        }
      }

      if (sampleRate > 0 && bitrate > 0) {
        return {
          format: "MP3",
          sampleRate,
          bitrate,
          channels,
          isVbr,
        };
      }
    }
  }

  return null;
}

/**
 * Universal inspection for an in-memory buffer.
 */
export function inspectAudioBuffer(
  buffer: Buffer,
  hintExtension?: string,
): AudioFormatInfo | null {
  if (hintExtension) {
    const ext = hintExtension.toLowerCase().replace(/^\./, "");
    if (ext === "flac") {
      const flac = inspectFlacHeader(buffer);
      if (flac) return flac;
    } else if (ext === "mp3") {
      const mp3 = inspectMp3Header(buffer);
      if (mp3) return mp3;
    }
  }

  // Auto-detect based on stream header
  const info = inspectFlacHeader(buffer) || inspectMp3Header(buffer);
  if (!info) return null;

  try {
    if (info.format === "FLAC") {
      const { comments } = readFlacTags(buffer);
      const rawKey =
        comments["INITIALKEY"] || comments["KEY"] || comments["TKEY"];
      const rawBpm = comments["BPM"] || comments["TBPM"];
      const camelotKey = toCamelotKey(rawKey);
      const bpm = parseBpm(rawBpm);
      if (camelotKey) info.camelotKey = camelotKey;
      if (bpm) info.bpm = bpm;
    } else if (info.format === "MP3") {
      const tags = NodeID3.read(buffer);
      if (tags) {
        const raw = tags.raw as Record<string, string> | undefined;
        const rawKey = tags.initialKey || raw?.TKEY;
        const rawBpm = tags.bpm || raw?.TBPM;
        const camelotKey = toCamelotKey(rawKey);
        const bpm = parseBpm(rawBpm);
        if (camelotKey) info.camelotKey = camelotKey;
        if (bpm) info.bpm = bpm;
      }
    }
  } catch {}

  return info;
}

/**
 * Inspects an audio file on disk, reading up to the first 64KB for stream headers.
 */
export async function inspectAudioFile(
  filePath: string,
): Promise<AudioFormatInfo | null> {
  if (!filePath || !existsSync(filePath)) {
    return null;
  }

  let fd: number | null = null;
  try {
    fd = openSync(filePath, "r");
    const buffer = Buffer.alloc(65536);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    closeSync(fd);
    fd = null;

    if (bytesRead === 0) return null;
    const slice = buffer.subarray(0, bytesRead);
    const info = inspectAudioBuffer(slice, filePath);
    if (!info) return null;

    // Further enrich from disk file if tags were not fully in the first 64KB
    if (!info.camelotKey || !info.bpm) {
      try {
        if (info.format === "MP3") {
          const tags = NodeID3.read(filePath);
          if (tags) {
            const raw = tags.raw as Record<string, string> | undefined;
            const rawKey = tags.initialKey || raw?.TKEY;
            const rawBpm = tags.bpm || raw?.TBPM;
            if (!info.camelotKey) {
              const camelotKey = toCamelotKey(rawKey);
              if (camelotKey) info.camelotKey = camelotKey;
            }
            if (!info.bpm) {
              const bpm = parseBpm(rawBpm);
              if (bpm) info.bpm = bpm;
            }
          }
        }
      } catch {}
    }

    return info;
  } catch (err) {
    log.debug(`[AudioInspection] Error reading header from ${filePath}:`, err);
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {}
    }
  }
}

/**
 * Detects the high-frequency cutoff frequency (in Hz) using windowed FFT spectral roll-off analysis.
 * Identifies sharp steep drops characteristic of lossy MP3 lowpass filters:
 * ~16 kHz for 128 kbps, ~19 kHz for 192 kbps, or full-spectrum 21-22 kHz+ for genuine lossless audio.
 */
export function detectFrequencyCutoff(
  samplesOrBuffer: Float32Array | Int16Array | number[] | Buffer,
  sampleRate: number = 44100,
): number {
  let normalizedSamples: Float32Array;

  if (Buffer.isBuffer(samplesOrBuffer)) {
    const numSamples = Math.floor(samplesOrBuffer.length / 2);
    if (numSamples < 1024) return 0;
    normalizedSamples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      normalizedSamples[i] = samplesOrBuffer.readInt16LE(i * 2) / 32768.0;
    }
  } else if (samplesOrBuffer instanceof Float32Array) {
    normalizedSamples = samplesOrBuffer;
  } else if (samplesOrBuffer instanceof Int16Array) {
    normalizedSamples = new Float32Array(samplesOrBuffer.length);
    for (let i = 0; i < samplesOrBuffer.length; i++) {
      normalizedSamples[i] = samplesOrBuffer[i] / 32768.0;
    }
  } else if (Array.isArray(samplesOrBuffer)) {
    normalizedSamples = new Float32Array(samplesOrBuffer);
  } else {
    return 0;
  }

  const n = 1024;
  if (normalizedSamples.length < n) return 0;

  const numWindows = Math.min(8, Math.floor(normalizedSamples.length / n));
  const avgMags = new Float32Array(n / 2);

  for (let w = 0; w < numWindows; w++) {
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    const start = w * n;

    // Apply Hann window
    for (let i = 0; i < n; i++) {
      const h = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
      real[i] = normalizedSamples[start + i] * h;
    }

    // Radix-2 Cooley-Tukey FFT
    for (let i = 0, j = 0; i < n; i++) {
      if (i < j) {
        const tr = real[i];
        real[i] = real[j];
        real[j] = tr;
        const ti = imag[i];
        imag[i] = imag[j];
        imag[j] = ti;
      }
      let bit = n >> 1;
      while (bit >= 1 && j & bit) {
        j ^= bit;
        bit >>= 1;
      }
      j ^= bit;
    }

    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const ang = (-2 * Math.PI) / len;
      const wstepR = Math.cos(ang);
      const wstepI = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let wr = 1;
        let wi = 0;
        for (let j = 0; j < half; j++) {
          const uR = real[i + j];
          const uI = imag[i + j];
          const vR = real[i + j + half] * wr - imag[i + j + half] * wi;
          const vI = real[i + j + half] * wi + imag[i + j + half] * wr;
          real[i + j] = uR + vR;
          imag[i + j] = uI + vI;
          real[i + j + half] = uR - vR;
          imag[i + j + half] = uI - vI;
          const nextWr = wr * wstepR - wi * wstepI;
          wi = wr * wstepI + wi * wstepR;
          wr = nextWr;
        }
      }
    }

    for (let k = 0; k < n / 2; k++) {
      avgMags[k] +=
        Math.sqrt(real[k] * real[k] + imag[k] * imag[k]) / numWindows;
    }
  }

  // Calculate baseline mid-band reference energy in 2kHz - 10kHz
  const binHz = sampleRate / n;
  const refStart = Math.floor(2000 / binHz);
  const refEnd = Math.floor(10000 / binHz);
  let refSum = 0;
  for (let k = refStart; k <= refEnd; k++) {
    refSum += avgMags[k];
  }
  const refAvg = refSum / (refEnd - refStart + 1);
  if (refAvg < 1e-4) return 0;

  // Threshold: -26 dB from average midband
  const threshold = refAvg * 0.05;

  // Find highest frequency bin exceeding threshold
  const nyquistBin = Math.floor(sampleRate / 2 / binHz) - 1;
  const minBin = Math.floor(10000 / binHz);
  let highestBin = minBin;

  for (let k = nyquistBin; k >= minBin; k--) {
    if (avgMags[k] >= threshold) {
      highestBin = k;
      break;
    }
  }

  const cutoffHz = Math.round((highestBin * binHz) / 500) * 500;
  return cutoffHz;
}

/**
 * Verifies audio integrity: detects genuine lossless files vs suspect upscaled fake transcode files.
 */
export function verifyAudioIntegrity(
  samplesOrBuffer: Float32Array | Int16Array | number[] | Buffer,
  format: "FLAC" | "MP3",
  sampleRate: number = 44100,
  bitrate?: number,
): {
  integrity: "genuine" | "suspect_transcode" | "unverified";
  cutoffFrequency: number;
} {
  const cutoff = detectFrequencyCutoff(samplesOrBuffer, sampleRate);
  if (cutoff === 0) {
    return { integrity: "unverified", cutoffFrequency: 0 };
  }

  if (format === "FLAC") {
    // Standard lossless audio >= 44.1kHz must preserve frequency content up to 20-22kHz.
    // Steep low-pass cuts at ~16kHz or ~19kHz indicate lossy MP3 padded into FLAC container.
    if (sampleRate >= 44100 && cutoff <= 19500) {
      return { integrity: "suspect_transcode", cutoffFrequency: cutoff };
    }
    return { integrity: "genuine", cutoffFrequency: cutoff };
  }

  if (format === "MP3") {
    // If MP3 is claimed to be 320kbps CBR but cuts off at <= 16.5kHz, it's an upscaled 128k transcode
    if (bitrate && bitrate >= 320 && cutoff <= 16500) {
      return { integrity: "suspect_transcode", cutoffFrequency: cutoff };
    }
    return { integrity: "genuine", cutoffFrequency: cutoff };
  }

  return { integrity: "genuine", cutoffFrequency: cutoff };
}
