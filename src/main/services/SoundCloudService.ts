import { net } from "electron";
import { Playlist, Track } from "../../shared/types";
import log from "../utils/logger";
import { isSafeRemoteUrl } from "../utils/security";
import {
  isSoundCloudUrl,
  extractSoundCloudEntity,
  parseSoundCloudHtml,
  parseSoundCloudOEmbed,
} from "../utils/soundCloudParser";

interface CachedSoundCloudData {
  playlist: Playlist;
  tracks: Track[];
  timestamp: number;
}

export class SoundCloudService {
  private cache = new Map<string, CachedSoundCloudData>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async getPlaylist(url: string): Promise<Playlist> {
    const trimmed = url.trim();
    if (!isSafeRemoteUrl(trimmed)) {
      throw new Error(`Rejected unsafe SoundCloud URL: ${trimmed}`);
    }
    const entity = extractSoundCloudEntity(trimmed);
    const cacheKey = entity.slug || trimmed;

    const cached = this.cache.get(cacheKey) || this.cache.get(trimmed);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.playlist;
    }

    let parsedResult: { playlist: Playlist; tracks: Track[] } | null = null;

    // 1. Attempt page HTML fetch & parse
    try {
      const response = await net.fetch(trimmed, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (response.ok) {
        const html = await response.text();
        parsedResult = parseSoundCloudHtml(html, trimmed);
      }
    } catch (err) {
      log.warn(`[SoundCloudService] HTML fetch failed for ${trimmed}:`, err);
    }

    // 2. Fallback to public oEmbed
    if (!parsedResult || parsedResult.tracks.length === 0) {
      try {
        const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(trimmed)}`;
        const oembedRes = await net.fetch(oembedUrl);
        if (oembedRes.ok) {
          const json = (await oembedRes.json()) as unknown;
          parsedResult = parseSoundCloudOEmbed(json, trimmed);
        }
      } catch (err) {
        log.warn(
          `[SoundCloudService] oEmbed fallback failed for ${trimmed}:`,
          err,
        );
      }
    }

    if (!parsedResult) {
      throw new Error(`Failed to ingest SoundCloud URL: ${trimmed}`);
    }

    const entry: CachedSoundCloudData = {
      playlist: parsedResult.playlist,
      tracks: parsedResult.tracks,
      timestamp: Date.now(),
    };

    this.cache.set(cacheKey, entry);
    this.cache.set(parsedResult.playlist.id, entry);
    this.cache.set(trimmed, entry);

    return parsedResult.playlist;
  }

  async getTracks(playlistIdOrUrl: string): Promise<Track[]> {
    const trimmed = playlistIdOrUrl.trim();
    const cached = this.cache.get(trimmed);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.tracks;
    }

    if (isSoundCloudUrl(trimmed) || trimmed.startsWith("http")) {
      await this.getPlaylist(trimmed);
      const freshlyCached = this.cache.get(trimmed);
      if (freshlyCached) return freshlyCached.tracks;
    }

    for (const val of this.cache.values()) {
      if (val.playlist.id === trimmed) {
        return val.tracks;
      }
    }

    return [];
  }
}
