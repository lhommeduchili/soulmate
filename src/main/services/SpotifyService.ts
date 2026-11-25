import { net, BrowserWindow } from "electron";
import { store } from "../store";
import * as crypto from "crypto";
import { URL } from "url";
import { Playlist, Track } from "../../shared/types";
import log from "../utils/logger";
import { PreferencesService } from "./PreferencesService";
import { getMainEnv } from "../config/env";
import {
  parseEmbedHtml,
  parseOpenPageHtml,
  parseAlbumHtml,
  parseTrackHtml,
  parseOembedJson,
  extractSpotifyEntity,
  extractPlaylistId,
  SpotifyEntityInfo,
} from "../utils/spotifyParser";
import { isSoundCloudUrl } from "../utils/soundCloudParser";
import { isBandcampUrl } from "../utils/bandcampParser";
import { SoundCloudService } from "./SoundCloudService";
import { BandcampService } from "./BandcampService";
import { YoutubeService } from "./YoutubeService";
import { decryptSecret, encryptSecret } from "../utils/security";

export { extractPlaylistId, extractSpotifyEntity };

interface SpotifyPaging<T> {
  items: T[];
  next: string | null;
}

interface CachedPlaylistData {
  playlist: Playlist;
  tracks: Track[];
  timestamp: number;
}

export class SpotifyService {
  private clientId: string;
  private redirectUri = "soulmate://callback";
  private codeVerifier = "";
  private oauthState = "";
  private authWindow: BrowserWindow | null = null;
  private loginResolver: ((value: boolean) => void) | null = null;
  private isProcessingCallback = false;
  private preferencesService: PreferencesService;
  private soundCloudService?: SoundCloudService;
  private bandcampService?: BandcampService;
  private youtubeService?: YoutubeService;
  private playlistCache = new Map<string, CachedPlaylistData>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    preferencesService: PreferencesService,
    soundCloudService?: SoundCloudService,
    bandcampService?: BandcampService,
    youtubeService?: YoutubeService,
  ) {
    this.preferencesService = preferencesService;
    this.soundCloudService = soundCloudService;
    this.bandcampService = bandcampService;
    this.youtubeService = youtubeService;
    this.clientId = getMainEnv("VITE_SPOTIFY_CLIENT_ID");
    if (!this.clientId) {
      log.error("[SpotifyService] Missing VITE_SPOTIFY_CLIENT_ID");
    }
  }

  private getMarket(): string {
    return this.preferencesService.getRegion();
  }

  // Cryptographically secure random string for PKCE verifier and OAuth CSRF state
  private generateRandomString(length: number): string {
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.randomBytes(length);
    let text = "";
    for (let i = 0; i < length; i++) {
      text += possible.charAt(bytes[i] % possible.length);
    }
    return text;
  }

  // Base64 Url Encode
  private base64UrlEncode(str: Buffer): string {
    return str
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  // Generate PKCE Challenge
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const data = Buffer.from(verifier);
    const digest = crypto.createHash("sha256").update(data).digest();
    return this.base64UrlEncode(digest);
  }

  async login(): Promise<boolean> {
    if (!this.clientId) {
      throw new Error(
        "Spotify is not configured in this build (missing VITE_SPOTIFY_CLIENT_ID).",
      );
    }

    this.codeVerifier = this.generateRandomString(128);
    this.oauthState = this.generateRandomString(32);
    const challenge = await this.generateCodeChallenge(this.codeVerifier);
    const scope = "user-read-private user-read-email playlist-read-private";

    const args = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      scope: scope,
      redirect_uri: this.redirectUri,
      state: this.oauthState,
      code_challenge_method: "S256",
      code_challenge: challenge,
    });

    const authUrl = `https://accounts.spotify.com/authorize?${args}`;

    // Close existing window if any
    if (this.authWindow) {
      this.authWindow.destroy();
      this.authWindow = null;
    }

    return new Promise((resolve) => {
      this.loginResolver = resolve;

      this.authWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: true,
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });

      this.authWindow.webContents.setWindowOpenHandler(() => ({
        action: "deny",
      }));

      const handleUrl = (event: Electron.Event, url: string) => {
        if (url.startsWith("soulmate://")) {
          event.preventDefault();
          // We let handleCallback do the closing and resolving
          this.handleCallback(url).catch((err) => {
            log.error("[SpotifyService] Error treating url in window:", err);
          });
        }
      };

      this.authWindow.webContents.on("will-redirect", (event, url) =>
        handleUrl(event, url),
      );
      this.authWindow.webContents.on("will-navigate", (event, url) =>
        handleUrl(event, url),
      );

      this.authWindow.on("closed", () => {
        this.authWindow = null;
        // If closed by user action (not by handleCallback success), resolve false
        if (this.loginResolver) {
          this.loginResolver(false);
          this.loginResolver = null;
        }
      });

      this.authWindow.loadURL(authUrl);
    });
  }

  async handleCallback(url: string): Promise<boolean> {
    if (this.isProcessingCallback) {
      console.log(
        "[SpotifyService] Callback already being processed, ignoring duplicate",
      );
      return true;
    }
    this.isProcessingCallback = true;

    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== "soulmate:") {
        log.warn("[SpotifyService] Rejected non-soulmate callback URL");
        return false;
      }

      const code = urlObj.searchParams.get("code");
      const returnedState = urlObj.searchParams.get("state");

      if (!code) {
        log.error("[SpotifyService] No code in callback URL");
        return false;
      }

      if (
        !this.oauthState ||
        !this.codeVerifier ||
        returnedState !== this.oauthState
      ) {
        log.warn(
          "[SpotifyService] OAuth state mismatch or unsolicited callback rejected",
        );
        return false;
      }

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        code_verifier: this.codeVerifier,
      });

      const response = await net.fetch(
        "https://accounts.spotify.com/api/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        },
      );

      if (!response.ok) {
        log.error(
          `[SpotifyService] Token exchange failed with HTTP ${response.status}`,
        );
        return false;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      store.set("spotify", {
        accessToken: encryptSecret(data.access_token),
        refreshToken: data.refresh_token
          ? encryptSecret(data.refresh_token)
          : undefined,
        expiresAt: Date.now() + data.expires_in * 1000,
      });

      this.oauthState = "";
      this.codeVerifier = "";
      log.info("[SpotifyService] Logged in successfully");

      // Success! Close window and resolve login promise.
      if (this.authWindow) {
        this.authWindow.close();
        this.authWindow = null;
      }

      if (this.loginResolver) {
        this.loginResolver(true);
        this.loginResolver = null;
      }

      return true;
    } catch {
      return false;
    } finally {
      this.isProcessingCallback = false;
    }
  }

  isAuthenticated(): boolean {
    const token = decryptSecret(
      store.get("spotify.accessToken") as string | undefined,
    );
    const expiresAt = store.get("spotify.expiresAt");
    return !!token && !!expiresAt && Date.now() < (expiresAt as number);
  }

  async getAccessToken(): Promise<string | null> {
    if (this.isAuthenticated()) {
      return (
        decryptSecret(store.get("spotify.accessToken") as string | undefined) ||
        null
      );
    }
    return null;
  }

  async getPlaylists(): Promise<Playlist[]> {
    const token = await this.getAccessToken();
    if (!token) throw new Error("Not authenticated");

    const market = this.getMarket();
    const response = await net.fetch(
      `https://api.spotify.com/v1/me/playlists?market=${encodeURIComponent(market)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch playlists: ${response.statusText}`);
    }

    const data = (await response.json()) as SpotifyPaging<Playlist>;
    return data.items;
  }

  async searchPlaylists(query: string): Promise<Playlist[]> {
    const token = await this.getAccessToken();
    if (!token) throw new Error("Not authenticated");

    const market = this.getMarket();
    const response = await net.fetch(
      `https://api.spotify.com/v1/search?type=playlist&q=${encodeURIComponent(query)}&limit=20&market=${encodeURIComponent(market)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to search playlists: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      playlists: SpotifyPaging<Playlist>;
    };
    return data.playlists?.items || [];
  }

  async getPlaylist(idOrUrl: string): Promise<Playlist> {
    const trimmed = idOrUrl.trim();

    // Dynamic URL routing based on platform domain
    if (isSoundCloudUrl(trimmed)) {
      const sc = this.soundCloudService || new SoundCloudService();
      return sc.getPlaylist(trimmed);
    }
    if (isBandcampUrl(trimmed)) {
      const bc = this.bandcampService || new BandcampService();
      return bc.getPlaylist(trimmed);
    }
    if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
      const yt = this.youtubeService || new YoutubeService();
      const pl = await yt.getPlaylist(trimmed);
      if (!pl) throw new Error(`Failed to ingest YouTube URL: ${trimmed}`);
      return pl;
    }

    const entity = extractSpotifyEntity(idOrUrl);
    const cached =
      this.playlistCache.get(entity.id) ||
      this.playlistCache.get(`${entity.type}:${entity.id}`) ||
      this.playlistCache.get(idOrUrl);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.playlist;
    }

    const token = await this.getAccessToken();

    // If authenticated, attempt Web API first
    if (token) {
      try {
        const market = this.getMarket();
        const endpoint =
          entity.type === "album"
            ? `https://api.spotify.com/v1/albums/${entity.id}?market=${encodeURIComponent(market)}`
            : entity.type === "track"
              ? `https://api.spotify.com/v1/tracks/${entity.id}?market=${encodeURIComponent(market)}`
              : `https://api.spotify.com/v1/playlists/${entity.id}?market=${encodeURIComponent(market)}`;

        const response = await net.fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          if (entity.type === "playlist") {
            const data = (await response.json()) as Playlist;
            return data;
          }
        }
      } catch (err) {
        log.warn(
          `[SpotifyService] Authenticated ${entity.type} fetch failed, falling back to public cascade:`,
          err,
        );
      }
    }

    // Zero-Login Multi-Tier Public Cascade
    const { playlist } = await this.fetchPublicEntityCascade(entity);
    return playlist;
  }

  async getPlaylistTracks(idOrUrl: string): Promise<Track[]> {
    const trimmed = idOrUrl.trim();

    // Dynamic URL routing based on platform domain
    if (isSoundCloudUrl(trimmed)) {
      const sc = this.soundCloudService || new SoundCloudService();
      return sc.getTracks(trimmed);
    }
    if (isBandcampUrl(trimmed)) {
      const bc = this.bandcampService || new BandcampService();
      return bc.getTracks(trimmed);
    }
    if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
      const yt = this.youtubeService || new YoutubeService();
      return yt.getPlaylistTracks(trimmed);
    }

    const entity = extractSpotifyEntity(idOrUrl);
    const cached =
      this.playlistCache.get(entity.id) ||
      this.playlistCache.get(`${entity.type}:${entity.id}`) ||
      this.playlistCache.get(idOrUrl);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.tracks;
    }

    const token = await this.getAccessToken();

    // If authenticated, attempt Web API first for playlists
    if (token && entity.type === "playlist") {
      try {
        const market = this.getMarket();
        let url: string | null =
          `https://api.spotify.com/v1/playlists/${entity.id}/tracks?limit=100&market=${encodeURIComponent(market)}`;
        let allTracks: Track[] = [];

        while (url) {
          const response = await net.fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch tracks: ${response.statusText}`);
          }

          const data = (await response.json()) as {
            items: Array<{ track: Track }>;
            next: string | null;
          };
          allTracks = allTracks.concat(
            data.items
              .filter((item) => Boolean(item?.track))
              .map((item) => ({
                ...item.track,
                image: item.track.image || item.track.album?.images?.[0]?.url,
              })),
          );
          url = data.next;
        }

        return allTracks;
      } catch (err) {
        log.warn(
          "[SpotifyService] Authenticated tracks fetch failed, falling back to public cascade:",
          err,
        );
      }
    }

    // Zero-Login Multi-Tier Public Cascade
    const { tracks } = await this.fetchPublicEntityCascade(entity);
    return tracks;
  }

  async logout(): Promise<void> {
    store.set("spotify", {});
    log.info("[SpotifyService] Logged out");
  }

  /**
   * Zero-Login Multi-Tier Public Cascade
   * Tier 1 (Embed): open.spotify.com/embed/:type/:id -> parseEmbedHtml / parseAlbumHtml / parseTrackHtml
   * Tier 2 (Open Page): open.spotify.com/:type/:id -> parseOpenPageHtml / parseAlbumHtml / parseTrackHtml
   * Tier 3 (oEmbed): open.spotify.com/oembed -> parseOembedJson
   */
  private async fetchPublicEntityCascade(
    entity: SpotifyEntityInfo,
  ): Promise<{ playlist: Playlist; tracks: Track[] }> {
    const { type, id: entityId } = entity;
    // 1. Check memory cache
    const cached =
      this.playlistCache.get(entityId) ||
      this.playlistCache.get(`${type}:${entityId}`);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return { playlist: cached.playlist, tracks: cached.tracks };
    }

    let extractedPlaylist: Partial<Playlist> | null = null;
    let extractedTracks: Track[] = [];
    let tier1Succeeded = false;

    // 2. Tier 1: Embed endpoint
    const embedUrl = `https://open.spotify.com/embed/${type}/${entityId}`;
    try {
      const embedRes = await net.fetch(embedUrl);
      if (embedRes.ok) {
        const html = await embedRes.text();
        const parsed =
          type === "album"
            ? parseAlbumHtml(html, entityId)
            : type === "track"
              ? parseTrackHtml(html, entityId)
              : parseEmbedHtml(html);
        if (parsed) {
          extractedPlaylist = parsed.playlist;
          extractedTracks = parsed.tracks;
          if (extractedTracks.length > 0) {
            tier1Succeeded = true;
          }
        }
      }
    } catch (err) {
      log.warn(
        `[SpotifyService] Tier 1 (Embed) fetch failed for ${type} ${entityId}:`,
        err,
      );
    }

    // 3. Tier 2: Open Page fallback (if Tier 1 failed or returned 0 tracks)
    if (!tier1Succeeded) {
      const openUrl = `https://open.spotify.com/${type}/${entityId}`;
      try {
        const openRes = await net.fetch(openUrl);
        if (openRes.ok) {
          const html = await openRes.text();
          const parsed =
            type === "album"
              ? parseAlbumHtml(html, entityId)
              : type === "track"
                ? parseTrackHtml(html, entityId)
                : parseOpenPageHtml(html, entityId);
          if (parsed) {
            if (parsed.tracks.length > 0) {
              extractedTracks = parsed.tracks;
            }
            if (parsed.playlist) {
              extractedPlaylist = {
                ...(extractedPlaylist || {}),
                ...parsed.playlist,
              };
            }
          }
        }
      } catch (err) {
        log.warn(
          `[SpotifyService] Tier 2 (Open Page) fetch failed for ${type} ${entityId}:`,
          err,
        );
      }
    }

    // 4. Tier 3: oEmbed fallback (if metadata is missing or partial)
    const isMetadataIncomplete =
      !extractedPlaylist ||
      !extractedPlaylist.name ||
      extractedPlaylist.name === "Spotify Playlist" ||
      !extractedPlaylist.images ||
      extractedPlaylist.images.length === 0 ||
      !extractedPlaylist.owner?.display_name ||
      extractedPlaylist.owner.display_name === "Unknown" ||
      extractedPlaylist.owner.display_name === "Spotify";

    if (isMetadataIncomplete) {
      const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${type}/${entityId}`)}`;
      try {
        const oembedRes = await net.fetch(oembedUrl);
        if (oembedRes.ok) {
          const oembedData = (await oembedRes.json()) as Record<
            string,
            unknown
          >;
          const oembedPlaylist = parseOembedJson(oembedData, entityId);

          const currentOwner = extractedPlaylist?.owner?.display_name;
          const oembedOwner = oembedPlaylist.owner?.display_name;
          const resolvedOwner =
            currentOwner &&
            currentOwner !== "Unknown" &&
            currentOwner !== "Spotify"
              ? currentOwner
              : oembedOwner || currentOwner || "Spotify";

          const currentName = extractedPlaylist?.name;
          const resolvedName =
            currentName && currentName !== "Spotify Playlist"
              ? currentName
              : oembedPlaylist.name || currentName || "Spotify Playlist";

          extractedPlaylist = {
            id: entityId,
            name: resolvedName,
            description:
              extractedPlaylist?.description || oembedPlaylist.description,
            images:
              extractedPlaylist?.images && extractedPlaylist.images.length > 0
                ? extractedPlaylist.images
                : oembedPlaylist.images || [],
            tracks: {
              total:
                extractedPlaylist?.tracks?.total ||
                oembedPlaylist.tracks?.total ||
                extractedTracks.length,
            },
            owner: {
              display_name: resolvedOwner,
            },
            public: true,
            type: "spotify",
          };
        }
      } catch (err) {
        log.warn(
          `[SpotifyService] Tier 3 (oEmbed) fetch failed for ${type} ${entityId}:`,
          err,
        );
      }
    }

    // 5. If all tiers failed or no playlist metadata found
    if (!extractedPlaylist && extractedTracks.length === 0) {
      throw new Error(
        `Failed to fetch public ${type}: ${type} ${entityId} is unreachable or not found`,
      );
    }

    const defaultTitle =
      type === "album"
        ? "Spotify Album"
        : type === "track"
          ? "Spotify Track"
          : "Spotify Playlist";

    const finalPlaylist: Playlist = {
      id: extractedPlaylist?.id || entityId,
      name: extractedPlaylist?.name || defaultTitle,
      description: extractedPlaylist?.description,
      images: extractedPlaylist?.images || [],
      tracks: {
        total: extractedPlaylist?.tracks?.total ?? extractedTracks.length,
      },
      owner: {
        display_name: extractedPlaylist?.owner?.display_name || "Spotify",
      },
      public: true,
      type: "spotify",
      original_url: `https://open.spotify.com/${type}/${entityId}`,
    };

    const fallbackCoverUrl = finalPlaylist.images?.[0]?.url;
    const hydratedTracks = extractedTracks.map((track) => {
      const resolvedImage =
        track.image || track.album?.images?.[0]?.url || fallbackCoverUrl;
      return resolvedImage && !track.image
        ? { ...track, image: resolvedImage }
        : track;
    });

    const result = {
      playlist: finalPlaylist,
      tracks: hydratedTracks,
      timestamp: Date.now(),
    };

    this.playlistCache.set(entityId, result);
    this.playlistCache.set(`${type}:${entityId}`, result);
    this.playlistCache.set(
      `https://open.spotify.com/${type}/${entityId}`,
      result,
    );

    return { playlist: finalPlaylist, tracks: hydratedTracks };
  }
}
