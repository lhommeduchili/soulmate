require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterSign(context) {
    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== 'darwin') {
        return;
    }

    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(appOutDir, `${appName}.app`);

    // ── Tier 2: Notarize (if Apple Developer credentials are present) ────────
    if (process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.APPLE_TEAM_ID) {
        console.log(`  • Notarizing ${appName}...`);
        const { notarize } = require('@electron/notarize');

        return await notarize({
            appBundleId: 'com.soulmate.app',
            appPath,
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
        });
    }

    // ── Tier 1: Ad-hoc deep sign (no Apple Developer account) ────────────────
    // electron-builder's identity: "-" signs the main bundle, but nested
    // binaries in Contents/Resources (like slskd) may not be covered.
    // Deep-sign the entire .app to ensure all executables carry an ad-hoc
    // signature, which lets macOS run them on Apple Silicon and upgrades
    // Gatekeeper behavior from "move to trash" → "right-click → Open".
    console.log(`  • Notarization skipped (no Apple credentials). Ad-hoc deep signing ${appName}...`);

    try {
        execSync(
            `codesign --force --deep --sign "-" "${appPath}"`,
            { stdio: 'inherit' }
        );
        console.log(`  • Ad-hoc deep signing complete for ${appName}.`);
    } catch (error) {
        console.error(`  ✗ Ad-hoc deep signing failed for ${appName}:`, error.message);
        // Non-fatal: electron-builder already applied ad-hoc via identity: "-"
        // on the outer bundle. Nested binaries may lack signatures, but the
        // app should still launch.
    }
};
