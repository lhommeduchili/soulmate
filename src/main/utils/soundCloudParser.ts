import { Playlist, Track } from "../../shared/types";

export interface SoundCloudEntityInfo {
  type: "track" | "playlist";
  artist?: string;
  slug?: string;
  rawUrl: string;
}

interface SoundCloudUser {
  username?: string;
  avatar_url?: string;
  permalink_url?: string;
}

interface SoundCloudTrackData {
  id?: number | string;
  title?: string;
  duration?: number;
  artwork_url?: string | null;
  user?: SoundCloudUser;
  genre?: string;
  release_date?: string;
  created_at?: string;
  permalink_url?: string;
}

interface SoundCloudPlaylistData {
  id?: number | string;
  title?: string;
  description?: string;
  track_count?: number;
  artwork_url?: string | null;
  user?: SoundCloudUser;
  created_at?: string;
  release_date?: string;
  tracks?: SoundCloudTrackData[];
}

interface SoundCloudHydrationItem {
  hydratable?: string;
  data?: unknown;
}

interface SoundCloudOEmbedData {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  description?: string;
}

/**
 * Validates whether a URL or string corresponds to a SoundCloud link.
 */
export function isSoundCloudUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.includes("soundcloud.com/") ||
    trimmed.includes("on.soundcloud.com/") ||
    trimmed.startsWith("https://soundcloud.com") ||
    trimmed.startsWith("http://soundcloud.com") ||
    trimmed.startsWith("https://m.soundcloud.com") ||
    trimmed.startsWith("http://m.soundcloud.com")
  );
}

/**
 * Extracts entity details (track vs set/playlist, artist, slug) from a SoundCloud URL.
 */
export function extractSoundCloudEntity(url: string): SoundCloudEntityInfo {
  const trimmed = url.trim();
  const isPlaylist = trimmed.includes("/sets/");

  try {
    const parsed = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    const segments = parsed.pathname.split("/").filter(Boolean);

    if (parsed.hostname === "on.soundcloud.com") {
      return {
        type: "track",
        slug: segments[0] || "",
        rawUrl: trimmed,
      };
    }

    if (isPlaylist) {
      const setsIndex = segments.indexOf("sets");
      const artist = setsIndex > 0 ? segments[setsIndex - 1] : segments[0];
      const slug =
        setsIndex >= 0 && segments.length > setsIndex + 1
          ? segments[setsIndex + 1]
          : "";
      return {
        type: "playlist",
        artist,
        slug,
        rawUrl: trimmed,
      };
    }

    // Standard track: /:artist/:track-slug
    const artist = segments[0] || "";
    const slug = segments[1] || "";
    return {
      type: "track",
      artist,
      slug,
      rawUrl: trimmed,
    };
  } catch {
    return {
      type: isPlaylist ? "playlist" : "track",
      rawUrl: trimmed,
    };
  }
}

/**
 * Converts standard SoundCloud artwork URLs to high-resolution t500x500 URLs.
 */
export function normalizeArtworkUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  return url
    .replace("-large.", "-t500x500.")
    .replace("-badge.", "-t500x500.")
    .replace("-t300x300.", "-t500x500.")
    .replace("-small.", "-t500x500.")
    .replace("-tiny.", "-t500x500.");
}

/**
 * Parses track title and artist, handling "Artist - Title" strings vs uploader names.
 */
export function parseArtistAndTitle(
  rawTitle: string,
  uploaderName: string,
): { artist: string; title: string } {
  const cleanTitle = rawTitle.trim();
  const uploader = uploaderName.trim() || "Unknown";

  if (cleanTitle.includes(" - ")) {
    const parts = cleanTitle.split(" - ");
    const artist = parts[0].trim();
    const title = parts.slice(1).join(" - ").trim();
    return {
      artist: artist || uploader,
      title: title || cleanTitle,
    };
  }

  return {
    artist: uploader,
    title: cleanTitle,
  };
}

/**
 * Extracts and parses window.__sc_hydration array from public SoundCloud web pages.
 */
export function parseSoundCloudHydration(html: string): unknown[] | null {
  if (!html || typeof html !== "string") return null;

  const marker = "window.__sc_hydration = ";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return null;

  const jsonStart = startIdx + marker.length;
  const scriptEnd = html.indexOf(";</script>", jsonStart);
  const tagEnd = html.indexOf("</script>", jsonStart);

  let jsonEnd = -1;
  if (scriptEnd !== -1 && tagEnd !== -1) {
    jsonEnd = Math.min(scriptEnd, tagEnd);
  } else if (scriptEnd !== -1) {
    jsonEnd = scriptEnd;
  } else {
    jsonEnd = tagEnd;
  }

  if (jsonEnd === -1) return null;

  try {
    const jsonStr = html.substring(jsonStart, jsonEnd).trim().replace(/;$/, "");
    const parsed = JSON.parse(jsonStr) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parses a public SoundCloud HTML page, extracting tracks and playlist metadata.
 */
export function parseSoundCloudHtml(
  html: string,
  originalUrl: string,
): { playlist: Playlist; tracks: Track[] } | null {
  const entity = extractSoundCloudEntity(originalUrl);
  const hydration = parseSoundCloudHydration(html);

  if (hydration && hydration.length > 0) {
    const items = hydration as SoundCloudHydrationItem[];

    // 1. Check for playlist hydration
    const playlistItem = items.find(
      (it) =>
        it.hydratable === "playlist" && it.data && typeof it.data === "object",
    );

    if (playlistItem && playlistItem.data) {
      const plData = playlistItem.data as SoundCloudPlaylistData;
      const plId = String(plData.id || entity.slug || "sc-set");
      const plTitle = plData.title || "SoundCloud Playlist";
      const uploader =
        plData.user?.username || entity.artist || "SoundCloud User";
      const artwork = normalizeArtworkUrl(
        plData.artwork_url || plData.user?.avatar_url,
      );

      const rawTracks = Array.isArray(plData.tracks) ? plData.tracks : [];
      const tracks: Track[] = rawTracks
        .filter((t) => t && t.title)
        .map((t, index) => {
          const trackTitle = t.title || `Track ${index + 1}`;
          const trackUploader = t.user?.username || uploader;
          const { artist, title } = parseArtistAndTitle(
            trackTitle,
            trackUploader,
          );
          const trackArt = normalizeArtworkUrl(
            t.artwork_url || plData.artwork_url,
          );
          const releaseDate =
            t.release_date || t.created_at || plData.created_at;
          const year = releaseDate
            ? new Date(releaseDate).getFullYear().toString()
            : undefined;

          return {
            id: String(t.id || `sc-${index + 1}`),
            name: title,
            artists: [{ name: artist }],
            album: {
              name: plTitle,
              images: trackArt ? [{ url: trackArt }] : undefined,
            },
            duration_ms: typeof t.duration === "number" ? t.duration : 0,
            image: trackArt,
            track_number: index + 1,
            year,
            is_soundcloud: true,
          };
        });

      const playlist: Playlist = {
        id: plId,
        name: plTitle,
        description: plData.description || `Playlist by ${uploader}`,
        images: artwork ? [{ url: artwork }] : [],
        tracks: { total: plData.track_count || tracks.length },
        owner: { display_name: uploader },
        public: true,
        type: "soundcloud",
        original_url: originalUrl,
      };

      return { playlist, tracks };
    }

    // 2. Check for single sound/track hydration
    const soundItem = items.find(
      (it) =>
        it.hydratable === "sound" && it.data && typeof it.data === "object",
    );

    if (soundItem && soundItem.data) {
      const sData = soundItem.data as SoundCloudTrackData;
      const soundId = String(sData.id || entity.slug || "sc-track");
      const rawTitle = sData.title || entity.slug || "SoundCloud Track";
      const uploader =
        sData.user?.username || entity.artist || "SoundCloud User";
      const { artist, title } = parseArtistAndTitle(rawTitle, uploader);
      const artwork = normalizeArtworkUrl(
        sData.artwork_url || sData.user?.avatar_url,
      );
      const releaseDate = sData.release_date || sData.created_at;
      const year = releaseDate
        ? new Date(releaseDate).getFullYear().toString()
        : undefined;

      const singleTrack: Track = {
        id: soundId,
        name: title,
        artists: [{ name: artist }],
        album: {
          name: rawTitle,
          images: artwork ? [{ url: artwork }] : undefined,
        },
        duration_ms: typeof sData.duration === "number" ? sData.duration : 0,
        image: artwork,
        track_number: 1,
        year,
        is_soundcloud: true,
      };

      const playlist: Playlist = {
        id: soundId,
        name: rawTitle,
        description: `Track by ${uploader}`,
        images: artwork ? [{ url: artwork }] : [],
        tracks: { total: 1 },
        owner: { display_name: uploader },
        public: true,
        type: "soundcloud",
        original_url: originalUrl,
      };

      return { playlist, tracks: [singleTrack] };
    }
  }

  // 3. Fallback: Parse OpenGraph / Meta tags
  const ogTitleMatch = html.match(
    /<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i,
  );
  const ogImageMatch = html.match(
    /<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i,
  );
  const ogDescMatch = html.match(
    /<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i,
  );

  if (ogTitleMatch && ogTitleMatch[1]) {
    const rawTitle = ogTitleMatch[1].trim();
    const uploader = entity.artist || "SoundCloud Artist";
    const { artist, title } = parseArtistAndTitle(rawTitle, uploader);
    const artwork = normalizeArtworkUrl(
      ogImageMatch ? ogImageMatch[1].trim() : undefined,
    );
    const fallbackId = entity.slug || `sc-${Date.now()}`;

    const track: Track = {
      id: fallbackId,
      name: title,
      artists: [{ name: artist }],
      album: {
        name: rawTitle,
        images: artwork ? [{ url: artwork }] : undefined,
      },
      duration_ms: 0,
      image: artwork,
      track_number: 1,
      is_soundcloud: true,
    };

    const playlist: Playlist = {
      id: fallbackId,
      name: rawTitle,
      description: ogDescMatch
        ? ogDescMatch[1].trim()
        : `SoundCloud content by ${uploader}`,
      images: artwork ? [{ url: artwork }] : [],
      tracks: { total: 1 },
      owner: { display_name: uploader },
      public: true,
      type: "soundcloud",
      original_url: originalUrl,
    };

    return { playlist, tracks: [track] };
  }

  return null;
}

/**
 * Parses public SoundCloud oEmbed JSON into standard Playlist and Track structures.
 */
export function parseSoundCloudOEmbed(
  json: unknown,
  originalUrl: string,
): { playlist: Playlist; tracks: Track[] } | null {
  if (!json || typeof json !== "object") return null;

  const data = json as SoundCloudOEmbedData;
  if (!data.title) return null;

  const entity = extractSoundCloudEntity(originalUrl);
  const rawTitle = data.title.trim();
  const uploader =
    data.author_name?.trim() || entity.artist || "SoundCloud Artist";
  const { artist, title } = parseArtistAndTitle(rawTitle, uploader);
  const artwork = normalizeArtworkUrl(data.thumbnail_url);
  const trackId = entity.slug || `sc-${Date.now()}`;

  const track: Track = {
    id: trackId,
    name: title,
    artists: [{ name: artist }],
    album: {
      name: rawTitle,
      images: artwork ? [{ url: artwork }] : undefined,
    },
    duration_ms: 0,
    image: artwork,
    track_number: 1,
    is_soundcloud: true,
  };

  const playlist: Playlist = {
    id: trackId,
    name: rawTitle,
    description: data.description || `Audio by ${uploader}`,
    images: artwork ? [{ url: artwork }] : [],
    tracks: { total: 1 },
    owner: { display_name: uploader },
    public: true,
    type: "soundcloud",
    original_url: originalUrl,
  };

  return { playlist, tracks: [track] };
}
