import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { execFileSync } from "child_process";
import { dirname, join, resolve } from "path";
import { tmpdir } from "os";
import { deflateSync, inflateSync } from "zlib";

interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer: Buffer): DecodedPng {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Invalid PNG signature");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkData = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      interlace = chunkData[12];
    } else if (type === "IDAT") {
      idatChunks.push(chunkData);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (
    bitDepth !== 8 ||
    (colorType !== 6 && colorType !== 2) ||
    interlace !== 0
  ) {
    throw new Error(
      `Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`,
    );
  }

  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * bpp;
  const unfiltered = new Uint8Array(height * stride);

  for (let y = 0; y < height; y++) {
    const filterOffset = y * (stride + 1);
    const filterType = raw[filterOffset];
    const rowStart = y * stride;
    const prevRowStart = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const rawByte = raw[filterOffset + 1 + x];
      const left = x >= bpp ? unfiltered[rowStart + x - bpp] : 0;
      const up = y > 0 ? unfiltered[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? unfiltered[prevRowStart + x - bpp] : 0;

      let val = 0;
      switch (filterType) {
        case 0:
          val = rawByte;
          break;
        case 1:
          val = (rawByte + left) & 0xff;
          break;
        case 2:
          val = (rawByte + up) & 0xff;
          break;
        case 3:
          val = (rawByte + ((left + up) >> 1)) & 0xff;
          break;
        case 4:
          val = (rawByte + paethPredictor(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
      unfiltered[rowStart + x] = val;
    }
  }

  if (colorType === 6) {
    return { width, height, rgba: unfiltered };
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < unfiltered.length; i += 3, j += 4) {
    rgba[j] = unfiltered[i];
    rgba[j + 1] = unfiltered[i + 1];
    rgba[j + 2] = unfiltered[i + 2];
    rgba[j + 3] = 255;
  }
  return { width, height, rgba };
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const outRowStart = y * (stride + 1);
    raw[outRowStart] = 0; // filter None
    const inRowStart = y * stride;
    raw.set(rgba.subarray(inRowStart, inRowStart + stride), outRowStart + 1);
  }

  const compressed = deflateSync(raw, { level: 6 });

  return Buffer.concat([
    PNG_SIGNATURE,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function sampleBilinear(
  src: DecodedPng,
  u: number,
  v: number,
): [number, number, number, number] {
  const fx = clamp(u, 0, src.width - 1);
  const fy = clamp(v, 0, src.height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, src.width - 1);
  const y1 = Math.min(y0 + 1, src.height - 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const idx00 = (y0 * src.width + x0) * 4;
  const idx10 = (y0 * src.width + x1) * 4;
  const idx01 = (y1 * src.width + x0) * 4;
  const idx11 = (y1 * src.width + x1) * 4;

  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = src.rgba[idx00 + c] * (1 - tx) + src.rgba[idx10 + c] * tx;
    const bot = src.rgba[idx01 + c] * (1 - tx) + src.rgba[idx11 + c] * tx;
    out[c] = top * (1 - ty) + bot * ty;
  }
  return out;
}

function renderMacSquircleIcon(src: DecodedPng): Buffer {
  const size = 1024;
  const margin = 100;
  const bodySize = size - margin * 2; // 824
  const half = bodySize / 2; // 412
  const radius = 185;
  const center = (size - 1) / 2; // 511.5
  const innerHalf = half - radius;

  const rgba = new Uint8Array(size * size * 4);

  // Subtle rim color from critical-nocturne palette: rgba(215, 208, 195, 0.16)
  const rimR = 215;
  const rimG = 208;
  const rimB = 195;
  const rimMaxAlpha = 0.16;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - center) - innerHalf;
      const dy = Math.abs(y - center) - innerHalf;
      const qx = Math.max(dx, 0);
      const qy = Math.max(dy, 0);
      const dist = Math.hypot(qx, qy) + Math.min(Math.max(dx, dy), 0) - radius;

      const outIdx = (y * size + x) * 4;
      const coverage = clamp(0.5 - dist, 0, 1);

      if (coverage <= 0) {
        rgba[outIdx] = 0;
        rgba[outIdx + 1] = 0;
        rgba[outIdx + 2] = 0;
        rgba[outIdx + 3] = 0;
        continue;
      }

      const u = ((x - margin) / (bodySize - 1)) * (src.width - 1);
      const v = ((y - margin) / (bodySize - 1)) * (src.height - 1);
      let [r, g, b, a] = sampleBilinear(src, u, v);

      // Subtle 1.5px inner rim inside the squircle edge
      if (dist <= 0.5 && dist >= -2.0) {
        const rimWeight =
          dist >= -1.5
            ? clamp(1 - Math.abs(dist + 0.75) / 1.25, 0, 1) * rimMaxAlpha
            : 0;
        if (rimWeight > 0) {
          r = r * (1 - rimWeight) + rimR * rimWeight;
          g = g * (1 - rimWeight) + rimG * rimWeight;
          b = b * (1 - rimWeight) + rimB * rimWeight;
        }
      }

      const finalAlpha = Math.round(clamp((a / 255) * coverage, 0, 1) * 255);
      rgba[outIdx] = Math.round(clamp(r, 0, 255));
      rgba[outIdx + 1] = Math.round(clamp(g, 0, 255));
      rgba[outIdx + 2] = Math.round(clamp(b, 0, 255));
      rgba[outIdx + 3] = finalAlpha;
    }
  }

  return encodePng(size, size, rgba);
}

function buildMacIcns(pngPath: string, icnsPath: string): void {
  const iconsetDir = mkdtempSync(join(tmpdir(), "soulmate-iconset-"));
  const renamedIconset = `${iconsetDir}.iconset`;
  mkdirSync(renamedIconset, { recursive: true });

  try {
    const entries: Array<{ size: number; name: string }> = [
      { size: 16, name: "icon_16x16.png" },
      { size: 32, name: "icon_16x16@2x.png" },
      { size: 32, name: "icon_32x32.png" },
      { size: 64, name: "icon_32x32@2x.png" },
      { size: 128, name: "icon_128x128.png" },
      { size: 256, name: "icon_128x128@2x.png" },
      { size: 256, name: "icon_256x256.png" },
      { size: 512, name: "icon_256x256@2x.png" },
      { size: 512, name: "icon_512x512.png" },
      { size: 1024, name: "icon_512x512@2x.png" },
    ];

    for (const entry of entries) {
      execFileSync("/usr/bin/sips", [
        "-z",
        String(entry.size),
        String(entry.size),
        pngPath,
        "--out",
        join(renamedIconset, entry.name),
      ]);
    }

    execFileSync("/usr/bin/iconutil", [
      "-c",
      "icns",
      renamedIconset,
      "-o",
      icnsPath,
    ]);
  } finally {
    rmSync(iconsetDir, { recursive: true, force: true });
    rmSync(renamedIconset, { recursive: true, force: true });
  }
}

function patchElectronBundle(rootDir: string, icnsPath: string): void {
  const appContents = join(
    rootDir,
    "node_modules",
    "electron",
    "dist",
    "Electron.app",
    "Contents",
  );
  const infoPlist = join(appContents, "Info.plist");
  const electronIcns = join(appContents, "Resources", "electron.icns");

  if (!existsSync(infoPlist)) {
    return;
  }

  execFileSync("/usr/bin/plutil", [
    "-replace",
    "CFBundleName",
    "-string",
    "soulmate",
    infoPlist,
  ]);
  execFileSync("/usr/bin/plutil", [
    "-replace",
    "CFBundleDisplayName",
    "-string",
    "soulmate",
    infoPlist,
  ]);

  if (existsSync(icnsPath) && existsSync(dirname(electronIcns))) {
    copyFileSync(icnsPath, electronIcns);
  }
}

function main(): void {
  const rootDir = resolve(__dirname, "..");
  const buildDir = join(rootDir, "build");
  const rawIconPath = join(buildDir, "icon-raw.png");
  const iconPngPath = join(buildDir, "icon.png");
  const iconIcnsPath = join(buildDir, "icon.icns");
  const rendererLogoPath = join(
    rootDir,
    "src",
    "renderer",
    "src",
    "assets",
    "logo.png",
  );

  if (!existsSync(rawIconPath)) {
    if (!existsSync(iconPngPath)) {
      throw new Error(`Missing source icon at ${iconPngPath}`);
    }
    copyFileSync(iconPngPath, rawIconPath);
    console.log(`[setup-mac] Backed up raw icon to ${rawIconPath}`);
  }

  const rawPng = decodePng(readFileSync(rawIconPath));
  const roundedPng = renderMacSquircleIcon(rawPng);
  writeFileSync(iconPngPath, roundedPng);
  writeFileSync(rendererLogoPath, roundedPng);
  console.log(
    `[setup-mac] Generated 1024x1024 macOS squircle icon at ${iconPngPath} and ${rendererLogoPath}`,
  );

  if (process.platform !== "darwin") {
    console.log(
      "[setup-mac] Non-macOS platform detected; skipping .icns and Electron.app patch.",
    );
    return;
  }

  buildMacIcns(iconPngPath, iconIcnsPath);
  console.log(`[setup-mac] Built ${iconIcnsPath}`);

  patchElectronBundle(rootDir, iconIcnsPath);
  console.log("[setup-mac] Patched Electron.app Info.plist and dock icon.");
}

main();
