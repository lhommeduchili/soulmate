
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import https from 'https';

// Configuration
const VERSION = '0.24.3';
const BASE_URL = `https://github.com/slskd/slskd/releases/download/${VERSION}`;

const PLATFORMS = [
    { name: 'darwin-x64', asset: `slskd-${VERSION}-osx-x64.zip`, binary: 'slskd' },
    { name: 'darwin-arm64', asset: `slskd-${VERSION}-osx-arm64.zip`, binary: 'slskd' },
    { name: 'win32-x64', asset: `slskd-${VERSION}-win-x64.zip`, binary: 'slskd.exe' },
    { name: 'linux-x64', asset: `slskd-${VERSION}-linux-x64.zip`, binary: 'slskd' },
];

const RESOURCES_DIR = path.join(process.cwd(), 'resources');

// Helper: Download File
const downloadFile = (url: string, dest: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
};

async function main() {
    console.log(`[Binaries] Downloading slskd v${VERSION}...`);

    for (const plat of PLATFORMS) {
        const platformDir = path.join(RESOURCES_DIR, plat.name);
        const downloadPath = path.join(platformDir, 'download.zip');

        // Create directory
        if (!fs.existsSync(platformDir)) {
            fs.mkdirSync(platformDir, { recursive: true });
        }

        // Skip if already exists
        const finalBinaryPath = path.join(platformDir, plat.binary);
        if (fs.existsSync(finalBinaryPath)) {
            console.log(`[Binaries] ${plat.name} already exists. Skipping.`);
            continue;
        }

        // Download
        const url = `${BASE_URL}/${plat.asset}`;
        console.log(`[Binaries] Downloading for ${plat.name} from ${url}...`);
        try {
            await downloadFile(url, downloadPath);

            // Extract
            console.log(`[Binaries] Extracting ${plat.name}...`);
            // Using tar/unzip based on OS availability. Mac/Linux have unzip. Win might need powershell or node lib.
            // Since dev is on Mac, we can use 'unzip'.
            // For cross-platform dev envs, we might need a library, but strictly for this user (Mac), execSync('unzip') is fine.
            try {
                execSync(`unzip -o "${downloadPath}" -d "${platformDir}"`);
            } catch (e) {
                // Fallback or error
                console.error('Error unzipping. Ensure unzip is available.', e);
                process.exit(1);
            }

            // Cleanup
            fs.unlinkSync(downloadPath);

            // Chmod +x for unix
            if (!plat.name.startsWith('win')) {
                execSync(`chmod +x "${finalBinaryPath}"`);

                // Sign macOS binaries
                if (plat.name.startsWith('darwin')) {
                    console.log(`[Binaries] Signing ${plat.name} with 'soulmate self-sign'...`);
                    try {
                        execSync(`codesign --force --sign "soulmate self-sign" "${finalBinaryPath}"`);
                        console.log(`[Binaries] Successfully signed ${plat.name}`);
                    } catch (signError) {
                        console.error(`[Binaries] Failed to sign ${plat.name}:`, signError);
                    }
                }
            }

            console.log(`[Binaries] ${plat.name} ready.`);

        } catch (error) {
            console.error(`[Binaries] Failed to setup ${plat.name}:`, error);
        }
    }

    console.log('[Binaries] All Done.');
}

main();
