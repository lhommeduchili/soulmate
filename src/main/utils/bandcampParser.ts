import { Playlist, Track } from "../../shared/types";

export interface BandcampEntityInfo {
  type: "album" | "track";
  slug?: string;
  subdomain?: string;
  rawUrl: string;
}

export interface BandcampJsonLdTrackItem {
  position?: number;
  item?: {
    name?: string;
    duration?: string;
    additionalProperty?: Array<{ name?: string; value?: number | string }>;
  };
}

export interface BandcampJsonLd {
  "@type"?: string;
  name?: string;
  byArtist?: {
    name?: string;
  };
  image?: string;
  numTracks?: number;
  datePublished?: string;
  duration?: string;
  inAlbum?: {
    name?: string;
  };
  track?: {
    itemListElement?: BandcampJsonLdTrackItem[];
  };
}

export interface BandcampTralbumTrack {
  id?: number | string;
  track_num?: number;
  title?: string;
  duration?: number;
  file?: Record<string, string>;
}

export interface BandcampTralbumData {
  artist?: string;
  current?: {
    title?: string;
    release_date?: string;
    type?: string;
  };
  art_id?: number;
  trackinfo?: BandcampTralbumTrack[];
  url?: string;
}

/**
 * Validates whether a URL or string corresponds to a Bandcamp link.
 */
export function isBandcampUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim().toLowerCase();

  // Standard Bandcamp domains
  if (
    trimmed.includes("bandcamp.com/album/") ||
    trimmed.includes("bandcamp.com/track/")
  ) {
    return true;
  }

  // Reject other known platforms
  if (
    trimmed.includes("spotify.com") ||
    trimmed.includes("soundcloud.com") ||
    trimmed.includes("youtube.com") ||
    trimmed.includes("youtu.be")
  ) {
    return false;
  }

  // Custom domain Bandcamp releases: e.g. https://music.artist.com/album/:slug
  if (
    /^https?:\/\/[a-zA-Z0-9-.]+\/(album|track)\/[a-zA-Z0-9-_]+/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts entity details (album vs track, slug, subdomain) from a Bandcamp URL.
 */
export function extractBandcampEntity(url: string): BandcampEntityInfo {
  const trimmed = url.trim();
  const isTrack = trimmed.includes("/track/");

  try {
    const parsed = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    const hostParts = parsed.hostname.split(".");
    let subdomain: string | undefined;
    if (parsed.hostname.includes("bandcamp.com") && hostParts.length >= 3) {
      subdomain = hostParts[0];
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    const typeIndex = segments.findIndex((s) => s === "album" || s === "track");
    const type: "album" | "track" =
      typeIndex !== -1 && segments[typeIndex] === "track"
        ? "track"
        : isTrack
          ? "track"
          : "album";
    const slug =
      typeIndex !== -1 && segments.length > typeIndex + 1
        ? segments[typeIndex + 1]
        : "";

    return {
      type,
      slug,
      subdomain,
      rawUrl: trimmed,
    };
  } catch {
    return {
      type: isTrack ? "track" : "album",
      rawUrl: trimmed,
    };
  }
}

/**
 * Parses an ISO-8601 duration string (e.g. PT3M45S, PT45S, PT1H2M3S) into milliseconds.
 */
export function parseIsoDuration(durationStr?: string): number {
  if (!durationStr || typeof durationStr !== "string") return 0;
  const trimmed = durationStr.trim();

  // Pattern: PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?
  const match = trimmed.match(
    /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i,
  );
  if (!match) return 0;

  const hours = parseFloat(match[1] || "0");
  const minutes = parseFloat(match[2] || "0");
  const seconds = parseFloat(match[3] || "0");

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return Math.round(totalSeconds * 1000);
}

/**
 * Extracts Schema.org JSON-LD from HTML (<script type="application/ld+json">).
 */
export function parseBandcampJsonLd(html: string): BandcampJsonLd | null {
  if (!html || typeof html !== "string") return null;

  const regex =
    /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as BandcampJsonLd;
      if (
        parsed &&
        (parsed["@type"] === "MusicAlbum" ||
          parsed["@type"] === "MusicRecording" ||
          parsed["@type"] === "MusicRelease")
      ) {
        return parsed;
      }
    } catch {
      // Continue to next script block
    }
  }

  return null;
}

/**
 * Extracts data-tralbum JSON attribute embedded in Bandcamp HTML pages.
 */
export function parseBandcampDataTralbum(
  html: string,
): BandcampTralbumData | null {
  if (!html || typeof html !== "string") return null;

  // Match data-tralbum attribute with either single or double quotes
  const attrMatch = html.match(/data-tralbum=(["'])([\s\S]*?)\1/i);
  if (attrMatch && attrMatch[2]) {
    try {
      const unescaped = attrMatch[2]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      return JSON.parse(unescaped) as BandcampTralbumData;
    } catch {
      // Ignore parse error and try fallback
    }
  }

  // Fallback: Check for inline JavaScript: var TralbumData = {...};
  const jsMatch = html.match(/var\s+TralbumData\s*=\s*(\{[\s\S]*?\});/i);
  if (jsMatch && jsMatch[1]) {
    try {
      return JSON.parse(jsMatch[1]) as BandcampTralbumData;
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Parses artist and title from Bandcamp "Title by Artist" string.
 */
function cleanBandcampTitle(rawTitle: string): {
  title: string;
  artist?: string;
} {
  const trimmed = rawTitle.trim();
  if (trimmed.includes(" by ")) {
    const parts = trimmed.split(" by ");
    return {
      title: parts[0].trim(),
      artist: parts.slice(1).join(" by ").trim(),
    };
  }
  return { title: trimmed };
}

/**
 * Parses a public Bandcamp HTML page, extracting tracks and album metadata.
 */
export function parseBandcampHtml(
  html: string,
  originalUrl: string,
): { playlist: Playlist; tracks: Track[] } | null {
  const entity = extractBandcampEntity(originalUrl);
  const jsonLd = parseBandcampJsonLd(html);
  const tralbum = parseBandcampDataTralbum(html);

  // Meta tag fallbacks
  const ogTitleMatch = html.match(
    /<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i,
  );
  const ogImageMatch = html.match(
    /<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i,
  );
  const ogDescMatch = html.match(
    /<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i,
  );

  const ogClean = ogTitleMatch
    ? cleanBandcampTitle(ogTitleMatch[1])
    : undefined;

  const rawArtist =
    tralbum?.artist ||
    jsonLd?.byArtist?.name ||
    ogClean?.artist ||
    entity.subdomain ||
    "Bandcamp Artist";

  const rawAlbumTitle =
    tralbum?.current?.title ||
    jsonLd?.name ||
    ogClean?.title ||
    entity.slug ||
    "Bandcamp Release";

  const albumName = jsonLd?.inAlbum?.name || rawAlbumTitle;

  const artworkUrl =
    jsonLd?.image ||
    (ogImageMatch ? ogImageMatch[1].trim() : undefined) ||
    undefined;

  const dateStr = jsonLd?.datePublished || tralbum?.current?.release_date;
  const year = dateStr ? new Date(dateStr).getFullYear().toString() : undefined;

  const tracks: Track[] = [];

  // Case 1: tralbum.trackinfo is available (highest accuracy for track numbers & duration)
  if (tralbum?.trackinfo && tralbum.trackinfo.length > 0) {
    tralbum.trackinfo.forEach((t, idx) => {
      if (!t.title) return;
      const trackNumber = t.track_num || idx + 1;
      const durationMs =
        typeof t.duration === "number" ? Math.round(t.duration * 1000) : 0;
      const trackId = String(t.id || `${entity.slug || "bc"}-${trackNumber}`);

      tracks.push({
        id: trackId,
        name: t.title.trim(),
        artists: [{ name: rawArtist }],
        album: {
          name: albumName,
          images: artworkUrl ? [{ url: artworkUrl }] : undefined,
        },
        duration_ms: durationMs,
        image: artworkUrl,
        track_number: trackNumber,
        year,
        is_bandcamp: true,
      });
    });
  }
  // Case 2: Schema.org JSON-LD track list is available
  else if (
    jsonLd?.track?.itemListElement &&
    jsonLd.track.itemListElement.length > 0
  ) {
    jsonLd.track.itemListElement.forEach((itemObj, idx) => {
      const item = itemObj.item;
      if (!item || !item.name) return;

      const trackNumber =
        (typeof itemObj.position === "number" ? itemObj.position : undefined) ||
        (Array.isArray(item.additionalProperty)
          ? Number(
              item.additionalProperty.find((p) => p.name === "tracknum")?.value,
            )
          : undefined) ||
        idx + 1;

      const durationMs = parseIsoDuration(item.duration);
      const trackId = `${entity.slug || "bc"}-${trackNumber}`;

      tracks.push({
        id: trackId,
        name: item.name.trim(),
        artists: [{ name: rawArtist }],
        album: {
          name: albumName,
          images: artworkUrl ? [{ url: artworkUrl }] : undefined,
        },
        duration_ms: durationMs,
        image: artworkUrl,
        track_number: trackNumber,
        year,
        is_bandcamp: true,
      });
    });
  }
  // Case 3: Single track page or fallback single item
  else {
    const singleTitle = jsonLd?.name || ogClean?.title || rawAlbumTitle;
    const albumName = jsonLd?.inAlbum?.name || rawAlbumTitle;
    const durationMs = parseIsoDuration(jsonLd?.duration);
    const trackId = entity.slug || `bc-${Date.now()}`;

    tracks.push({
      id: trackId,
      name: singleTitle,
      artists: [{ name: rawArtist }],
      album: {
        name: albumName,
        images: artworkUrl ? [{ url: artworkUrl }] : undefined,
      },
      duration_ms: durationMs,
      image: artworkUrl,
      track_number: 1,
      year,
      is_bandcamp: true,
    });
  }

  if (tracks.length === 0) return null;

  const playlistId = entity.slug || `bc-${Date.now()}`;
  const playlist: Playlist = {
    id: playlistId,
    name: rawAlbumTitle,
    description: ogDescMatch
      ? ogDescMatch[1].trim()
      : `Bandcamp release by ${rawArtist}`,
    images: artworkUrl ? [{ url: artworkUrl }] : [],
    tracks: { total: tracks.length },
    owner: { display_name: rawArtist },
    public: true,
    type: "bandcamp",
    original_url: originalUrl,
  };

  return { playlist, tracks };
}
