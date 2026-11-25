import { net } from "electron";
import { Playlist, Track } from "../../shared/types";
import log from "../utils/logger";
import { isSafeRemoteUrl } from "../utils/security";
import {
  isBandcampUrl,
  extractBandcampEntity,
  parseBandcampHtml,
} from "../utils/bandcampParser";

interface CachedBandcampData {
  playlist: Playlist;
  tracks: Track[];
  timestamp: number;
}

export class BandcampService {
  private cache = new Map<string, CachedBandcampData>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async getPlaylist(url: string): Promise<Playlist> {
    const trimmed = url.trim();
    if (!isSafeRemoteUrl(trimmed)) {
      throw new Error(`Rejected unsafe Bandcamp URL: ${trimmed}`);
    }
    const entity = extractBandcampEntity(trimmed);
    const cacheKey = entity.slug || trimmed;

    const cached = this.cache.get(cacheKey) || this.cache.get(trimmed);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.playlist;
    }

    let parsedResult: { playlist: Playlist; tracks: Track[] } | null = null;

    try {
      const response = await net.fetch(trimmed, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (response.ok) {
        const html = await response.text();
        parsedResult = parseBandcampHtml(html, trimmed);
      } else {
        throw new Error(
          `Failed to fetch Bandcamp page: ${response.statusText}`,
        );
      }
    } catch (err) {
      log.error(`[BandcampService] Failed to ingest URL ${trimmed}:`, err);
      throw err;
    }

    if (!parsedResult) {
      throw new Error(`Failed to parse Bandcamp release from: ${trimmed}`);
    }

    const entry: CachedBandcampData = {
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

    if (isBandcampUrl(trimmed) || trimmed.startsWith("http")) {
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
