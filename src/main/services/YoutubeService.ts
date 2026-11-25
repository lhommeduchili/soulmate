import { net } from "electron";
import { Playlist, Track } from "../../shared/types";
import log from "../utils/logger";

interface YoutubeThumbnail {
  url?: string;
  width?: number;
  height?: number;
}

interface YoutubeTextRun {
  text?: string;
}

interface YoutubeTextRuns {
  runs?: YoutubeTextRun[];
  simpleText?: string;
}

interface YoutubePlaylistRenderer {
  videoId?: string;
  title?: YoutubeTextRuns;
  shortBylineText?: YoutubeTextRuns;
  lengthSeconds?: string;
  thumbnail?: {
    thumbnails?: YoutubeThumbnail[];
  };
}

interface YoutubePlaylistItem {
  playlistVideoRenderer?: YoutubePlaylistRenderer;
}

interface YoutubeTab {
  tabRenderer?: {
    selected?: boolean;
    content?: {
      sectionListRenderer?: {
        contents?: Array<{
          itemSectionRenderer?: {
            contents?: Array<{
              playlistVideoListRenderer?: {
                contents?: YoutubePlaylistItem[];
              };
            }>;
          };
        }>;
      };
    };
  };
}

interface YoutubeInitialData {
  microformat?: {
    microformatDataRenderer?: {
      title?: string;
      description?: string;
      uploadDate?: string;
      thumbnail?: {
        thumbnails?: YoutubeThumbnail[];
      };
    };
    playerMicroformatRenderer?: {
      title?: YoutubeTextRuns;
      description?: YoutubeTextRuns;
      ownerChannelName?: string;
      lengthSeconds?: string;
      thumbnail?: {
        thumbnails?: YoutubeThumbnail[];
      };
    };
  };
  header?: {
    playlistHeaderRenderer?: {
      playlistId?: string;
      title?: YoutubeTextRuns;
      ownerText?: YoutubeTextRuns;
      numVideosText?: YoutubeTextRuns;
      playlistHeaderBanner?: {
        thumbnails?: YoutubeThumbnail[];
        heroPlaylistThumbnailRenderer?: {
          thumbnail?: {
            thumbnails?: YoutubeThumbnail[];
          };
        };
      };
    };
  };
  contents?: {
    twoColumnBrowseResultsRenderer?: {
      tabs?: YoutubeTab[];
    };
  };
  sidebar?: unknown;
}

/**
 * Extracts an 11-character YouTube video ID from various video URL formats:
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://m.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://youtu.be/dQw4w9WgXcQ
 * - https://www.youtube.com/embed/dQw4w9WgXcQ
 * - https://www.youtube.com/v/dQw4w9WgXcQ
 * - Raw 11-char video ID (e.g., dQw4w9WgXcQ)
 */
export function extractYoutubeVideoId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // If it is a playlist-only URL (contains playlist?list=), do not treat as single video
  if (trimmed.includes("playlist?list=")) return null;

  // Short URL: youtu.be/:id
  const shortMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
  );
  if (shortMatch && shortMatch[1]) return shortMatch[1];

  // Watch URL: watch?v=:id
  const vMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (vMatch && vMatch[1]) return vMatch[1];

  // Embed or /v/ URL: (?:embed|v)/:id
  const embedMatch = trimmed.match(/(?:embed|v)\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch && embedMatch[1]) return embedMatch[1];

  // Raw 11-char video ID (excluding playlist prefixes PL, UU, LL, FL, RD)
  if (
    /^[a-zA-Z0-9_-]{11}$/.test(trimmed) &&
    !trimmed.startsWith("PL") &&
    !trimmed.startsWith("UU") &&
    !trimmed.startsWith("LL")
  ) {
    return trimmed;
  }

  return null;
}

export class YoutubeService {
  private videoCache = new Map<
    string,
    { playlist: Playlist; tracks: Track[] }
  >();

  constructor() {}

  private async fetchPage(url: string): Promise<string> {
    const response = await net.fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    return await response.text();
  }

  private extractYtData(html: string): YoutubeInitialData | null {
    try {
      const startToken = "var ytInitialData = ";
      const startIdx = html.indexOf(startToken);
      if (startIdx === -1) return null;

      const endToken = ";</script>";
      let endIdx = html.indexOf(endToken, startIdx);
      if (endIdx === -1) {
        endIdx = html.indexOf(";", startIdx + startToken.length);
      }

      if (endIdx === -1) return null;

      const jsonStr = html.substring(startIdx + startToken.length, endIdx);
      return JSON.parse(jsonStr) as YoutubeInitialData;
    } catch (e) {
      log.error("[YoutubeService] Failed to parse ytInitialData", e);
      return null;
    }
  }

  async getVideo(
    videoId: string,
    originalUrl?: string,
  ): Promise<Playlist | null> {
    const cached = this.videoCache.get(videoId);
    if (cached) {
      return cached.playlist;
    }

    const targetUrl =
      originalUrl || `https://www.youtube.com/watch?v=${videoId}`;
    let title = "YouTube Video";
    let author = "Unknown";
    let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    let duration_ms = 0;
    let description = "";

    // 1. Try public oEmbed endpoint
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
      const res = await net.fetch(oembedUrl);
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        if (data.title) title = data.title;
        if (data.author_name) author = data.author_name;
        if (data.thumbnail_url) thumbnail = data.thumbnail_url;
      }
    } catch (err) {
      log.warn(
        `[YoutubeService] oEmbed fetch failed for video ${videoId}:`,
        err,
      );
    }

    // 2. Try fetching watch page if needed
    if (title === "YouTube Video" || duration_ms === 0) {
      try {
        const html = await this.fetchPage(
          `https://www.youtube.com/watch?v=${videoId}`,
        );
        const data = this.extractYtData(html);
        if (data) {
          const microformat = data.microformat?.playerMicroformatRenderer;
          if (microformat) {
            if (microformat.title?.simpleText && title === "YouTube Video") {
              title = microformat.title.simpleText;
            }
            if (microformat.ownerChannelName && author === "Unknown") {
              author = microformat.ownerChannelName;
            }
            if (microformat.lengthSeconds) {
              duration_ms = parseInt(microformat.lengthSeconds, 10) * 1000;
            }
            if (microformat.description?.simpleText) {
              description = microformat.description.simpleText;
            }
          }
        }
      } catch {
        // Fallback info from oEmbed is sufficient
      }
    }

    const { artist, name } = this.parseTrackInfo(title, author);

    const singleTrack: Track = {
      id: videoId,
      name,
      artists: [{ name: artist }],
      album: { name: "Unknown" },
      duration_ms,
      image: thumbnail,
      is_youtube: true,
    };

    const playlist: Playlist = {
      id: videoId,
      name: title,
      description: description || `Video by ${author}`,
      images: [{ url: thumbnail }],
      tracks: { total: 1 },
      owner: { display_name: author },
      public: true,
      type: "youtube",
      original_url: targetUrl,
    };

    this.videoCache.set(videoId, { playlist, tracks: [singleTrack] });

    return playlist;
  }

  async getPlaylist(url: string): Promise<Playlist | null> {
    try {
      // Check if URL represents a single video
      const singleVideoId = extractYoutubeVideoId(url);
      if (singleVideoId) {
        return await this.getVideo(singleVideoId, url);
      }

      // If passed playlist ID or link, construct URL
      let targetUrl = url;
      if (!url.startsWith("http")) {
        targetUrl = `https://www.youtube.com/playlist?list=${url}`;
      }

      const html = await this.fetchPage(targetUrl);
      const data = this.extractYtData(html);

      if (!data) {
        log.error("[YoutubeService] No data found");
        return null;
      }

      // Extract Metadata
      const microformat = data.microformat?.microformatDataRenderer;
      const header = data.header?.playlistHeaderRenderer;

      const title =
        microformat?.title || header?.title?.simpleText || "YouTube Playlist";
      const author = microformat?.uploadDate
        ? header?.ownerText?.runs?.[0]?.text || "Unknown"
        : "Unknown";

      let thumbnail =
        microformat?.thumbnail?.thumbnails?.[0]?.url ||
        header?.playlistHeaderBanner?.thumbnails?.[0]?.url ||
        header?.playlistHeaderBanner?.heroPlaylistThumbnailRenderer?.thumbnail
          ?.thumbnails?.[0]?.url ||
        "";

      // If still no thumbnail, try to find it from the first video in the list
      if (!thumbnail) {
        const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
        const tab = tabs?.find((t) => t.tabRenderer?.selected) || tabs?.[0];
        const contents =
          tab?.tabRenderer?.content?.sectionListRenderer?.contents;
        const videoList =
          contents?.[0]?.itemSectionRenderer?.contents?.[0]
            ?.playlistVideoListRenderer?.contents;
        if (videoList && videoList.length > 0) {
          thumbnail =
            videoList[0]?.playlistVideoRenderer?.thumbnail?.thumbnails?.[0]
              ?.url || "";
        }
      }

      // Clean the thumbnail URL
      if (thumbnail && thumbnail.includes("?")) {
        thumbnail = thumbnail.split("?")[0];
      }

      const description = microformat?.description || "";

      // Track count
      let totalTracks = 0;

      if (header?.numVideosText?.runs?.[0]?.text) {
        totalTracks = parseInt(
          header.numVideosText.runs[0].text.replace(/[^0-9]/g, ""),
          10,
        );
      }

      // Fallback: Count from `contents` directly if available in initial data
      if (totalTracks === 0) {
        const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
        const tab = tabs?.find((t) => t.tabRenderer?.selected) || tabs?.[0];
        const contents =
          tab?.tabRenderer?.content?.sectionListRenderer?.contents;
        const videoListRenderer =
          contents?.[0]?.itemSectionRenderer?.contents?.[0]
            ?.playlistVideoListRenderer;
        if (videoListRenderer?.contents) {
          totalTracks = videoListRenderer.contents.length;
        }
      }

      // ID
      const id =
        header?.playlistId ||
        url.match(/[?&]list=([^#\&\?]+)/)?.[1] ||
        "unknown";

      return {
        id,
        name: title,
        description,
        images: [{ url: thumbnail }],
        tracks: { total: totalTracks },
        owner: { display_name: author },
        public: true,
        type: "youtube",
        original_url: targetUrl,
      };
    } catch (e) {
      log.error("[YoutubeService] Failed to fetch playlist:", e);
      return null;
    }
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    try {
      // 1. Check memory cache for single video
      const cached = this.videoCache.get(playlistId);
      if (cached) {
        return cached.tracks;
      }

      // 2. Check if playlistId is a single video ID
      const singleVideoId = extractYoutubeVideoId(playlistId);
      if (singleVideoId) {
        const videoPlaylist = await this.getVideo(singleVideoId);
        if (videoPlaylist) {
          const cachedVideo = this.videoCache.get(singleVideoId);
          if (cachedVideo) {
            return cachedVideo.tracks;
          }
        }
      }

      // 3. Otherwise fetch as a playlist
      const url = `https://www.youtube.com/playlist?list=${playlistId}`;
      const html = await this.fetchPage(url);
      const data = this.extractYtData(html);

      if (!data) return [];

      const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
      if (!tabs) return [];

      const tab = tabs.find((t) => t.tabRenderer?.selected) || tabs[0];
      const contents = tab?.tabRenderer?.content?.sectionListRenderer?.contents;

      if (!contents) return [];

      const videoListRenderer =
        contents[0]?.itemSectionRenderer?.contents?.[0]
          ?.playlistVideoListRenderer;
      const videoItems = videoListRenderer?.contents || [];

      const tracks: Track[] = [];

      for (const item of videoItems) {
        const renderer = item.playlistVideoRenderer;
        if (!renderer) continue;

        const videoId = renderer.videoId || "";
        const videoTitle = renderer.title?.runs?.[0]?.text || "";
        const channelName =
          renderer.shortBylineText?.runs?.[0]?.text || "Unknown";
        const lengthSeconds = parseInt(renderer.lengthSeconds || "0", 10);
        const thumb = renderer.thumbnail?.thumbnails?.[0]?.url;

        // Smart parse
        const { artist, name } = this.parseTrackInfo(videoTitle, channelName);

        tracks.push({
          id: videoId,
          name: name,
          artists: [{ name: artist }],
          album: { name: "Unknown" },
          duration_ms: lengthSeconds * 1000,
          image: thumb,
          is_youtube: true,
        });
      }

      log.info(`[YoutubeService] Parsed ${tracks.length} tracks`);
      return tracks;
    } catch (e) {
      log.error("[YoutubeService] Failed to fetch tracks:", e);
      return [];
    }
  }

  private parseTrackInfo(
    title: string,
    channelName: string,
  ): { artist: string; name: string } {
    const cleanTitle = title
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .trim();

    const parts = cleanTitle.split(" - ");
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        name: parts.slice(1).join(" - ").trim(),
      };
    }

    return {
      artist: channelName,
      name: title,
    };
  }
}
