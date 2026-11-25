import { spawn, execFile, execFileSync, ChildProcess } from "child_process";
import * as path from "path";
import { join } from "path";
import { app } from "electron";
import * as fs from "fs";
import * as crypto from "crypto";
import { createServer } from "net";
import { store } from "../store";
import log from "../utils/logger";
import { PreferencesService } from "./PreferencesService";
import { decryptSecret, encryptSecret } from "../utils/security";

export class SlskdService {
  private child: ChildProcess | null = null;
  private preferencesService = new PreferencesService();

  private port: number = 0;
  private apiKey: string = "";

  private async ensureCleanSlate(): Promise<void> {
    log.info("[SlskdService] Ensuring clean slate (killing zombies)...");
    return new Promise((resolve) => {
      const isWin = process.platform === "win32";
      const file = isWin ? "taskkill" : "pkill";
      const args = isWin ? ["/F", "/IM", "slskd.exe"] : ["-9", "-x", "slskd"];

      execFile(file, args, { windowsHide: true }, () => {
        setTimeout(resolve, 1000);
      });
    });
  }

  async start(): Promise<void> {
    await this.ensureCleanSlate();

    let binaryPath: string;
    const binaryName = process.platform === "win32" ? "slskd.exe" : "slskd";

    if (app.isPackaged) {
      binaryPath = join(process.resourcesPath, binaryName);
    } else {
      const platform = process.platform;
      const arch = process.arch;
      const resourceDir = join(
        __dirname,
        "../../resources",
        `${platform}-${arch}`,
      );
      binaryPath = join(resourceDir, binaryName);

      if (!fs.existsSync(binaryPath)) {
        log.info(
          `[SlskdService] Platform binary not found at ${binaryPath}, checking root resources...`,
        );
        binaryPath = join(__dirname, "../../resources", binaryName);
      }
    }
    const userDataPath = app.getPath("userData");
    const configPath = join(userDataPath, "slskd.yml");

    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    // 1. Generate Config
    // Find distinct ports for Web (TCP) and P2P (TCP+UDP)
    this.port = await this.findAvailablePort(false); // Web only needs TCP
    let p2pPort = await this.findAvailablePort(true); // P2P needs TCP+UDP

    // Ensure they are unique
    while (p2pPort === this.port) {
      p2pPort = await this.findAvailablePort(true);
    }

    this.apiKey = crypto.randomBytes(32).toString("hex");

    // 1b. Get or Create Credentials (encrypted via OS keychain when available)
    let user = store.get("soulseek.username") as string | undefined;
    const rawStoredPass = store.get("soulseek.password") as string | undefined;
    let pass = decryptSecret(rawStoredPass);

    if (!user || !pass) {
      const randomSuffix = crypto.randomBytes(4).toString("hex");
      user = `soulmate_user_${randomSuffix}`;
      pass = crypto.randomBytes(24).toString("hex");

      store.set("soulseek.username", user);
      store.set("soulseek.password", encryptSecret(pass));
      log.info(`[SlskdService] Created new Soulseek credentials for: ${user}`);
    } else if (rawStoredPass && !rawStoredPass.startsWith("enc:v1:")) {
      // Opportunistically upgrade legacy plaintext password to encrypted storage
      const encrypted = encryptSecret(pass);
      if (encrypted !== rawStoredPass) {
        store.set("soulseek.password", encrypted);
      }
    }

    // 2. Resolve Download Directory
    let downloadDir = this.preferencesService.getDownloadPath();
    if (!downloadDir) {
      downloadDir = this.preferencesService.getDefaultDownloadPath();
      this.preferencesService.setDownloadPath(downloadDir);
    }

    // Ensure download dir exists
    if (!fs.existsSync(downloadDir)) {
      try {
        fs.mkdirSync(downloadDir, { recursive: true });
      } catch (err) {
        log.error(
          `[SlskdService] Failed to create download dir: ${downloadDir}`,
          err,
        );
      }
    }

    // JSON.stringify safely escapes quotes, backslashes, and control characters for YAML scalars
    const configContent = `
web:
  ip_address: "127.0.0.1"
  port: ${this.port}
  authentication:
    api_key: ${JSON.stringify(this.apiKey)}
soulseek:
  username: ${JSON.stringify(user)}
  password: ${JSON.stringify(pass)}
  listen_port: ${p2pPort}
directories:
  downloads: ${JSON.stringify(downloadDir)}
`;

    fs.writeFileSync(configPath, configContent, {
      encoding: "utf8",
      mode: 0o600,
    });
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(configPath, 0o600);
      } catch {
        // Ignore if filesystem does not support POSIX permissions
      }
    }
    log.info(`[SlskdService] Config written to: ${configPath}`);
    log.info(
      `[SlskdService] Starting slskd from: ${binaryPath} on WebPort ${this.port}, P2PPort ${p2pPort}`,
    );

    // Explicitly resolve wwwroot path
    const wwwRootPath = join(path.dirname(binaryPath), "wwwroot");

    // Ensure binary is executable (macOS/Linux) and remove quarantine (macOS) without shell interpolation
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(binaryPath, 0o755);

        if (process.platform === "darwin") {
          try {
            execFileSync(
              "xattr",
              ["-d", "-r", "com.apple.quarantine", binaryPath],
              { stdio: "ignore" },
            );
          } catch {
            // Attribute might not exist
          }
          if (fs.existsSync(wwwRootPath)) {
            try {
              execFileSync(
                "xattr",
                ["-d", "-r", "com.apple.quarantine", wwwRootPath],
                { stdio: "ignore" },
              );
            } catch {
              // Attribute might not exist
            }
            try {
              execFileSync("chmod", ["-R", "755", wwwRootPath], {
                stdio: "ignore",
              });
            } catch {
              // Ignore permission error on read-only bundle
            }
          }
        }
      } catch (e) {
        log.warn("[SlskdService] Failed to set permissions:", e);
      }
    }

    try {
      this.child = spawn(binaryPath, [], {
        env: {
          ...process.env,
          SLSKD_CONFIG_FILE: configPath,
          SLSKD_APP_DIR: userDataPath,
          // Explicitly tell slskd where the web assets are
          SLSKD_WEB__CONTENTPATH: wwwRootPath,
        },
      });

      if (this.child.stdout) {
        this.child.stdout.on("data", (d) => log.info(`[Slskd] ${d}`));
      }
      if (this.child.stderr) {
        this.child.stderr.on("data", (d) => log.error(`[Slskd Error] ${d}`));
      }

      this.child.on("error", (err) => {
        log.error("[SlskdService] Failed to spawn slskd:", err);
      });

      this.child.on("exit", (code) => {
        log.info(`[SlskdService] Process exited with code ${code}`);
        this.child = null;
      });
    } catch (error) {
      log.error("[SlskdService] Error starting service:", error);
    }
  }

  private async findAvailablePort(checkUdp: boolean): Promise<number> {
    // Try up to 5 times to find a suitable port
    for (let i = 0; i < 5; i++) {
      try {
        const port = await this.getFreeTcpPort();
        if (checkUdp) {
          const udpFree = await this.isUdpPortFree(port);
          if (udpFree) return port;
        } else {
          return port;
        }
      } catch (e) {
        log.warn("[SlskdService] Port check failed, retrying...", e);
      }
    }
    throw new Error("Could not find available port");
  }

  private getFreeTcpPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.on("error", reject);
      // Listen on 0.0.0.0 to ensure IPv4 availability
      server.listen(0, "0.0.0.0", () => {
        const address = server.address();
        const port = typeof address === "string" ? 0 : address?.port || 0;
        server.close(() => {
          resolve(port);
        });
      });
    });
  }

  private isUdpPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const dgram = require("dgram");
      const socket = dgram.createSocket("udp4");
      socket.on("error", () => {
        socket.close();
        resolve(false);
      });
      socket.bind(port, "0.0.0.0", () => {
        socket.close();
        resolve(true);
      });
    });
  }

  stop(): void {
    if (this.child) {
      log.info("[SlskdService] Stopping process...");
      this.child.kill();
      this.child = null;
    }
  }

  getApiConfig(): { port: number; apiKey: string } {
    return { port: this.port, apiKey: this.apiKey };
  }
}
