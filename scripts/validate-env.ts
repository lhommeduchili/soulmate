import fs from "fs";
import path from "path";

const REQUIRED_BUILD_ENV_KEYS = ["VITE_SPOTIFY_CLIENT_ID"] as const;

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const contents = fs.readFileSync(filePath, "utf8");
  const entries: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    entries[key] = value.replace(/^['"]|['"]$/g, "");
  }

  return entries;
}

function resolveBuildEnvValue(key: string): string {
  const processValue = process.env[key];
  if (typeof processValue === "string" && processValue.trim()) {
    return processValue.trim();
  }

  const workspaceRoot = process.cwd();
  const localEnv = parseEnvFile(path.join(workspaceRoot, ".env.local"));
  const defaultEnv = parseEnvFile(path.join(workspaceRoot, ".env"));

  const fileValue = localEnv[key] ?? defaultEnv[key];
  return typeof fileValue === "string" ? fileValue.trim() : "";
}

function main(): void {
  const missing = REQUIRED_BUILD_ENV_KEYS.filter(
    (key) => !resolveBuildEnvValue(key),
  );

  if (missing.length > 0) {
    console.error(
      "[validate-env] Missing required build environment variables:",
    );
    for (const key of missing) {
      console.error(`- ${key}`);
    }
    console.error(
      "[validate-env] Define them in CI secrets or in local .env/.env.local before building.",
    );
    process.exit(1);
  }

  console.log("[validate-env] Required build variables are present.");
}

main();
