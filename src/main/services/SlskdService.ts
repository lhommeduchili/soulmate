import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import { join } from 'path'
import { app } from 'electron'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { createServer } from 'net'
import { store } from '../store'
import log from '../utils/logger'

export class SlskdService {
    private child: ChildProcess | null = null

    private port: number = 0
    private apiKey: string = ''

    private async ensureCleanSlate(): Promise<void> {
        log.info('[SlskdService] Ensuring clean slate (killing zombies)...')
        return new Promise((resolve) => {
            const platform = process.platform
            let command = ''

            if (platform === 'win32') {
                command = 'taskkill /F /IM slskd.exe'
            } else {
                // Use -x to match exact process name if possible, but -f match full arg list is safer for our 'slskd'
                // However, we want to avoid killing OURSELVES if we were named slskd (we are electron)
                // We want to kill the binary 'slskd'.
                // 'pkill -x slskd' kills processes named exactly slskd.
                command = 'pkill -9 -f slskd'
            }

            const killer = spawn(command, { shell: true, stdio: 'ignore' })

            killer.on('exit', () => {
                setTimeout(resolve, 1000)
            })

            killer.on('error', () => {
                resolve()
            })
        })
    }

    async start(): Promise<void> {
        await this.ensureCleanSlate()

        let binaryPath: string
        const binaryName = process.platform === 'win32' ? 'slskd.exe' : 'slskd'

        if (app.isPackaged) {
            binaryPath = join(process.resourcesPath, binaryName)
        } else {
            const platform = process.platform
            const arch = process.arch
            const resourceDir = join(__dirname, '../../resources', `${platform}-${arch}`)
            binaryPath = join(resourceDir, binaryName)

            if (!fs.existsSync(binaryPath)) {
                log.info(`[SlskdService] Platform binary not found at ${binaryPath}, checking root resources...`)
                binaryPath = join(__dirname, '../../resources', binaryName)
            }
        }
        const userDataPath = app.getPath('userData')
        const configPath = join(userDataPath, 'slskd.yml')

        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true })
        }

        // 1. Generate Config
        // Find distinct ports for Web (TCP) and P2P (TCP+UDP)
        this.port = await this.findAvailablePort(false) // Web only needs TCP
        let p2pPort = await this.findAvailablePort(true) // P2P needs TCP+UDP

        // Ensure they are unique
        while (p2pPort === this.port) {
            p2pPort = await this.findAvailablePort(true)
        }

        this.apiKey = crypto.randomBytes(16).toString('hex')

        // 1b. Get or Create Credentials
        let user = store.get('soulseek.username')
        let pass = store.get('soulseek.password')

        if (!user || !pass) {
            const randomSuffix = crypto.randomBytes(4).toString('hex')
            user = `soulmate_user_${randomSuffix}`
            pass = crypto.randomBytes(12).toString('hex')

            store.set('soulseek.username', user)
            store.set('soulseek.password', pass)
            log.info(`[SlskdService] Created new Soulseek credentials for: ${user}`)
        }

        // 2. Resolve Download Directory
        let downloadDir = store.get('preferences.downloadPath') as string
        if (!downloadDir) {
            downloadDir = join(app.getPath('downloads'), 'soulmate downloads')
            store.set('preferences.downloadPath', downloadDir)
        }

        // Ensure download dir exists
        if (!fs.existsSync(downloadDir)) {
            try {
                fs.mkdirSync(downloadDir, { recursive: true })
            } catch (err) {
                log.error(`[SlskdService] Failed to create download dir: ${downloadDir}`, err)
            }
        }

        // Escape backslashes for YAML string
        const yamlPath = downloadDir.replace(/\\/g, '\\\\')

        const configContent = `
web:
  port: ${this.port}
  authentication:
    api_key: "${this.apiKey}"
soulseek:
  username: "${user}"
  password: "${pass}"
  listen_port: ${p2pPort}
directories:
  downloads: "${yamlPath}"
`

        fs.writeFileSync(configPath, configContent, 'utf8')
        log.info(`[SlskdService] Config written to: ${configPath}`)
        log.info(`[SlskdService] Starting slskd from: ${binaryPath} on WebPort ${this.port}, P2PPort ${p2pPort}`)

        // Explicitly resolve wwwroot path
        const wwwRootPath = join(path.dirname(binaryPath), 'wwwroot')

        // Ensure binary is executable (macOS/Linux) and remove quarantine (macOS)
        if (process.platform !== 'win32') {
            try {
                // chmod first
                fs.chmodSync(binaryPath, '755')
                console.log('[SlskdService] Set executable permissions on binary')

                if (process.platform === 'darwin') {
                    // Remove quarantine attribute if present from binary AND wwwroot
                    try {
                        require('child_process').execSync(`xattr -d -r com.apple.quarantine "${binaryPath}"`, { stdio: 'ignore' })
                        require('child_process').execSync(`xattr -d -r com.apple.quarantine "${wwwRootPath}"`, { stdio: 'ignore' })
                        console.log('[SlskdService] Removed quarantine attributes')
                    } catch (e) {
                        // Ignore, attribute might not exist
                    }

                    // Also chmod wwwroot just in case
                    try {
                        require('child_process').execSync(`chmod -R 755 "${wwwRootPath}"`, { stdio: 'ignore' })
                    } catch { }
                }

            } catch (e) {
                log.warn('[SlskdService] Failed to set permissions:', e)
            }
        }

        try {
            this.child = spawn(binaryPath, [], {
                env: {
                    ...process.env,
                    SLSKD_CONFIG_FILE: configPath,
                    SLSKD_APP_DIR: userDataPath,
                    // Explicitly tell slskd where the web assets are
                    SLSKD_WEB__CONTENTPATH: wwwRootPath
                }
            })

            if (this.child.stdout) {
                this.child.stdout.on('data', (d) => log.info(`[Slskd] ${d}`))
            }
            if (this.child.stderr) {
                this.child.stderr.on('data', (d) => log.error(`[Slskd Error] ${d}`))
            }

            this.child.on('error', (err) => {
                log.error('[SlskdService] Failed to spawn slskd:', err)
            })

            this.child.on('exit', (code) => {
                log.info(`[SlskdService] Process exited with code ${code}`)
                this.child = null
            })
        } catch (error) {
            log.error('[SlskdService] Error starting service:', error)
        }
    }

    private async findAvailablePort(checkUdp: boolean): Promise<number> {
        // Try up to 5 times to find a suitable port
        for (let i = 0; i < 5; i++) {
            try {
                const port = await this.getFreeTcpPort()
                if (checkUdp) {
                    const udpFree = await this.isUdpPortFree(port)
                    if (udpFree) return port
                } else {
                    return port
                }
            } catch (e) {
                log.warn('[SlskdService] Port check failed, retrying...', e)
            }
        }
        throw new Error('Could not find available port')
    }

    private getFreeTcpPort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = createServer()
            server.unref()
            server.on('error', reject)
            // Listen on 0.0.0.0 to ensure IPv4 availability
            server.listen(0, '0.0.0.0', () => {
                const address = server.address()
                const port = typeof address === 'string' ? 0 : address?.port || 0
                server.close(() => {
                    resolve(port)
                })
            })
        })
    }

    private isUdpPortFree(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const dgram = require('dgram')
            const socket = dgram.createSocket('udp4')
            socket.on('error', () => {
                socket.close()
                resolve(false)
            })
            socket.bind(port, '0.0.0.0', () => {
                socket.close()
                resolve(true)
            })
        })
    }

    stop(): void {
        if (this.child) {
            log.info('[SlskdService] Stopping process...')
            this.child.kill()
            this.child = null
        }
    }

    getApiConfig(): { port: number; apiKey: string } {
        return { port: this.port, apiKey: this.apiKey }
    }
}
