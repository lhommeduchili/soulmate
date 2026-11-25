import { URL } from "url";
import { Playlist, Track } from "../../shared/types";

export type SpotifyEntityType = "playlist" | "album" | "track";

export interface SpotifyEntityInfo {
  type: SpotifyEntityType;
  id: string;
}

// ==========================================
// 1. Payload Schemas & Internal Interfaces
// ==========================================

export interface SpotifyOpenCoverSource {
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface SpotifyOpenArtistItem {
  uri?: string;
  profile?: {
    name?: string;
  };
  name?: string;
  id?: string;
}

export interface SpotifyOpenAlbumOfTrack {
  uri?: string;
  name?: string;
  coverArt?: {
    sources?: SpotifyOpenCoverSource[];
  };
}

export interface SpotifyOpenTrackData {
  __typename?: string;
  uri?: string;
  id?: string;
  name?: string;
  trackNumber?: number;
  discNumber?: number;
  duration?: {
    totalMilliseconds?: number;
  };
  duration_ms?: number;
  artists?:
    | {
        items?: SpotifyOpenArtistItem[];
      }
    | Array<{ name: string; id?: string }>;
  albumOfTrack?: SpotifyOpenAlbumOfTrack;
  album?:
    | {
        name?: string;
        id?: string;
        images?: Array<{ url: string }>;
      }
    | string;
  image?: string;
}

export interface SpotifyOpenContentItem {
  itemV2?: {
    __typename?: string;
    data?: SpotifyOpenTrackData;
  };
  track?: SpotifyOpenTrackData;
  [key: string]: unknown;
}

export interface SpotifyOpenPlaylistItem {
  id?: string;
  name?: string;
  description?: string;
  uri?: string;
  images?:
    | {
        items?: Array<{
          sources?: SpotifyOpenCoverSource[];
        }>;
      }
    | Array<{ url: string }>;
  ownerV2?: {
    data?: {
      name?: string;
      username?: string;
      uri?: string;
    };
  };
  owner?: {
    display_name?: string;
    name?: string;
  };
  content?: {
    __typename?: string;
    totalCount?: number;
    pagingInfo?: {
      nextOffset?: number;
    };
    items?: SpotifyOpenContentItem[];
  };
  [key: string]: unknown;
}

export interface SpotifyOpenInitialState {
  entities?: {
    items?: Record<string, SpotifyOpenPlaylistItem>;
  };
  [key: string]: unknown;
}

export interface SpotifyEmbedTrackItem {
  id?: string;
  uri?: string;
  name?: string;
  title?: string;
  subtitle?: string;
  artists?: Array<{ name: string; id?: string; uri?: string }> | string;
  album?:
    | {
        name?: string;
        id?: string;
        images?: Array<{ url: string }>;
      }
    | string;
  duration?: number;
  duration_ms?: number;
  image?: string;
  images?: Array<{ url: string }>;
  coverArt?: {
    sources?: SpotifyOpenCoverSource[];
  };
  track?: SpotifyEmbedTrackItem;
  [key: string]: unknown;
}

export interface SpotifyEmbedResource {
  id?: string;
  uri?: string;
  name?: string;
  title?: string;
  description?: string;
  type?: string;
  subtitle?: string;
  owner?: {
    display_name?: string;
    name?: string;
  };
  images?:
    | Array<{ url: string }>
    | { items?: Array<{ sources?: SpotifyOpenCoverSource[] }> };
  coverArt?: {
    sources?: SpotifyOpenCoverSource[];
  };
  image?: string;
  duration?: number;
  duration_ms?: number;
  tracks?: {
    items?: SpotifyEmbedTrackItem[];
    total?: number;
  };
  trackList?: SpotifyEmbedTrackItem[];
  [key: string]: unknown;
}

export interface SpotifyNextData {
  props?: {
    pageProps?: {
      state?: {
        data?: {
          entity?: SpotifyEmbedResource;
          [key: string]: unknown;
        };
      };
      entity?: SpotifyEmbedResource;
      playlist?: SpotifyEmbedResource;
      data?: {
        playlist?: SpotifyEmbedResource;
        entity?: SpotifyEmbedResource;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
  };
  [key: string]: unknown;
}

export interface ParsedPlaylistResult {
  playlist: Partial<Playlist>;
  tracks: Track[];
}

// ==========================================
// 2. Utility Helpers
// ==========================================

export function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  let current = text;
  let prev = "";
  let iterations = 0;
  while (current !== prev && iterations < 5) {
    prev = current;
    iterations++;
    current = current
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;|&#39;|&#x27;/g, "'")
      .replace(/&lsquo;|&rsquo;/g, "'")
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&ndash;/g, "–")
      .replace(/&mdash;/g, "—")
      .replace(/&hellip;/g, "...")
      .replace(/&nbsp;/g, " ")
      .replace(/&eacute;/g, "é")
      .replace(/&#(\d+);/g, (_, dec) => {
        const code = parseInt(dec, 10);
        return !isNaN(code) ? String.fromCharCode(code) : _;
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        const code = parseInt(hex, 16);
        return !isNaN(code) ? String.fromCharCode(code) : _;
      });
  }
  return current;
}

export function cleanTrackText(text: string): string {
  if (!text) return "";
  const decoded = decodeHtmlEntities(text);
  return decoded
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSpotifyId(val: string | undefined): string {
  if (!val) return "";
  if (val.startsWith("spotify:")) {
    const parts = val.split(":");
    return parts[parts.length - 1];
  }
  return val;
}

/**
 * Normalizes and extracts Spotify entity info (playlist, album, track) from URLs, URIs, or IDs.
 */
export function extractSpotifyEntity(idOrUrl: string): SpotifyEntityInfo {
  if (!idOrUrl || typeof idOrUrl !== "string") {
    throw new Error("Invalid Spotify playlist URL or ID");
  }

  const trimmed = idOrUrl.trim();
  if (!trimmed) {
    throw new Error("Invalid Spotify playlist URL or ID");
  }

  // Handle spotify: URI formats (e.g. spotify:playlist:id, spotify:playlist::id, spotify:album:id, spotify:track:id)
  if (trimmed.startsWith("spotify:")) {
    const uriMatch = trimmed.match(
      /^spotify:(playlist|album|track):+([a-zA-Z0-9]+)/,
    );
    if (uriMatch && uriMatch[1] && uriMatch[2]) {
      return {
        type: uriMatch[1] as SpotifyEntityType,
        id: uriMatch[2],
      };
    }
    throw new Error(`Invalid Spotify URI: ${idOrUrl}`);
  }

  // Handle short prefix notation (e.g. album:4aawyAB9vmqN3uQ7FjRGTy, track:11dFghVXANMlKmJXsNCbNl, playlist:37i9dQZF1DXcBWIGoYBM5M)
  const prefixMatch = trimmed.match(/^(playlist|album|track):([a-zA-Z0-9]+)$/);
  if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
    return {
      type: prefixMatch[1] as SpotifyEntityType,
      id: prefixMatch[2],
    };
  }

  // Handle HTTP/HTTPS URLs
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsedUrl = new URL(trimmed);
      const host = parsedUrl.hostname.toLowerCase();
      if (host !== "spotify.com" && !host.endsWith(".spotify.com")) {
        throw new Error(`Not a Spotify URL: ${idOrUrl}`);
      }
      const match = parsedUrl.pathname.match(
        /\/(playlist|album|track)\/([a-zA-Z0-9]+)/,
      );
      if (match && match[1] && match[2]) {
        return {
          type: match[1] as SpotifyEntityType,
          id: match[2],
        };
      }
      throw new Error(
        `Spotify URL does not contain a valid playlist, album, or track ID: ${idOrUrl}`,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Spotify")) {
        throw err;
      }
      throw new Error(`Invalid Spotify URL: ${idOrUrl}`);
    }
  }

  // Handle raw ID (potentially with query string e.g. 37i9dQZF1DXcBWIGoYBM5M?si=...)
  const cleanId = trimmed.split("?")[0].split("#")[0].trim();
  if (/^[a-zA-Z0-9]+$/.test(cleanId)) {
    return {
      type: "playlist",
      id: cleanId,
    };
  }

  throw new Error(`Invalid Spotify URL, URI, or ID: ${idOrUrl}`);
}

/**
 * Normalizes and extracts base62 identifier from Spotify URLs, URIs, or raw IDs.
 */
export function extractPlaylistId(idOrUrl: string): string {
  return extractSpotifyEntity(idOrUrl).id;
}

// ==========================================
// 3. Parser Functions
// ==========================================

/**
 * Parses Spotify Open Web Player HTML payload (open.spotify.com/playlist/:id).
 * Decodes the base64 initialState script and extracts playlist info and tracklist.
 */
export function parseOpenPageHtml(
  html: string,
  playlistId: string,
): ParsedPlaylistResult | null {
  if (!html) return null;

  const scriptMatch = html.match(
    /<script\b[^>]*\bid=["']initialState["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!scriptMatch || !scriptMatch[1]) {
    return null;
  }

  const rawContent = scriptMatch[1].trim();
  let state: SpotifyOpenInitialState;

  try {
    let jsonStr: string;
    try {
      jsonStr = Buffer.from(rawContent, "base64").toString("utf-8");
      // Basic sanity check that decoded string resembles JSON
      if (!jsonStr.startsWith("{") && !jsonStr.startsWith("[")) {
        jsonStr = rawContent;
      }
    } catch {
      jsonStr = rawContent;
    }
    state = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (!state || typeof state !== "object" || !state.entities?.items) {
    return null;
  }

  const itemsMap = state.entities.items;
  const targetUri = `spotify:playlist:${playlistId}`;

  // Find target playlist entity
  let playlistEntity: SpotifyOpenPlaylistItem | undefined =
    itemsMap[targetUri] || itemsMap[playlistId];

  if (!playlistEntity) {
    const values = Object.values(itemsMap);
    playlistEntity = values.find(
      (it) =>
        it.id === playlistId ||
        it.uri === targetUri ||
        (it.uri && cleanSpotifyId(it.uri) === playlistId),
    );
  }

  if (!playlistEntity) {
    return null;
  }

  // Extract playlist cover images
  const images: Array<{ url: string }> = [];
  if (playlistEntity.images) {
    if (Array.isArray(playlistEntity.images)) {
      for (const img of playlistEntity.images) {
        if (img?.url) images.push({ url: img.url });
      }
    } else if (Array.isArray(playlistEntity.images.items)) {
      for (const item of playlistEntity.images.items) {
        if (item?.sources) {
          for (const s of item.sources) {
            if (s?.url) images.push({ url: s.url });
          }
        }
      }
    }
  }

  const totalTracks =
    playlistEntity.content?.totalCount ??
    playlistEntity.content?.items?.length ??
    0;

  const playlist: Partial<Playlist> = {
    id: playlistEntity.id || playlistId,
    name: cleanTrackText(playlistEntity.name || ""),
    description: playlistEntity.description
      ? cleanTrackText(playlistEntity.description)
      : undefined,
    images,
    tracks: { total: totalTracks },
    owner: {
      display_name: cleanTrackText(
        playlistEntity.ownerV2?.data?.name ||
          playlistEntity.owner?.display_name ||
          playlistEntity.owner?.name ||
          "Spotify",
      ),
    },
    public: true,
    type: "spotify",
  };

  // Extract tracks
  const tracks: Track[] = [];
  const rawItems = playlistEntity.content?.items ?? [];

  for (const entry of rawItems) {
    const trackData: SpotifyOpenTrackData | undefined =
      entry.itemV2?.data ?? entry.track;

    if (!trackData) continue;

    const id = cleanSpotifyId(trackData.uri || trackData.id);
    const name = cleanTrackText(trackData.name || "");
    if (!id && !name) continue;

    // Duration in milliseconds
    const duration_ms =
      trackData.duration?.totalMilliseconds ?? trackData.duration_ms ?? 0;

    // Artists mapping
    const artists: Array<{ name: string; id?: string }> = [];
    if (
      trackData.artists &&
      "items" in trackData.artists &&
      Array.isArray(trackData.artists.items)
    ) {
      for (const a of trackData.artists.items) {
        const artName = cleanTrackText(a.profile?.name || a.name || "Unknown");
        const artId = a.uri ? cleanSpotifyId(a.uri) : a.id;
        artists.push({ name: artName, id: artId });
      }
    } else if (Array.isArray(trackData.artists)) {
      for (const a of trackData.artists) {
        if (typeof a === "string") {
          artists.push({ name: cleanTrackText(a) });
        } else if (a && typeof a === "object") {
          artists.push({
            name: cleanTrackText(a.name || "Unknown"),
            id: a.id ? cleanSpotifyId(a.id) : undefined,
          });
        }
      }
    }

    if (artists.length === 0) {
      artists.push({ name: "Unknown" });
    }

    // Album mapping
    let albumName = "Unknown";
    let albumId: string | undefined;
    const albumImages: Array<{ url: string }> = [];

    if (trackData.albumOfTrack) {
      albumName = cleanTrackText(trackData.albumOfTrack.name || "Unknown");
      if (trackData.albumOfTrack.uri) {
        albumId = cleanSpotifyId(trackData.albumOfTrack.uri);
      }
      if (trackData.albumOfTrack.coverArt?.sources) {
        for (const s of trackData.albumOfTrack.coverArt.sources) {
          if (s?.url) albumImages.push({ url: s.url });
        }
      }
    } else if (trackData.album) {
      if (typeof trackData.album === "string") {
        albumName = cleanTrackText(trackData.album);
      } else if (typeof trackData.album === "object") {
        albumName = cleanTrackText(trackData.album.name || "Unknown");
        albumId = trackData.album.id
          ? cleanSpotifyId(trackData.album.id)
          : undefined;
        if (Array.isArray(trackData.album.images)) {
          for (const img of trackData.album.images) {
            if (img?.url) albumImages.push({ url: img.url });
          }
        }
      }
    }

    const firstImage = albumImages[0]?.url || trackData.image || images[0]?.url;

    tracks.push({
      id: id || `track_${tracks.length + 1}`,
      name,
      artists,
      album: {
        name: albumName,
        id: albumId,
        images: albumImages,
      },
      duration_ms,
      image: firstImage,
      is_youtube: false,
    });
  }

  return { playlist, tracks };
}

/**
 * Parses Spotify Embed HTML payload (open.spotify.com/embed/playlist/:id).
 * Evaluates <script id="resource">, <script id="initial-state">, or <script id="__NEXT_DATA__">.
 */
export function parseEmbedHtml(html: string): ParsedPlaylistResult | null {
  if (!html) return null;

  // Search candidate scripts: resource, initial-state, __NEXT_DATA__
  const scriptRegex =
    /<script\b[^>]*\bid=["'](resource|initial-state|__NEXT_DATA__)["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[2].trim();
    if (!raw) continue;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      // Try base64 decoding if raw is base64 encoded
      try {
        const decoded = Buffer.from(raw, "base64").toString("utf-8");
        parsedJson = JSON.parse(decoded);
      } catch {
        continue;
      }
    }

    if (!parsedJson || typeof parsedJson !== "object") continue;

    const entity = locateEmbedEntity(parsedJson as Record<string, unknown>);
    if (!entity) continue;

    const result = extractEmbedResult(entity);
    if (result) {
      return result;
    }
  }

  return null;
}

function locateEmbedEntity(
  data: Record<string, unknown>,
): SpotifyEmbedResource | null {
  // Case 1: Next.js props structure
  const nextData = data as SpotifyNextData;
  const pageProps = nextData.props?.pageProps;
  if (pageProps) {
    if (pageProps.state?.data?.entity) {
      return pageProps.state.data.entity;
    }
    if (pageProps.entity) {
      return pageProps.entity;
    }
    if (pageProps.playlist) {
      return pageProps.playlist;
    }
    if ((pageProps as Record<string, unknown>).album) {
      return (pageProps as Record<string, unknown>)
        .album as SpotifyEmbedResource;
    }
    if ((pageProps as Record<string, unknown>).track) {
      return (pageProps as Record<string, unknown>)
        .track as SpotifyEmbedResource;
    }
    if (pageProps.data?.entity) {
      return pageProps.data.entity;
    }
    if (pageProps.data?.playlist) {
      return pageProps.data.playlist;
    }
    if ((pageProps.data as Record<string, unknown> | undefined)?.album) {
      return (pageProps.data as Record<string, unknown>)
        .album as SpotifyEmbedResource;
    }
    if ((pageProps.data as Record<string, unknown> | undefined)?.track) {
      return (pageProps.data as Record<string, unknown>)
        .track as SpotifyEmbedResource;
    }
  }

  // Case 2: initial-state or nested data entity
  if (data.data && typeof data.data === "object") {
    const nested = data.data as Record<string, unknown>;
    if (nested.entity && typeof nested.entity === "object") {
      return nested.entity as SpotifyEmbedResource;
    }
    if (nested.playlist && typeof nested.playlist === "object") {
      return nested.playlist as SpotifyEmbedResource;
    }
    if (nested.album && typeof nested.album === "object") {
      return nested.album as SpotifyEmbedResource;
    }
    if (nested.track && typeof nested.track === "object") {
      return nested.track as SpotifyEmbedResource;
    }
  }

  // Case 3: Direct resource entity (id, tracks, trackList, or type="playlist" | "album" | "track")
  if (
    data.trackList ||
    data.tracks ||
    data.type === "playlist" ||
    data.type === "album" ||
    data.type === "track" ||
    (data.name && (data.id || data.uri))
  ) {
    return data as SpotifyEmbedResource;
  }

  return null;
}

function extractEmbedResult(
  entity: SpotifyEmbedResource,
): ParsedPlaylistResult | null {
  const playlistId = cleanSpotifyId(entity.id || entity.uri) || "playlist";
  const playlistName = cleanTrackText(entity.name || entity.title || "");

  // Extract cover image
  const images: Array<{ url: string }> = [];
  if (Array.isArray(entity.images)) {
    for (const img of entity.images) {
      if (typeof img === "string") images.push({ url: img });
      else if (img?.url) images.push({ url: img.url });
    }
  } else if (
    entity.images &&
    typeof entity.images === "object" &&
    "items" in entity.images
  ) {
    const items = entity.images.items;
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it?.sources) {
          for (const s of it.sources) {
            if (s?.url) images.push({ url: s.url });
          }
        }
      }
    }
  } else if (entity.coverArt?.sources) {
    for (const s of entity.coverArt.sources) {
      if (s?.url) images.push({ url: s.url });
    }
  } else if (entity.image) {
    images.push({ url: entity.image });
  }

  // Extract raw track entries
  let rawTracks: SpotifyEmbedTrackItem[] = [];
  if (Array.isArray(entity.trackList)) {
    rawTracks = entity.trackList;
  } else if (entity.tracks && Array.isArray(entity.tracks.items)) {
    rawTracks = entity.tracks.items;
  }

  const tracks: Track[] = [];

  for (const item of rawTracks) {
    const t = item.track ?? item;
    const trackId =
      cleanSpotifyId(t.id || t.uri) || `track_${tracks.length + 1}`;
    const trackName = cleanTrackText(t.name || t.title || "");
    if (!trackName && !t.id && !t.uri) continue;

    const duration_ms = t.duration_ms ?? t.duration ?? 0;

    // Artists mapping
    const artists: Array<{ name: string; id?: string }> = [];
    if (Array.isArray(t.artists)) {
      for (const a of t.artists) {
        if (typeof a === "string") {
          artists.push({ name: cleanTrackText(a) });
        } else if (a && typeof a === "object") {
          artists.push({
            name: cleanTrackText(a.name || "Unknown"),
            id: a.id
              ? cleanSpotifyId(a.id)
              : a.uri
                ? cleanSpotifyId(a.uri)
                : undefined,
          });
        }
      }
    } else if (typeof t.artists === "string") {
      artists.push({ name: cleanTrackText(t.artists) });
    } else if (t.subtitle) {
      artists.push({ name: cleanTrackText(t.subtitle) });
    }

    if (artists.length === 0) {
      artists.push({ name: "Unknown" });
    }

    // Album mapping
    let albumName = "Unknown";
    let albumId: string | undefined;
    const albumImages: Array<{ url: string }> = [];

    if (typeof t.album === "string") {
      albumName = cleanTrackText(t.album);
    } else if (t.album && typeof t.album === "object") {
      albumName = cleanTrackText(t.album.name || "Unknown");
      albumId = t.album.id ? cleanSpotifyId(t.album.id) : undefined;
      if (Array.isArray(t.album.images)) {
        for (const img of t.album.images) {
          if (img?.url) albumImages.push({ url: img.url });
        }
      }
    }

    const trackImage =
      t.image ??
      albumImages[0]?.url ??
      t.images?.[0]?.url ??
      t.coverArt?.sources?.[0]?.url ??
      images[0]?.url;

    tracks.push({
      id: trackId,
      name: trackName,
      artists,
      album: {
        name: albumName,
        id: albumId,
        images: albumImages,
      },
      duration_ms,
      image: trackImage,
      is_youtube: false,
    });
  }

  const totalTracks = entity.tracks?.total ?? tracks.length;

  const playlist: Partial<Playlist> = {
    id: playlistId,
    name: playlistName,
    description: entity.description
      ? cleanTrackText(entity.description)
      : undefined,
    images,
    tracks: { total: totalTracks },
    owner: {
      display_name: cleanTrackText(
        entity.owner?.display_name ||
          entity.owner?.name ||
          entity.subtitle ||
          "Spotify",
      ),
    },
    public: true,
    type: "spotify",
  };

  return { playlist, tracks };
}

/**
 * Fallback metadata extractor from Spotify oEmbed JSON (open.spotify.com/oembed).
 */
export function parseOembedJson(
  json: Record<string, unknown>,
  playlistId: string,
): Partial<Playlist> {
  const title = json.title
    ? cleanTrackText(String(json.title))
    : "Spotify Playlist";
  const author = json.author_name
    ? cleanTrackText(String(json.author_name))
    : "Spotify";
  const images: Array<{ url: string }> = [];

  if (json.thumbnail_url) {
    images.push({ url: String(json.thumbnail_url) });
  }

  const totalTracks =
    typeof json.tracks_count === "number" ? json.tracks_count : 0;

  return {
    id: playlistId,
    name: title,
    description: undefined,
    images,
    tracks: { total: totalTracks },
    owner: { display_name: author },
    public: true,
    type: "spotify",
  };
}

/**
 * Parses Spotify Album HTML payloads from either Open Page or Embed scripts.
 * Returns collection metadata and all track items.
 */
export function parseAlbumHtml(
  html: string,
  albumId?: string,
): ParsedPlaylistResult | null {
  if (!html) return null;

  // Try 1: Open Page <script id="initialState">
  const scriptMatch = html.match(
    /<script\b[^>]*\bid=["']initialState["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (scriptMatch && scriptMatch[1]) {
    const rawContent = scriptMatch[1].trim();
    let state: SpotifyOpenInitialState | null = null;
    try {
      let jsonStr: string;
      try {
        jsonStr = Buffer.from(rawContent, "base64").toString("utf-8");
        if (!jsonStr.startsWith("{") && !jsonStr.startsWith("[")) {
          jsonStr = rawContent;
        }
      } catch {
        jsonStr = rawContent;
      }
      state = JSON.parse(jsonStr) as SpotifyOpenInitialState;
    } catch {
      state = null;
    }

    if (state && typeof state === "object" && state.entities?.items) {
      const itemsMap = state.entities.items;
      let albumEntity: SpotifyOpenPlaylistItem | undefined = albumId
        ? itemsMap[`spotify:album:${albumId}`] || itemsMap[albumId]
        : undefined;

      if (!albumEntity) {
        const values = Object.values(itemsMap);
        albumEntity = values.find(
          (it) =>
            (albumId &&
              (it.id === albumId ||
                (it.uri && cleanSpotifyId(it.uri) === albumId))) ||
            (it.uri && it.uri.includes(":album:")) ||
            it.__typename === "Album",
        );
      }

      if (albumEntity) {
        const resolvedId =
          albumEntity.id ||
          (albumEntity.uri ? cleanSpotifyId(albumEntity.uri) : albumId) ||
          "album";
        const albumName = cleanTrackText(albumEntity.name || "");

        // Cover images
        const images: Array<{ url: string }> = [];
        if (albumEntity.images) {
          if (Array.isArray(albumEntity.images)) {
            for (const img of albumEntity.images) {
              if (img?.url) images.push({ url: img.url });
            }
          } else if (Array.isArray(albumEntity.images.items)) {
            for (const item of albumEntity.images.items) {
              if (item?.sources) {
                for (const s of item.sources) {
                  if (s?.url) images.push({ url: s.url });
                }
              }
            }
          }
        }

        // Artists
        const albumArtists: Array<{ name: string; id?: string }> = [];
        const rawArtists = (albumEntity as Record<string, unknown>).artists;
        if (
          rawArtists &&
          typeof rawArtists === "object" &&
          "items" in rawArtists &&
          Array.isArray((rawArtists as { items: unknown[] }).items)
        ) {
          const artistItems = (rawArtists as { items: SpotifyOpenArtistItem[] })
            .items;
          for (const a of artistItems) {
            const artName = cleanTrackText(a.profile?.name || a.name || "");
            const artId = a.uri ? cleanSpotifyId(a.uri) : a.id;
            if (artName) albumArtists.push({ name: artName, id: artId });
          }
        } else if (Array.isArray(rawArtists)) {
          for (const a of rawArtists) {
            if (typeof a === "string") {
              albumArtists.push({ name: cleanTrackText(a) });
            } else if (a && typeof a === "object") {
              const obj = a as { name?: string; id?: string };
              albumArtists.push({
                name: cleanTrackText(obj.name || ""),
                id: obj.id ? cleanSpotifyId(obj.id) : undefined,
              });
            }
          }
        }

        const artistNames =
          albumArtists.map((a) => a.name).join(", ") ||
          cleanTrackText(
            albumEntity.ownerV2?.data?.name ||
              albumEntity.owner?.display_name ||
              albumEntity.owner?.name ||
              "Spotify",
          );

        // Extract tracks
        const tracks: Track[] = [];
        const rawItems = albumEntity.content?.items ?? [];

        for (const entry of rawItems) {
          const rawRecord = entry as Record<string, unknown>;
          const trackData: SpotifyOpenTrackData | undefined =
            entry.itemV2?.data ??
            entry.track ??
            (rawRecord.data as SpotifyOpenTrackData | undefined);

          if (!trackData) continue;

          const trackId = cleanSpotifyId(trackData.uri || trackData.id);
          const trackTitle = cleanTrackText(trackData.name || "");
          if (!trackId && !trackTitle) continue;

          const duration_ms =
            trackData.duration?.totalMilliseconds ?? trackData.duration_ms ?? 0;

          // Track artists
          const trackArtists: Array<{ name: string; id?: string }> = [];
          if (
            trackData.artists &&
            "items" in trackData.artists &&
            Array.isArray(trackData.artists.items)
          ) {
            for (const a of trackData.artists.items) {
              const artName = cleanTrackText(a.profile?.name || a.name || "");
              const artId = a.uri ? cleanSpotifyId(a.uri) : a.id;
              if (artName) trackArtists.push({ name: artName, id: artId });
            }
          } else if (Array.isArray(trackData.artists)) {
            for (const a of trackData.artists) {
              if (typeof a === "string") {
                trackArtists.push({ name: cleanTrackText(a) });
              } else if (a && typeof a === "object") {
                const obj = a as { name?: string; id?: string };
                trackArtists.push({
                  name: cleanTrackText(obj.name || ""),
                  id: obj.id ? cleanSpotifyId(obj.id) : undefined,
                });
              }
            }
          }

          if (trackArtists.length === 0) {
            if (albumArtists.length > 0) {
              trackArtists.push(...albumArtists);
            } else {
              trackArtists.push({ name: artistNames || "Unknown" });
            }
          }

          const firstImage = images[0]?.url;

          tracks.push({
            id: trackId || `track_${tracks.length + 1}`,
            name: trackTitle,
            artists: trackArtists,
            album: {
              name: albumName,
              id: resolvedId,
              images,
            },
            duration_ms,
            image: firstImage,
            is_youtube: false,
          });
        }

        const totalTracks = albumEntity.content?.totalCount ?? tracks.length;

        const collection: Partial<Playlist> = {
          id: resolvedId,
          name: albumName,
          description: `Album by ${artistNames}`,
          images,
          tracks: { total: totalTracks },
          owner: { display_name: artistNames },
          public: true,
          type: "spotify",
        };

        return { playlist: collection, tracks };
      }
    }
  }

  // Try 2: Embed HTML
  const scriptRegex =
    /<script\b[^>]*\bid=["'](resource|initial-state|__NEXT_DATA__)["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[2].trim();
    if (!raw) continue;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      try {
        const decoded = Buffer.from(raw, "base64").toString("utf-8");
        parsedJson = JSON.parse(decoded);
      } catch {
        continue;
      }
    }

    if (!parsedJson || typeof parsedJson !== "object") continue;

    const entity = locateEmbedEntity(parsedJson as Record<string, unknown>);
    if (!entity) continue;

    const resolvedId =
      cleanSpotifyId(entity.id || entity.uri) || albumId || "album";
    const albumName = cleanTrackText(entity.name || entity.title || "");

    // Artwork
    const images: Array<{ url: string }> = [];
    if (Array.isArray(entity.images)) {
      for (const img of entity.images) {
        if (typeof img === "string") images.push({ url: img });
        else if (img?.url) images.push({ url: img.url });
      }
    } else if (
      entity.images &&
      typeof entity.images === "object" &&
      "items" in entity.images
    ) {
      const items = entity.images.items;
      if (Array.isArray(items)) {
        for (const it of items) {
          if (it?.sources) {
            for (const s of it.sources) {
              if (s?.url) images.push({ url: s.url });
            }
          }
        }
      }
    } else if (entity.coverArt?.sources) {
      for (const s of entity.coverArt.sources) {
        if (s?.url) images.push({ url: s.url });
      }
    } else if (entity.image) {
      images.push({ url: entity.image });
    }

    // Artist
    let albumArtist = cleanTrackText(entity.subtitle || "");
    if (!albumArtist && Array.isArray(entity.artists)) {
      albumArtist = entity.artists
        .map((a) => cleanTrackText(typeof a === "string" ? a : a.name))
        .filter(Boolean)
        .join(", ");
    }
    if (!albumArtist) {
      albumArtist = cleanTrackText(
        entity.owner?.display_name || entity.owner?.name || "Spotify",
      );
    }

    // Tracks
    let rawTracks: SpotifyEmbedTrackItem[] = [];
    if (Array.isArray(entity.trackList)) {
      rawTracks = entity.trackList;
    } else if (entity.tracks && Array.isArray(entity.tracks.items)) {
      rawTracks = entity.tracks.items;
    }

    const tracks: Track[] = [];

    for (const item of rawTracks) {
      const t = item.track ?? item;
      const trackId =
        cleanSpotifyId(t.id || t.uri) || `track_${tracks.length + 1}`;
      const trackName = cleanTrackText(t.name || t.title || "");
      if (!trackName && !t.id && !t.uri) continue;

      const duration_ms = t.duration_ms ?? t.duration ?? 0;

      // Artists
      const trackArtists: Array<{ name: string; id?: string }> = [];
      if (Array.isArray(t.artists)) {
        for (const a of t.artists) {
          if (typeof a === "string") {
            trackArtists.push({ name: cleanTrackText(a) });
          } else if (a && typeof a === "object") {
            trackArtists.push({
              name: cleanTrackText(a.name || "Unknown"),
              id: a.id
                ? cleanSpotifyId(a.id)
                : a.uri
                  ? cleanSpotifyId(a.uri)
                  : undefined,
            });
          }
        }
      } else if (typeof t.artists === "string") {
        trackArtists.push({ name: cleanTrackText(t.artists) });
      } else if (t.subtitle) {
        trackArtists.push({ name: cleanTrackText(t.subtitle) });
      }

      if (trackArtists.length === 0) {
        trackArtists.push({ name: albumArtist || "Unknown" });
      }

      tracks.push({
        id: trackId,
        name: trackName,
        artists: trackArtists,
        album: {
          name: albumName,
          id: resolvedId,
          images,
        },
        duration_ms,
        image: images[0]?.url,
        is_youtube: false,
      });
    }

    const totalTracks = entity.tracks?.total ?? tracks.length;

    const collection: Partial<Playlist> = {
      id: resolvedId,
      name: albumName,
      description: `Album by ${albumArtist}`,
      images,
      tracks: { total: totalTracks },
      owner: { display_name: albumArtist },
      public: true,
      type: "spotify",
    };

    return { playlist: collection, tracks };
  }

  return null;
}

/**
 * Parses Spotify single track HTML payloads from either Open Page or Embed scripts.
 * Returns a 1-item review collection and the single track.
 */
export function parseTrackHtml(
  html: string,
  trackId?: string,
): ParsedPlaylistResult | null {
  if (!html) return null;

  // Try 1: Open Page <script id="initialState">
  const scriptMatch = html.match(
    /<script\b[^>]*\bid=["']initialState["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (scriptMatch && scriptMatch[1]) {
    const rawContent = scriptMatch[1].trim();
    let state: SpotifyOpenInitialState | null = null;
    try {
      let jsonStr: string;
      try {
        jsonStr = Buffer.from(rawContent, "base64").toString("utf-8");
        if (!jsonStr.startsWith("{") && !jsonStr.startsWith("[")) {
          jsonStr = rawContent;
        }
      } catch {
        jsonStr = rawContent;
      }
      state = JSON.parse(jsonStr) as SpotifyOpenInitialState;
    } catch {
      state = null;
    }

    if (state && typeof state === "object" && state.entities?.items) {
      const itemsMap = state.entities.items;
      let trackEntity: SpotifyOpenPlaylistItem | undefined = trackId
        ? itemsMap[`spotify:track:${trackId}`] || itemsMap[trackId]
        : undefined;

      if (!trackEntity) {
        const values = Object.values(itemsMap);
        trackEntity = values.find(
          (it) =>
            (trackId &&
              (it.id === trackId ||
                (it.uri && cleanSpotifyId(it.uri) === trackId))) ||
            (it.uri && it.uri.includes(":track:")) ||
            it.__typename === "Track",
        );
      }

      if (trackEntity) {
        const resolvedId =
          trackEntity.id ||
          (trackEntity.uri ? cleanSpotifyId(trackEntity.uri) : trackId) ||
          "track";
        const trackName = cleanTrackText(trackEntity.name || "");

        const rawEntity = trackEntity as Record<string, unknown>;
        const durationObj = rawEntity.duration as
          | { totalMilliseconds?: number }
          | undefined;
        const duration_ms =
          durationObj?.totalMilliseconds ??
          (typeof rawEntity.duration_ms === "number"
            ? rawEntity.duration_ms
            : 0);

        // Artists
        const trackArtists: Array<{ name: string; id?: string }> = [];
        const rawArtists = rawEntity.artists;
        if (
          rawArtists &&
          typeof rawArtists === "object" &&
          "items" in rawArtists &&
          Array.isArray((rawArtists as { items: unknown[] }).items)
        ) {
          const artistItems = (rawArtists as { items: SpotifyOpenArtistItem[] })
            .items;
          for (const a of artistItems) {
            const artName = cleanTrackText(a.profile?.name || a.name || "");
            const artId = a.uri ? cleanSpotifyId(a.uri) : a.id;
            if (artName) trackArtists.push({ name: artName, id: artId });
          }
        } else if (Array.isArray(rawArtists)) {
          for (const a of rawArtists) {
            if (typeof a === "string") {
              trackArtists.push({ name: cleanTrackText(a) });
            } else if (a && typeof a === "object") {
              const obj = a as { name?: string; id?: string };
              trackArtists.push({
                name: cleanTrackText(obj.name || ""),
                id: obj.id ? cleanSpotifyId(obj.id) : undefined,
              });
            }
          }
        }
        if (trackArtists.length === 0) {
          trackArtists.push({ name: "Unknown" });
        }

        const artistNames = trackArtists.map((a) => a.name).join(", ");

        // Album & Images
        let albumName = "Unknown";
        let albumId: string | undefined;
        const albumImages: Array<{ url: string }> = [];

        const albumOfTrack = rawEntity.albumOfTrack as
          | SpotifyOpenAlbumOfTrack
          | undefined;
        if (albumOfTrack) {
          albumName = cleanTrackText(albumOfTrack.name || "Unknown");
          if (albumOfTrack.uri) albumId = cleanSpotifyId(albumOfTrack.uri);
          if (albumOfTrack.coverArt?.sources) {
            for (const s of albumOfTrack.coverArt.sources) {
              if (s?.url) albumImages.push({ url: s.url });
            }
          }
        } else if (rawEntity.album) {
          const alb = rawEntity.album;
          if (typeof alb === "string") {
            albumName = cleanTrackText(alb);
          } else if (typeof alb === "object") {
            const albObj = alb as {
              name?: string;
              id?: string;
              images?: Array<{ url: string }>;
            };
            albumName = cleanTrackText(albObj.name || "Unknown");
            albumId = albObj.id ? cleanSpotifyId(albObj.id) : undefined;
            if (Array.isArray(albObj.images)) {
              for (const img of albObj.images) {
                if (img?.url) albumImages.push({ url: img.url });
              }
            }
          }
        }

        const firstImage = albumImages[0]?.url;

        const singleTrack: Track = {
          id: resolvedId,
          name: trackName,
          artists: trackArtists,
          album: {
            name: albumName,
            id: albumId,
            images: albumImages,
          },
          duration_ms,
          image: firstImage,
          is_youtube: false,
        };

        const collection: Partial<Playlist> = {
          id: resolvedId,
          name: trackName,
          description: `Track by ${artistNames}`,
          images: albumImages,
          tracks: { total: 1 },
          owner: { display_name: artistNames },
          public: true,
          type: "spotify",
        };

        return { playlist: collection, tracks: [singleTrack] };
      }
    }
  }

  // Try 2: Embed HTML
  const scriptRegex =
    /<script\b[^>]*\bid=["'](resource|initial-state|__NEXT_DATA__)["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[2].trim();
    if (!raw) continue;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      try {
        const decoded = Buffer.from(raw, "base64").toString("utf-8");
        parsedJson = JSON.parse(decoded);
      } catch {
        continue;
      }
    }

    if (!parsedJson || typeof parsedJson !== "object") continue;

    const entity = locateEmbedEntity(parsedJson as Record<string, unknown>);
    if (!entity) continue;

    const resolvedId =
      cleanSpotifyId(entity.id || entity.uri) || trackId || "track";
    const trackName = cleanTrackText(entity.name || entity.title || "");

    const rawEntity = entity as Record<string, unknown>;
    const duration_ms: number =
      entity.duration_ms ??
      (typeof rawEntity.duration === "number" ? rawEntity.duration : 0);

    // Artists
    const trackArtists: Array<{ name: string; id?: string }> = [];
    if (Array.isArray(entity.artists)) {
      for (const a of entity.artists) {
        if (typeof a === "string") {
          trackArtists.push({ name: cleanTrackText(a) });
        } else if (a && typeof a === "object") {
          trackArtists.push({
            name: cleanTrackText(a.name || "Unknown"),
            id: a.id ? cleanSpotifyId(a.id) : undefined,
          });
        }
      }
    } else if (typeof entity.artists === "string") {
      trackArtists.push({ name: cleanTrackText(entity.artists) });
    } else if (entity.subtitle) {
      trackArtists.push({ name: cleanTrackText(entity.subtitle) });
    }

    if (trackArtists.length === 0) {
      trackArtists.push({ name: "Unknown" });
    }

    const artistNames = trackArtists.map((a) => a.name).join(", ");

    // Album
    let albumName = "Unknown";
    let albumId: string | undefined;
    const albumImages: Array<{ url: string }> = [];

    const alb = rawEntity.album;
    if (typeof alb === "string") {
      albumName = cleanTrackText(alb);
    } else if (alb && typeof alb === "object") {
      const albObj = alb as {
        name?: string;
        id?: string;
        images?: Array<{ url: string }>;
      };
      albumName = cleanTrackText(albObj.name || "Unknown");
      albumId = albObj.id ? cleanSpotifyId(albObj.id) : undefined;
      if (Array.isArray(albObj.images)) {
        for (const img of albObj.images) {
          if (typeof img === "string") albumImages.push({ url: img });
          else if (img?.url) albumImages.push({ url: img.url });
        }
      }
    }

    if (albumImages.length === 0) {
      if (Array.isArray(entity.images)) {
        for (const img of entity.images) {
          if (typeof img === "string") albumImages.push({ url: img });
          else if (img?.url) albumImages.push({ url: img.url });
        }
      } else if (entity.coverArt?.sources) {
        for (const s of entity.coverArt.sources) {
          if (s?.url) albumImages.push({ url: s.url });
        }
      } else if (entity.image) {
        albumImages.push({ url: entity.image });
      }
    }

    const firstImage = albumImages[0]?.url || entity.image;

    const singleTrack: Track = {
      id: resolvedId,
      name: trackName,
      artists: trackArtists,
      album: {
        name: albumName,
        id: albumId,
        images: albumImages,
      },
      duration_ms,
      image: firstImage,
      is_youtube: false,
    };

    const collection: Partial<Playlist> = {
      id: resolvedId,
      name: trackName,
      description: `Track by ${artistNames}`,
      images: albumImages,
      tracks: { total: 1 },
      owner: { display_name: artistNames },
      public: true,
      type: "spotify",
    };

    return { playlist: collection, tracks: [singleTrack] };
  }

  return null;
}
