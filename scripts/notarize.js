require('dotenv').config();
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== 'darwin') {
        return;
    }

    const appName = context.packager.appInfo.productFilename;

    // Check if notarization credentials are present
    if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD || !process.env.APPLE_TEAM_ID) {
        console.log('  • Notarization skipped: APPLE_ID, APPLE_ID_PASSWORD, or APPLE_TEAM_ID not set.');
        return;
    }

    console.log(`  • Notarizing ${appName}...`);

    return await notarize({
        appBundleId: 'com.soulmate.app',
        appPath: `${appOutDir}/${appName}.app`,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
    });
};
