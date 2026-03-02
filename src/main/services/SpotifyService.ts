import { net, BrowserWindow } from 'electron'
import { store } from '../store'
import * as crypto from 'crypto'
import { URL } from 'url'
import { Playlist, Track } from '../../shared/types'
import log from '../utils/logger'

interface SpotifyPaging<T> {
    items: T[];
    next: string | null;
}

export class SpotifyService {
    private clientId: string
    private redirectUri = 'soulmate://callback'
    private codeVerifier: string = ''
    private authWindow: BrowserWindow | null = null
    private loginResolver: ((value: boolean) => void) | null = null
    private isProcessingCallback = false

    constructor() {
        this.clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID || ''
        if (!this.clientId) {
            console.error('[SpotifyService] Missing VITE_SPOTIFY_CLIENT_ID')
        }
    }

    // Generate random string for PKCE
    private generateRandomString(length: number): string {
        let text = ''
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        for (let i = 0; i < length; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length))
        }
        return text
    }

    // Base64 Url Encode
    private base64UrlEncode(str: Buffer): string {
        return str.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')
    }

    // Generate PKCE Challenge
    private async generateCodeChallenge(verifier: string): Promise<string> {
        const data = Buffer.from(verifier)
        const digest = crypto.createHash('sha256').update(data).digest()
        return this.base64UrlEncode(digest)
    }

    async login(): Promise<boolean> {
        this.codeVerifier = this.generateRandomString(128)
        const challenge = await this.generateCodeChallenge(this.codeVerifier)
        const scope = 'user-read-private user-read-email playlist-read-private'

        const args = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            scope: scope,
            redirect_uri: this.redirectUri,
            code_challenge_method: 'S256',
            code_challenge: challenge
        })

        const authUrl = `https://accounts.spotify.com/authorize?${args}`

        // Close existing window if any
        if (this.authWindow) {
            this.authWindow.destroy()
            this.authWindow = null
        }

        return new Promise((resolve) => {
            this.loginResolver = resolve

            this.authWindow = new BrowserWindow({
                width: 800,
                height: 600,
                show: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            })

            const handleUrl = (url: string) => {
                if (url.startsWith('soulmate://')) {
                    // We let handleCallback do the closing and resolving
                    this.handleCallback(url).catch(err => {
                        console.error('[SpotifyService] Error treating url in window:', err);
                    });
                }
            }

            this.authWindow.webContents.on('will-redirect', (_, url) => handleUrl(url))
            this.authWindow.webContents.on('will-navigate', (_, url) => handleUrl(url))

            this.authWindow.on('closed', () => {
                this.authWindow = null
                // If closed by user action (not by handleCallback success), resolve false
                if (this.loginResolver) {
                    this.loginResolver(false)
                    this.loginResolver = null
                }
            })

            this.authWindow.loadURL(authUrl)
        })
    }

    async handleCallback(url: string): Promise<boolean> {
        if (this.isProcessingCallback) {
            console.log('[SpotifyService] Callback already being processed, ignoring duplicate')
            return true
        }
        this.isProcessingCallback = true

        try {
            const urlObj = new URL(url)
            const code = urlObj.searchParams.get('code')

            if (!code) {
                console.error('[SpotifyService] No code in callback URL')
                return false
            }

            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: this.redirectUri,
                client_id: this.clientId,
                code_verifier: this.codeVerifier
            })

            const response = await net.fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
            })

            if (!response.ok) {
                console.error('[SpotifyService] Token exchange failed:', await response.text())
                return false
            }

            const data: any = await response.json()

            store.set('spotify', {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: Date.now() + (data.expires_in * 1000)
            })

            console.log('[SpotifyService] Logged in successfully')

            // Success! Close window and resolve login promise.
            if (this.authWindow) {
                this.authWindow.close() // Triggers 'closed' event, but we handle resolver here first
                this.authWindow = null
            }

            if (this.loginResolver) {
                this.loginResolver(true)
                this.loginResolver = null
            }

            return true

        } catch (e) {
            return false
        } finally {
            this.isProcessingCallback = false
        }
    }

    isAuthenticated(): boolean {
        const token = store.get('spotify.accessToken')
        const expiresAt = store.get('spotify.expiresAt')
        return !!token && !!expiresAt && Date.now() < (expiresAt as number)
    }

    async getAccessToken(): Promise<string | null> {
        if (this.isAuthenticated()) {
            return store.get('spotify.accessToken') as string
        }
        // TODO: Implement Refresh Flow
        return null
    }

    async getPlaylists(): Promise<Playlist[]> {
        const token = await this.getAccessToken()
        if (!token) throw new Error('Not authenticated')

        const response = await net.fetch('https://api.spotify.com/v1/me/playlists', {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) {
            throw new Error(`Failed to fetch playlists: ${response.statusText}`)
        }

        const data = await response.json() as SpotifyPaging<Playlist>
        return data.items
    }

    async getPlaylistTracks(playlistId: string): Promise<Track[]> {
        const token = await this.getAccessToken()
        if (!token) {
            console.log('[SpotifyService] No token, attempting to scrape tracks for:', playlistId)
            return this.scrapePlaylistTracks(playlistId)
        }

        let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`
        let allTracks: any[] = []

        while (url) {
            const response = await net.fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            })

            if (!response.ok) {
                throw new Error(`Failed to fetch tracks: ${response.statusText}`)
            }

            const data: any = await response.json()
            allTracks = allTracks.concat(data.items.map((item: any) => item.track))
            url = data.next
        }

        return allTracks
    }

    async searchPlaylists(query: string): Promise<Playlist[]> {
        const token = await this.getAccessToken()
        if (!token) throw new Error('Not authenticated')

        const response = await net.fetch(`https://api.spotify.com/v1/search?type=playlist&q=${encodeURIComponent(query)}&limit=20`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) {
            throw new Error(`Failed to search playlists: ${response.statusText}`)
        }

        const data = await response.json() as { playlists: SpotifyPaging<Playlist> }
        return data.playlists?.items || []
    }

    async getPlaylist(idOrUrl: string): Promise<Playlist | any> {
        let playlistId = idOrUrl

        // Try to parse as URL
        if (idOrUrl.includes('spotify.com')) {
            try {
                const urlObj = new URL(idOrUrl)
                const pathParts = urlObj.pathname.split('/')
                const typeIndex = pathParts.indexOf('playlist')
                if (typeIndex !== -1 && pathParts[typeIndex + 1]) {
                    playlistId = pathParts[typeIndex + 1]
                }
            } catch (e) {
                console.error('Failed to parse Spotify URL', e)
                // Continue assuming it might be an ID
            }
        }

        const token = await this.getAccessToken()

        // Fallback to scraping if no token
        if (!token) {
            console.log('[SpotifyService] No token, attempting to scrape metadata for:', playlistId)
            return this.scrapePlaylistMetadata(playlistId)
        }

        const response = await net.fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) {
            throw new Error(`Failed to fetch playlist: ${response.statusText}`)
        }

        const data = await response.json() as Playlist
        return data
    }

    async logout(): Promise<void> {
        store.delete('spotify' as any)
        log.info('[SpotifyService] Logged out')
    }

    private async scrapePlaylistMetadata(playlistId: string): Promise<Playlist> {
        try {
            console.log('[SpotifyService] Scraping metadata for:', playlistId)
            const url = `https://open.spotify.com/playlist/${playlistId}`
            const response = await net.fetch(url)
            const html = await response.text()

            // Basic Regex Scraping for Meta Tags
            const titleMatch = html.match(/<meta property="og:title" content="(.*?)"/)
            const imageMatch = html.match(/<meta property="og:image" content="(.*?)"/)
            const descriptionMatch = html.match(/<meta property="og:description" content="(.*?)"/)

            // Extract Track Count from description
            let totalTracks = 0
            if (descriptionMatch && descriptionMatch[1]) {
                const desc = descriptionMatch[1]
                const countMatch = desc.match(/([\d,]+)\s+(songs?|tracks?|items?)/i)
                if (countMatch) {
                    totalTracks = parseInt(countMatch[1].replace(/,/g, ''))
                }
            }

            if (!titleMatch) {
                // If we land on a "You need to log in" page or 404
                throw new Error('Could not parse playlist metadata')
            }

            return {
                id: playlistId,
                name: titleMatch[1],
                images: imageMatch ? [{ url: imageMatch[1] }] : [],
                tracks: { total: totalTracks },
                owner: { display_name: 'Unknown' },
                public: true
            }

        } catch (e) {
            console.error('[SpotifyService] Scraping metadata failed:', e)
            throw new Error('Failed to fetch public playlist metadata')
        }
    }

    private async scrapePlaylistTracks(playlistId: string): Promise<Track[]> {
        console.log('[SpotifyService] Scraping tracks for (legacy):', playlistId)
        try {
            const url = `https://open.spotify.com/playlist/${playlistId}`
            const response = await net.fetch(url)
            const html = await response.text()

            const tracks: any[] = []

            // Look for track links: <a href="/track/ID">Name</a>
            const trackRegex = /<a[^>]+href="\/track\/([a-zA-Z0-9]+)"[^>]*>(.*?)<\/a>/g
            const trackMatches = [...html.matchAll(trackRegex)]

            for (let i = 0; i < trackMatches.length; i++) {
                const match = trackMatches[i]
                const id = match[1]
                // Clean up name (sometimes contains span or div)
                const rawName = match[2].replace(/<[^>]+>/g, '').trim()

                // Try to find artist in the proximity
                // This is rough but worked for the "preview" list
                let artistName = 'Unknown'
                const startIdx = match.index! + match[0].length
                const endIdx = i < trackMatches.length - 1 ? trackMatches[i + 1].index! : html.length
                const chunk = html.substring(startIdx, endIdx)

                const artistMatch = chunk.match(/<a[^>]+href="\/artist\/[^"]+"[^>]*>([\s\S]*?)<\/a>/)
                if (artistMatch) {
                    artistName = artistMatch[1].replace(/<[^>]+>/g, '').trim()
                }

                if (rawName) {
                    tracks.push({
                        id,
                        name: rawName,
                        artists: [{ name: artistName }],
                        album: { name: 'Unknown' },
                        duration_ms: 0
                    })
                }
            }

            // Deduplicate based on ID
            const uniqueTracks = Array.from(new Map(tracks.map((t) => [t.id, t])).values())
            log.info(`[SpotifyService] Scraped ${uniqueTracks.length} tracks (via net.fetch)`)
            return uniqueTracks

        } catch (e) {
            log.error('[SpotifyService] Scraping tracks failed:', e)
            return []
        }
    }
}
