import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "path";
import { existsSync, realpathSync } from "fs";
import { sanitizeFilename } from "../services/MetadataService";

const ENCRYPTED_PREFIX = "enc:v1:";

export interface SafeStorageLike {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
}

function getDefaultSafeStorage(): SafeStorageLike | null {
  try {
    // Dynamically resolve electron safeStorage so pure Node/Vitest environments stay decoupled
    const electron = require("electron") as {
      safeStorage?: SafeStorageLike;
    };
    return electron?.safeStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the hostname points to localhost, loopback, link-local,
 * cloud metadata, or RFC1918 / ULA private network ranges.
 */
export function isPrivateOrLoopbackHost(hostname: string): boolean {
  if (!hostname) return true;
  const cleaned = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");

  if (
    cleaned === "localhost" ||
    cleaned.endsWith(".localhost") ||
    cleaned.endsWith(".local") ||
    cleaned.endsWith(".internal") ||
    cleaned === "::1" ||
    cleaned === "::" ||
    cleaned === "0.0.0.0"
  ) {
    return true;
  }

  // IPv6 private / link-local / IPv4-mapped loopback
  if (cleaned.includes(":")) {
    if (
      cleaned.startsWith("fc") ||
      cleaned.startsWith("fd") ||
      cleaned.startsWith("fe8") ||
      cleaned.startsWith("fe9") ||
      cleaned.startsWith("fea") ||
      cleaned.startsWith("feb") ||
      cleaned.startsWith("::ffff:127.") ||
      cleaned.startsWith("::ffff:10.") ||
      cleaned.startsWith("::ffff:192.168.") ||
      cleaned.startsWith("::ffff:169.254.") ||
      cleaned.startsWith("::ffff:0.")
    ) {
      return true;
    }
    const mapped172 = cleaned.match(/^::ffff:172\.(\d+)\./);
    if (mapped172) {
      const octet = Number(mapped172[1]);
      if (octet >= 16 && octet <= 31) return true;
    }
    return false;
  }

  // IPv4 literal check
  const ipv4Match = cleaned.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }

  return false;
}

/**
 * Validates that a remote URL fetched by main-process services is strictly HTTPS,
 * carries no embedded credentials, and does not target loopback or private networks (SSRF defense).
 */
export function isSafeRemoteUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    if (isPrivateOrLoopbackHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that a URL opened in the host OS browser via shell.openExternal
 * uses only http: or https: schemes (blocks file:, smb:, javascript:, ms-msdt:, etc.).
 */
export function isSafeExternalOpenUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function canonicalizePath(targetPath: string): string {
  const resolved = resolve(targetPath);
  if (existsSync(resolved)) {
    try {
      return realpathSync(resolved);
    } catch {
      return resolved;
    }
  }

  // Walk up to the deepest existing ancestor so symlinks like macOS /var -> /private/var
  // are resolved consistently even for files that have not yet been written to disk.
  const trailingParts: string[] = [];
  let current = resolved;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      return resolved;
    }
    trailingParts.unshift(basename(current));
    current = parent;
  }

  try {
    return join(realpathSync(current), ...trailingParts);
  } catch {
    return resolved;
  }
}

/**
 * Verifies that targetPath resolves strictly inside allowedDir (or equals allowedDir),
 * resolving symlinks when present to prevent path traversal and symlink escape attacks.
 */
export function isPathWithinDirectory(
  targetPath: string,
  allowedDir: string,
): boolean {
  if (!targetPath || !allowedDir) return false;
  try {
    const canonTarget = canonicalizePath(targetPath);
    const canonBase = canonicalizePath(allowedDir);
    const rel = relative(canonBase, canonTarget);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  } catch {
    return false;
  }
}

/**
 * Verifies whether a local media/file path is permitted to be streamed via soulmate-media://
 * or revealed in the OS file manager: must either reside inside downloadDir OR match
 * an exact canonicalized path of a known queue item.
 */
export function isAllowedMediaPath(
  targetPath: string,
  downloadDir: string,
  knownQueuePaths: string[],
): boolean {
  if (!targetPath) return false;
  if (downloadDir && isPathWithinDirectory(targetPath, downloadDir)) {
    return true;
  }

  const canonTarget = canonicalizePath(targetPath);
  for (const knownPath of knownQueuePaths) {
    if (!knownPath) continue;
    if (canonicalizePath(knownPath) === canonTarget) {
      return true;
    }
  }

  return false;
}

/**
 * Sanitizes an export fileName supplied over IPC so it cannot traverse directories
 * and always ends with the expected extension.
 */
export function sanitizeExportFileName(
  fileName: string | undefined,
  fallback: string,
  expectedExt: string,
): string {
  if (!fileName || typeof fileName !== "string") {
    return fallback;
  }

  const normalizedExt = expectedExt.startsWith(".")
    ? expectedExt.toLowerCase()
    : `.${expectedExt.toLowerCase()}`;

  // Strip any POSIX or Windows directory components first
  const leaf = basename(fileName.replace(/\\/g, "/")).trim();
  if (!leaf || leaf === "." || leaf === "..") {
    return fallback;
  }

  const currentExt = extname(leaf).toLowerCase();
  const stemRaw =
    currentExt === normalizedExt ? leaf.slice(0, -normalizedExt.length) : leaf;

  const cleanStem = sanitizeFilename(stemRaw);
  if (!cleanStem || cleanStem === "Unknown") {
    // Only fall back when the user's input contained no valid characters at all
    if (!/[a-zA-Z0-9\p{L}\p{N}]/u.test(stemRaw)) {
      return fallback;
    }
  }

  return `${cleanStem}${normalizedExt}`;
}

/**
 * Encrypts a sensitive string using Electron safeStorage (OS keychain / DPAPI / libsecret)
 * when available; falls back transparently when encryption is unavailable (e.g. headless CI).
 */
export function encryptSecret(
  plainText: string,
  storage: SafeStorageLike | null = getDefaultSafeStorage(),
): string {
  if (!plainText) return "";
  if (plainText.startsWith(ENCRYPTED_PREFIX)) return plainText;
  try {
    if (storage && storage.isEncryptionAvailable()) {
      const encryptedBuf = storage.encryptString(plainText);
      return `${ENCRYPTED_PREFIX}${encryptedBuf.toString("base64")}`;
    }
  } catch {
    // Fall back to plaintext when OS keychain is unavailable
  }
  return plainText;
}

/**
 * Decrypts a secret produced by encryptSecret, while remaining backwards-compatible
 * with legacy plaintext values stored prior to encryption rollout.
 */
export function decryptSecret(
  storedValue: string | undefined,
  storage: SafeStorageLike | null = getDefaultSafeStorage(),
): string | undefined {
  if (!storedValue) return storedValue;
  if (!storedValue.startsWith(ENCRYPTED_PREFIX)) {
    return storedValue;
  }
  try {
    if (storage && storage.isEncryptionAvailable()) {
      const b64 = storedValue.slice(ENCRYPTED_PREFIX.length);
      return storage.decryptString(Buffer.from(b64, "base64"));
    }
  } catch {
    return undefined;
  }
  return undefined;
}
