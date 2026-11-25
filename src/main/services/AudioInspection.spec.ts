import { describe, it, expect } from "vitest";
import {
  inspectAudioBuffer,
  inspectFlacHeader,
  inspectMp3Header,
  toCamelotKey,
  parseBpm,
  detectFrequencyCutoff,
  verifyAudioIntegrity,
} from "./AudioInspection";

describe("AudioInspection (Unit)", () => {
  function createFlacStreamInfoBuffer(options: {
    sampleRate: number;
    bitDepth: number;
    channels: number;
  }): Buffer {
    // FLAC format:
    // 4 bytes: 'fLaC'
    // 4 bytes: METADATA_BLOCK_HEADER (type 0: STREAMINFO, length 34)
    // 34 bytes: STREAMINFO block data
    const buf = Buffer.alloc(4 + 4 + 34);
    buf.write("fLaC", 0, 4, "ascii");

    // Block header: byte 4 is 0x00 (not last, type 0 = STREAMINFO)
    // bytes 5..7: length 34 (0x000022)
    buf.writeUInt8(0x00, 4);
    buf.writeUInt8(0x00, 5);
    buf.writeUInt8(0x00, 6);
    buf.writeUInt8(0x22, 7);

    // STREAMINFO data starts at offset 8
    // bytes 8..9: min block size (e.g. 4096)
    buf.writeUInt16BE(4096, 8);
    // bytes 10..11: max block size (e.g. 4096)
    buf.writeUInt16BE(4096, 10);
    // bytes 12..14: min frame size (3 bytes)
    // bytes 15..17: max frame size (3 bytes)

    // bytes 18..25 (offset 8 + 10 to 8 + 17):
    // sample rate (20 bits), channels - 1 (3 bits), bit depth - 1 (5 bits), total samples (36 bits)
    const sr = options.sampleRate;
    const ch = options.channels - 1;
    const bd = options.bitDepth - 1;

    // byte 18: sr bits 19..12
    buf.writeUInt8((sr >> 12) & 0xff, 18);
    // byte 19: sr bits 11..4
    buf.writeUInt8((sr >> 4) & 0xff, 19);
    // byte 20: sr bits 3..0 (top 4), ch bits 2..0 (next 3), bd bit 4 (bit 0)
    const byte20 = ((sr & 0x0f) << 4) | ((ch & 0x07) << 1) | ((bd >> 4) & 0x01);
    buf.writeUInt8(byte20, 20);
    // byte 21: bd bits 3..0 (top 4), total samples bits 35..32 (bottom 4)
    const byte21 = (bd & 0x0f) << 4;
    buf.writeUInt8(byte21, 21);

    return buf;
  }

  describe("FLAC Header Inspection", () => {
    it("correctly identifies standard 16-bit / 44.1 kHz CD quality FLAC", () => {
      const buf = createFlacStreamInfoBuffer({
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
      });

      const info = inspectFlacHeader(buf);
      expect(info).not.toBeNull();
      expect(info?.format).toBe("FLAC");
      expect(info?.sampleRate).toBe(44100);
      expect(info?.bitDepth).toBe(16);
      expect(info?.channels).toBe(2);
    });

    it("correctly identifies audiophile 24-bit / 96 kHz high-resolution FLAC", () => {
      const buf = createFlacStreamInfoBuffer({
        sampleRate: 96000,
        bitDepth: 24,
        channels: 2,
      });

      const info = inspectFlacHeader(buf);
      expect(info).not.toBeNull();
      expect(info?.format).toBe("FLAC");
      expect(info?.sampleRate).toBe(96000);
      expect(info?.bitDepth).toBe(24);
      expect(info?.channels).toBe(2);
    });

    it("correctly identifies studio master 24-bit / 192 kHz FLAC", () => {
      const buf = createFlacStreamInfoBuffer({
        sampleRate: 192000,
        bitDepth: 24,
        channels: 2,
      });

      const info = inspectFlacHeader(buf);
      expect(info).not.toBeNull();
      expect(info?.format).toBe("FLAC");
      expect(info?.sampleRate).toBe(192000);
      expect(info?.bitDepth).toBe(24);
      expect(info?.channels).toBe(2);
    });

    it("returns null for non-FLAC or invalid header buffer", () => {
      const empty = Buffer.alloc(10);
      expect(inspectFlacHeader(empty)).toBeNull();

      const invalidMagic = Buffer.from("RIFF1234WAVE");
      expect(inspectFlacHeader(invalidMagic)).toBeNull();
    });
  });

  describe("MP3 Header Inspection", () => {
    function createMp3FrameBuffer(options: {
      bitrateKbps: number;
      sampleRate: number;
      channels: number;
      isVbr?: boolean;
    }): Buffer {
      // MPEG-1 Layer III frame header (4 bytes):
      // byte 0: 0xFF
      // byte 1: 0xFB (sync 111, MPEG 1 '11', Layer 3 '01', no CRC '1')
      // byte 2: bitrate index (4 bits), sample rate index (2 bits), padding (1 bit), private (1 bit)
      // byte 3: channel mode (2 bits: 00 = stereo, 11 = mono), mode ext (2 bits), copyright (1 bit), original (1 bit), emphasis (2 bits)
      const bitrateMap: Record<number, number> = {
        32: 1,
        40: 2,
        48: 3,
        56: 4,
        64: 5,
        80: 6,
        96: 7,
        112: 8,
        128: 9,
        160: 10,
        192: 11,
        224: 12,
        256: 13,
        320: 14,
      };

      const sampleRateMap: Record<number, number> = {
        44100: 0,
        48000: 1,
        32000: 2,
      };

      const brIndex = bitrateMap[options.bitrateKbps] || 14;
      const srIndex = sampleRateMap[options.sampleRate] ?? 0;
      const channelMode = options.channels === 1 ? 3 : 0;

      const buf = Buffer.alloc(200);
      buf.writeUInt8(0xff, 0);
      buf.writeUInt8(0xfb, 1);
      buf.writeUInt8((brIndex << 4) | (srIndex << 2), 2);
      buf.writeUInt8(channelMode << 6, 3);

      if (options.isVbr) {
        // In MPEG-1 stereo, Xing tag is placed at offset 4 + 32 = 36
        const xingOffset = options.channels === 1 ? 21 : 36;
        buf.write("Xing", xingOffset, 4, "ascii");
        // Xing flags: 0x01 (frames), 0x02 (bytes)
        buf.writeUInt32BE(0x00000003, xingOffset + 4);
        // number of frames: 1000
        buf.writeUInt32BE(1000, xingOffset + 8);
        // total bytes: 1000 * 500 = 500000
        buf.writeUInt32BE(500000, xingOffset + 12);
      }

      return buf;
    }

    it("correctly identifies 320 kbps CBR MP3", () => {
      const buf = createMp3FrameBuffer({
        bitrateKbps: 320,
        sampleRate: 44100,
        channels: 2,
        isVbr: false,
      });

      const info = inspectMp3Header(buf);
      expect(info).not.toBeNull();
      expect(info?.format).toBe("MP3");
      expect(info?.bitrate).toBe(320);
      expect(info?.sampleRate).toBe(44100);
      expect(info?.channels).toBe(2);
      expect(info?.isVbr).toBe(false);
    });

    it("correctly identifies 256 kbps CBR MP3 with 48 kHz sampling rate", () => {
      const buf = createMp3FrameBuffer({
        bitrateKbps: 256,
        sampleRate: 48000,
        channels: 2,
        isVbr: false,
      });

      const info = inspectMp3Header(buf);
      expect(info).not.toBeNull();
      expect(info?.format).toBe("MP3");
      expect(info?.bitrate).toBe(256);
      expect(info?.sampleRate).toBe(48000);
      expect(info?.channels).toBe(2);
      expect(info?.isVbr).toBe(false);
    });

    it("correctly detects VBR MP3 with Xing header", () => {
      const buf = createMp3FrameBuffer({
        bitrateKbps: 192,
        sampleRate: 44100,
        channels: 2,
        isVbr: true,
      });

      const info = inspectMp3Header(buf);
      expect(info).not.toBeNull();
      expect(info?.format).toBe("MP3");
      expect(info?.isVbr).toBe(true);
      expect(info?.sampleRate).toBe(44100);
    });

    it("skips ID3v2 container header and locates audio frame sync", () => {
      // Prepend an ID3v2 header: 'ID3', version 3, flags 0, syncsafe length 10
      const id3Header = Buffer.alloc(20);
      id3Header.write("ID3", 0, 3, "ascii");
      id3Header.writeUInt8(3, 3); // v2.3
      id3Header.writeUInt8(0, 4);
      id3Header.writeUInt8(0, 5); // flags
      // syncsafe integer 10 -> bytes 6..9: 0, 0, 0, 10
      id3Header.writeUInt8(0, 6);
      id3Header.writeUInt8(0, 7);
      id3Header.writeUInt8(0, 8);
      id3Header.writeUInt8(10, 9);
      // 10 bytes of ID3 body, total ID3 tag size = 20 bytes

      const frameBuf = createMp3FrameBuffer({
        bitrateKbps: 320,
        sampleRate: 44100,
        channels: 2,
      });

      const combined = Buffer.concat([id3Header, frameBuf]);
      const info = inspectMp3Header(combined);
      expect(info).not.toBeNull();
      expect(info?.format).toBe("MP3");
      expect(info?.bitrate).toBe(320);
    });
  });

  describe("inspectAudioBuffer dispatch", () => {
    it("auto-detects FLAC and MP3 buffers", () => {
      const flacBuf = createFlacStreamInfoBuffer({
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
      });

      const resFlac = inspectAudioBuffer(flacBuf);
      expect(resFlac?.format).toBe("FLAC");

      const mp3Buf = Buffer.alloc(100);
      mp3Buf.writeUInt8(0xff, 0);
      mp3Buf.writeUInt8(0xfb, 1);
      mp3Buf.writeUInt8(14 << 4, 2); // 320kbps, 44.1kHz
      mp3Buf.writeUInt8(0x00, 3);

      const resMp3 = inspectAudioBuffer(mp3Buf);
      expect(resMp3?.format).toBe("MP3");
      expect(resMp3?.bitrate).toBe(320);
    });
  });

  describe("Camelot Wheel Notation Conversion (Unit)", () => {
    it("converts standard minor keys into correct Camelot A-codes", () => {
      expect(toCamelotKey("Am")).toBe("8A");
      expect(toCamelotKey("Amin")).toBe("8A");
      expect(toCamelotKey("A minor")).toBe("8A");
      expect(toCamelotKey("C#m")).toBe("12A");
      expect(toCamelotKey("Dbm")).toBe("12A");
      expect(toCamelotKey("Ebm")).toBe("2A");
      expect(toCamelotKey("D#m")).toBe("2A");
      expect(toCamelotKey("Bbm")).toBe("3A");
      expect(toCamelotKey("Fm")).toBe("4A");
      expect(toCamelotKey("Cm")).toBe("5A");
      expect(toCamelotKey("Gm")).toBe("6A");
      expect(toCamelotKey("Dm")).toBe("7A");
      expect(toCamelotKey("Em")).toBe("9A");
      expect(toCamelotKey("Bm")).toBe("10A");
      expect(toCamelotKey("F#m")).toBe("11A");
      expect(toCamelotKey("G#m")).toBe("1A");
    });

    it("converts standard major keys into correct Camelot B-codes", () => {
      expect(toCamelotKey("C")).toBe("8B");
      expect(toCamelotKey("C Major")).toBe("8B");
      expect(toCamelotKey("Cmaj")).toBe("8B");
      expect(toCamelotKey("G")).toBe("9B");
      expect(toCamelotKey("G Major")).toBe("9B");
      expect(toCamelotKey("D")).toBe("10B");
      expect(toCamelotKey("A")).toBe("11B");
      expect(toCamelotKey("E")).toBe("12B");
      expect(toCamelotKey("B")).toBe("1B");
      expect(toCamelotKey("F#")).toBe("2B");
      expect(toCamelotKey("Gb")).toBe("2B");
      expect(toCamelotKey("Db")).toBe("3B");
      expect(toCamelotKey("C#")).toBe("3B");
      expect(toCamelotKey("Ab")).toBe("4B");
      expect(toCamelotKey("Eb")).toBe("5B");
      expect(toCamelotKey("Bb")).toBe("6B");
      expect(toCamelotKey("F")).toBe("7B");
    });

    it("preserves and normalizes existing Camelot key strings", () => {
      expect(toCamelotKey("8A")).toBe("8A");
      expect(toCamelotKey("8a")).toBe("8A");
      expect(toCamelotKey("08A")).toBe("8A");
      expect(toCamelotKey("12B")).toBe("12B");
      expect(toCamelotKey("8A - Am")).toBe("8A");
      expect(toCamelotKey("Am / 8A")).toBe("8A");
    });

    it("returns undefined for invalid or missing musical keys", () => {
      expect(toCamelotKey(undefined)).toBeUndefined();
      expect(toCamelotKey(null)).toBeUndefined();
      expect(toCamelotKey("")).toBeUndefined();
      expect(toCamelotKey("H# Major")).toBeUndefined();
      expect(toCamelotKey("NotAKey")).toBeUndefined();
    });
  });

  describe("BPM Parsing & Normalization (Unit)", () => {
    it("parses clean numbers and decimal BPM values", () => {
      expect(parseBpm(126)).toBe(126);
      expect(parseBpm(128.5)).toBe(128.5);
      expect(parseBpm("126")).toBe(126);
      expect(parseBpm("126.00")).toBe(126);
      expect(parseBpm("128.45")).toBe(128.5);
      expect(parseBpm("130 BPM")).toBe(130);
    });

    it("returns undefined for invalid, non-numeric or extreme BPM values", () => {
      expect(parseBpm(undefined)).toBeUndefined();
      expect(parseBpm(null)).toBeUndefined();
      expect(parseBpm("")).toBeUndefined();
      expect(parseBpm("fast")).toBeUndefined();
      expect(parseBpm(10)).toBeUndefined(); // Below DJ threshold (30)
      expect(parseBpm(450)).toBeUndefined(); // Above DJ threshold (300)
    });
  });

  describe("Audiophile Fake Lossless Transcode & Frequency Cutoff Verification (Unit)", () => {
    const sampleRate = 44100;
    const numSamples = 4096;

    it("detects sharp cutoff around 16 kHz for 128 kbps transcode", () => {
      // Generate signal with high energy up to 15.8 kHz, dropping off steeply above 16 kHz
      const samples = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        samples[i] =
          (Math.sin((2 * Math.PI * 1000 * i) / sampleRate) +
            Math.sin((2 * Math.PI * 5000 * i) / sampleRate) +
            Math.sin((2 * Math.PI * 15800 * i) / sampleRate)) /
          3;
      }

      const cutoff = detectFrequencyCutoff(samples, sampleRate);
      expect(cutoff).toBeGreaterThanOrEqual(15500);
      expect(cutoff).toBeLessThanOrEqual(16500);
    });

    it("detects sharp cutoff around 19 kHz for 192 kbps transcode", () => {
      // Generate signal with energy up to 18.8 kHz, dropping off above 19 kHz
      const samples = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        samples[i] =
          (Math.sin((2 * Math.PI * 1000 * i) / sampleRate) +
            Math.sin((2 * Math.PI * 8000 * i) / sampleRate) +
            Math.sin((2 * Math.PI * 18800 * i) / sampleRate)) /
          3;
      }

      const cutoff = detectFrequencyCutoff(samples, sampleRate);
      expect(cutoff).toBeGreaterThanOrEqual(18500);
      expect(cutoff).toBeLessThanOrEqual(19500);
    });

    it("detects full spectrum 21-22 kHz for genuine lossless audio", () => {
      // Generate full-spectrum signal reaching 21.5 kHz
      const samples = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        samples[i] =
          (Math.sin((2 * Math.PI * 2000 * i) / sampleRate) +
            Math.sin((2 * Math.PI * 10000 * i) / sampleRate) +
            Math.sin((2 * Math.PI * 21500 * i) / sampleRate)) /
          3;
      }

      const cutoff = detectFrequencyCutoff(samples, sampleRate);
      expect(cutoff).toBeGreaterThanOrEqual(21000);
    });

    it("classifies ~16 kHz and ~19 kHz FLACs as 'suspect_transcode'", () => {
      const s16 = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        s16[i] =
          (Math.sin((2 * Math.PI * 2000 * i) / sampleRate) +
            Math.sin((2 * Math.PI * 15800 * i) / sampleRate)) /
          2;
      }

      const result16 = verifyAudioIntegrity(s16, "FLAC", sampleRate);
      expect(result16.integrity).toBe("suspect_transcode");
      expect(result16.cutoffFrequency).toBeLessThanOrEqual(16500);

      const s19 = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        s19[i] =
          (Math.sin((2 * Math.PI * 2000 * i) / sampleRate) +
            Math.sin((2 * Math.PI * 18800 * i) / sampleRate)) /
          2;
      }

      const result19 = verifyAudioIntegrity(s19, "FLAC", sampleRate);
      expect(result19.integrity).toBe("suspect_transcode");
      expect(result19.cutoffFrequency).toBeLessThanOrEqual(19500);
    });

    it("classifies 22 kHz full-spectrum FLAC as 'genuine'", () => {
      const s22 = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        s22[i] =
          (Math.sin((2 * Math.PI * 2000 * i) / sampleRate) +
            Math.sin((2 * Math.PI * 21500 * i) / sampleRate)) /
          2;
      }

      const result22 = verifyAudioIntegrity(s22, "FLAC", sampleRate);
      expect(result22.integrity).toBe("genuine");
      expect(result22.cutoffFrequency).toBeGreaterThanOrEqual(21000);
    });

    it("returns 'unverified' when signal has negligible energy or is silent", () => {
      const silent = new Float32Array(numSamples);
      const res = verifyAudioIntegrity(silent, "FLAC", sampleRate);
      expect(res.integrity).toBe("unverified");
    });
  });
});
