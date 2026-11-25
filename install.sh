#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# soulmate — macOS Installer
# ──────────────────────────────────────────────────────────────────────────────
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/lhommeduchili/soulmate/main/install.sh | bash
#
# Optional environment variables:
#   SOULMATE_VERSION      Release tag to install (default: latest, e.g. v2.0.0)
#   SOULMATE_INSTALL_DIR  Target Applications folder (default: /Applications)
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="lhommeduchili/soulmate"
APP_NAME="soulmate"
VERSION="${SOULMATE_VERSION:-latest}"

# Terminal styling (plain fallback when stdout is not a TTY)
if [ -t 1 ]; then
  BOLD="\033[1m"
  DIM="\033[2m"
  GREEN="\033[38;2;101;214;133m"
  RED="\033[38;2;192;154;159m"
  BONE="\033[38;2;215;208;195m"
  RESET="\033[0m"
else
  BOLD=""
  DIM=""
  GREEN=""
  RED=""
  BONE=""
  RESET=""
fi

info()  { printf "${BONE}[soulmate]${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}[soulmate]${RESET} %s\n" "$*"; }
warn()  { printf "${RED}[soulmate]${RESET} warning: %s\n" "$*" >&2; }
fail()  { printf "${RED}[soulmate] error:${RESET} %s\n" "$*" >&2; exit 1; }

# 1. Verify platform
OS="$(uname -s)"
if [ "$OS" != "Darwin" ]; then
  fail "this installer is for macOS only (detected: ${OS}). download linux/windows builds at https://github.com/${REPO}/releases"
fi

# 2. Detect native architecture (handle Apple Silicon even under Rosetta shell)
RAW_ARCH="$(uname -m)"
if [ "$RAW_ARCH" = "arm64" ]; then
  ARCH="arm64"
elif [ "$RAW_ARCH" = "x86_64" ]; then
  if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
    ARCH="arm64"
  else
    ARCH="x64"
  fi
else
  fail "unsupported macOS architecture: ${RAW_ARCH}"
fi

# 3. Resolve install directory
if [ -n "${SOULMATE_INSTALL_DIR:-}" ]; then
  INSTALL_DIR="$SOULMATE_INSTALL_DIR"
elif [ -w "/Applications" ]; then
  INSTALL_DIR="/Applications"
else
  INSTALL_DIR="${HOME}/Applications"
  mkdir -p "$INSTALL_DIR"
  warn "/Applications is not writable without sudo; installing to ${INSTALL_DIR}"
fi

# 4. Create isolated temp workspace with automatic cleanup
TMP_DIR="$(mktemp -d -t soulmate-install.XXXXXX)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

# 5. Query GitHub Releases API over HTTPS (TLS 1.2+)
if [ "$VERSION" = "latest" ]; then
  API_URL="https://api.github.com/repos/${REPO}/releases/latest"
else
  API_URL="https://api.github.com/repos/${REPO}/releases/tags/${VERSION}"
fi

info "fetching release metadata (${VERSION}, macOS ${ARCH})..."
RELEASE_JSON="${TMP_DIR}/release.json"
curl -fsSL --proto '=https' --tlsv1.2 \
  -H "Accept: application/vnd.github+json" \
  -H "User-Agent: soulmate-installer" \
  "$API_URL" -o "$RELEASE_JSON" \
  || fail "failed to fetch release metadata from ${API_URL}"

TAG_NAME="$(grep -m1 '"tag_name"' "$RELEASE_JSON" | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
[ -n "$TAG_NAME" ] || fail "could not determine release version from GitHub API response"

# Extract browser_download_url entries
URLS_FILE="${TMP_DIR}/urls.txt"
grep '"browser_download_url"' "$RELEASE_JSON" \
  | sed -E 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' \
  > "$URLS_FILE"

if [ "$ARCH" = "arm64" ]; then
  ASSET_URL="$(grep -E '/soulmate-.*-arm64-mac\.zip$' "$URLS_FILE" | head -n1 || true)"
else
  ASSET_URL="$(grep -E '/soulmate-.*-mac\.zip$' "$URLS_FILE" | grep -v 'arm64' | head -n1 || true)"
fi

[ -n "$ASSET_URL" ] || fail "no macOS ${ARCH} .zip release asset found for ${TAG_NAME}"
ASSET_NAME="$(basename "$ASSET_URL")"

CHECKSUMS_URL="$(grep -E '/SHA256SUMS\.txt$' "$URLS_FILE" | head -n1 || true)"

# 6. Download archive
ZIP_PATH="${TMP_DIR}/${ASSET_NAME}"
info "downloading ${ASSET_NAME} (${TAG_NAME})..."
curl -fL --progress-bar --proto '=https' --tlsv1.2 \
  -H "User-Agent: soulmate-installer" \
  "$ASSET_URL" -o "$ZIP_PATH" \
  || fail "failed to download ${ASSET_URL}"

# 7. Verify SHA-256 checksum when published
if [ -n "$CHECKSUMS_URL" ]; then
  CHECKSUMS_PATH="${TMP_DIR}/SHA256SUMS.txt"
  info "verifying SHA-256 checksum..."
  curl -fsSL --proto '=https' --tlsv1.2 \
    -H "User-Agent: soulmate-installer" \
    "$CHECKSUMS_URL" -o "$CHECKSUMS_PATH" \
    || fail "failed to download SHA256SUMS.txt"

  EXPECTED_HASH="$(awk -v name="$ASSET_NAME" '$2 == name || $2 == "*"name { print $1; exit }' "$CHECKSUMS_PATH")"
  [ -n "$EXPECTED_HASH" ] || fail "checksum entry for ${ASSET_NAME} not found in SHA256SUMS.txt"

  ACTUAL_HASH="$(shasum -a 256 "$ZIP_PATH" | awk '{ print $1 }')"
  if [ "$EXPECTED_HASH" != "$ACTUAL_HASH" ]; then
    fail "SHA-256 checksum mismatch! expected ${EXPECTED_HASH}, got ${ACTUAL_HASH}"
  fi
  ok "SHA-256 verified (${ACTUAL_HASH:0:16}...)"
else
  warn "SHA256SUMS.txt not found on release ${TAG_NAME}; skipping checksum verification"
fi

# 8. Extract archive using ditto (preserves macOS bundle metadata & signatures)
EXTRACT_DIR="${TMP_DIR}/extract"
mkdir -p "$EXTRACT_DIR"
info "extracting ${APP_NAME}.app..."
ditto -xk "$ZIP_PATH" "$EXTRACT_DIR"

EXTRACTED_APP="$(find "$EXTRACT_DIR" -maxdepth 2 -name "${APP_NAME}.app" -type d | head -n1 || true)"
[ -n "$EXTRACTED_APP" ] || fail "could not locate ${APP_NAME}.app inside ${ASSET_NAME}"

# 9. Gracefully quit running instance if open
if pgrep -x "$APP_NAME" >/dev/null 2>&1; then
  info "closing running ${APP_NAME} instance..."
  osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
  sleep 1
fi

# 10. Install into Applications directory
TARGET_APP="${INSTALL_DIR}/${APP_NAME}.app"
STAGED_APP="${INSTALL_DIR}/.${APP_NAME}.app.staging.$$"

rm -rf "$STAGED_APP"
cp -R "$EXTRACTED_APP" "$STAGED_APP"
rm -rf "$TARGET_APP"
mv "$STAGED_APP" "$TARGET_APP"

# 11. Strip macOS quarantine flag so ad-hoc signed app launches smoothly
xattr -cr "$TARGET_APP" 2>/dev/null || true

printf "\n"
ok "${BOLD}installed ${APP_NAME} ${TAG_NAME} (${ARCH})${RESET}"
printf "${DIM}  location: ${TARGET_APP}${RESET}\n"
printf "${DIM}  launch:   open -a ${APP_NAME}${RESET}\n\n"
