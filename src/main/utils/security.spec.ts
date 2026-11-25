import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  existsSync,
} from "fs";
import { tmpdir } from "os";
import {
  isSafeRemoteUrl,
  isSafeExternalOpenUrl,
  isPathWithinDirectory,
  isAllowedMediaPath,
  sanitizeExportFileName,
  isPrivateOrLoopbackHost,
  encryptSecret,
  decryptSecret,
} from "./security";

describe("Security Hardening Utilities", () => {
  let tempRoot: string;
  let downloadDir: string;
  let outsideDir: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "soulmate-sec-test-"));
    downloadDir = join(tempRoot, "downloads");
    outsideDir = join(tempRoot, "outside");
    mkdirSync(downloadDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
  });

  afterEach(() => {
    if (tempRoot && existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  describe("isPrivateOrLoopbackHost", () => {
    it("blocks localhost, loopback, link-local, metadata, and RFC1918 private hosts", () => {
      const blocked = [
        "localhost",
        "LOCALHOST",
        "foo.localhost",
        "127.0.0.1",
        "127.255.255.254",
        "0.0.0.0",
        "10.0.0.1",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "169.254.169.254",
        "::1",
        "[::1]",
        "fc00::1",
        "fd12::1",
        "fe80::1",
        "printer.local",
        "service.internal",
      ];

      for (const host of blocked) {
        expect(isPrivateOrLoopbackHost(host), `expected ${host} blocked`).toBe(
          true,
        );
      }
    });

    it("allows public domain names and public IPs", () => {
      const allowed = [
        "open.spotify.com",
        "i.scdn.co",
        "soundcloud.com",
        "artist.bandcamp.com",
        "172.15.0.1",
        "172.32.0.1",
        "8.8.8.8",
        "1.1.1.1",
      ];

      for (const host of allowed) {
        expect(isPrivateOrLoopbackHost(host), `expected ${host} allowed`).toBe(
          false,
        );
      }
    });
  });

  describe("isSafeRemoteUrl (SSRF protection)", () => {
    it("allows public https URLs", () => {
      expect(isSafeRemoteUrl("https://i.scdn.co/image/123")).toBe(true);
      expect(isSafeRemoteUrl("https://soundcloud.com/artist/track")).toBe(true);
      expect(isSafeRemoteUrl("https://label.bandcamp.com/album/ep")).toBe(true);
    });

    it("rejects non-https protocols, credentials in URL, and private/loopback targets", () => {
      expect(isSafeRemoteUrl("http://example.com/art.jpg")).toBe(false);
      expect(isSafeRemoteUrl("file:///etc/passwd")).toBe(false);
      expect(isSafeRemoteUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeRemoteUrl("https://127.0.0.1:8080/api")).toBe(false);
      expect(isSafeRemoteUrl("https://localhost/admin")).toBe(false);
      expect(isSafeRemoteUrl("https://169.254.169.254/latest/meta-data/")).toBe(
        false,
      );
      expect(isSafeRemoteUrl("https://192.168.0.1/router")).toBe(false);
      expect(isSafeRemoteUrl("https://user:pass@example.com/art.jpg")).toBe(
        false,
      );
      expect(isSafeRemoteUrl("not-a-url")).toBe(false);
      expect(isSafeRemoteUrl("")).toBe(false);
    });
  });

  describe("isSafeExternalOpenUrl (shell.openExternal guard)", () => {
    it("allows only https and http URLs", () => {
      expect(isSafeExternalOpenUrl("https://github.com/lhommeduchili")).toBe(
        true,
      );
      expect(isSafeExternalOpenUrl("http://example.com")).toBe(true);
    });

    it("blocks dangerous schemes (file, smb, javascript, data, custom)", () => {
      expect(isSafeExternalOpenUrl("file:///Applications/Calculator.app")).toBe(
        false,
      );
      expect(isSafeExternalOpenUrl("smb://evil.host/share")).toBe(false);
      expect(isSafeExternalOpenUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeExternalOpenUrl("data:text/html,<script>1</script>")).toBe(
        false,
      );
      expect(isSafeExternalOpenUrl("ms-msdt:/id")).toBe(false);
      expect(isSafeExternalOpenUrl("")).toBe(false);
    });
  });

  describe("isPathWithinDirectory & symlink escape prevention", () => {
    it("allows files directly inside or nested inside the allowed directory", () => {
      const nestedDir = join(downloadDir, "Daft Punk", "Discovery");
      mkdirSync(nestedDir, { recursive: true });
      const trackPath = join(nestedDir, "01 - One More Time.flac");
      writeFileSync(trackPath, "fLaC");

      expect(isPathWithinDirectory(trackPath, downloadDir)).toBe(true);
      expect(isPathWithinDirectory(downloadDir, downloadDir)).toBe(true);
      // Non-existent files inside an existing directory (including symlinked parents like macOS /var)
      expect(
        isPathWithinDirectory(join(downloadDir, "new-export.xml"), downloadDir),
      ).toBe(true);
    });

    it("rejects path traversal sequences and sibling prefix tricks", () => {
      const siblingDir = `${downloadDir}-evil`;
      mkdirSync(siblingDir, { recursive: true });
      const siblingFile = join(siblingDir, "secret.flac");
      writeFileSync(siblingFile, "fLaC");

      expect(
        isPathWithinDirectory(
          join(downloadDir, "..", "outside", "secret.flac"),
          downloadDir,
        ),
      ).toBe(false);
      expect(isPathWithinDirectory(siblingFile, downloadDir)).toBe(false);
      expect(isPathWithinDirectory("", downloadDir)).toBe(false);
      expect(isPathWithinDirectory(downloadDir, "")).toBe(false);
    });

    it("rejects symlinks inside downloadDir that point outside downloadDir", () => {
      const secretFile = join(outsideDir, "private.flac");
      writeFileSync(secretFile, "secret");
      const evilLink = join(downloadDir, "escape.flac");
      symlinkSync(secretFile, evilLink);

      expect(isPathWithinDirectory(evilLink, downloadDir)).toBe(false);
    });
  });

  describe("isAllowedMediaPath", () => {
    it("allows audio files inside downloadDir or explicitly in known queue paths", () => {
      const insideFile = join(downloadDir, "track.flac");
      writeFileSync(insideFile, "fLaC");

      const queuedOutsideFile = join(outsideDir, "legacy.mp3");
      writeFileSync(queuedOutsideFile, "ID3");

      const unqueuedOutsideFile = join(outsideDir, "private.flac");
      writeFileSync(unqueuedOutsideFile, "fLaC");

      expect(isAllowedMediaPath(insideFile, downloadDir, [])).toBe(true);
      expect(
        isAllowedMediaPath(queuedOutsideFile, downloadDir, [queuedOutsideFile]),
      ).toBe(true);
      expect(
        isAllowedMediaPath(unqueuedOutsideFile, downloadDir, [
          queuedOutsideFile,
        ]),
      ).toBe(false);
    });
  });

  describe("sanitizeExportFileName", () => {
    it("prevents path traversal and preserves safe filenames with expected extension", () => {
      expect(
        sanitizeExportFileName("../../../etc/passwd", "rekordbox.xml", ".xml"),
      ).toBe("passwd.xml");
      expect(
        sanitizeExportFileName("..\\..\\evil.bat", "collection.nml", ".nml"),
      ).toBe("evil.bat.nml");
      expect(
        sanitizeExportFileName("my_set.crate", "fallback.crate", ".crate"),
      ).toBe("my_set.crate");
      expect(sanitizeExportFileName("...", "rekordbox.xml", ".xml")).toBe(
        "rekordbox.xml",
      );
      expect(sanitizeExportFileName(undefined, "rekordbox.xml", ".xml")).toBe(
        "rekordbox.xml",
      );
    });
  });

  describe("encryptSecret & decryptSecret", () => {
    it("round-trips secrets cleanly when encryption backend is unavailable or provided", () => {
      const fakeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: (plain: string) => Buffer.from(`ENC:${plain}`, "utf8"),
        decryptString: (buf: Buffer) =>
          buf.toString("utf8").replace(/^ENC:/, ""),
      };

      const encrypted = encryptSecret("my-super-secret", fakeStorage);
      expect(encrypted).not.toBe("my-super-secret");
      expect(encrypted.startsWith("enc:v1:")).toBe(true);
      expect(decryptSecret(encrypted, fakeStorage)).toBe("my-super-secret");

      // Legacy plaintext values remain transparently readable for seamless migration
      expect(decryptSecret("legacy-plaintext-token", fakeStorage)).toBe(
        "legacy-plaintext-token",
      );
    });

    it("falls back safely when encryption is unavailable", () => {
      const unavailableStorage = {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.alloc(0),
        decryptString: () => "",
      };

      const stored = encryptSecret("plain-secret", unavailableStorage);
      expect(stored).toBe("plain-secret");
      expect(decryptSecret(stored, unavailableStorage)).toBe("plain-secret");
    });
  });
});
