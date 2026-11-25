import { vi, describe, it, expect, beforeEach } from "vitest";
import { net } from "electron";
import { SpotifyService, extractPlaylistId } from "./SpotifyService";
import { PreferencesService } from "./PreferencesService";
import { store } from "../store";

// Mock electron
vi.mock("electron", () => ({
  net: {
    fetch: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  app: {
    getPath: vi.fn().mockReturnValue("/mock/downloads"),
    setPath: vi.fn(),
  },
}));

// Mock store
vi.mock("../store", () => ({
  store: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock config/env
vi.mock("../config/env", () => ({
  getMainEnv: vi.fn().mockReturnValue("mock-spotify-client-id"),
}));

// Mock logger
vi.mock("../utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

function mockResponse(
  status: number,
  body: string | Record<string, unknown>,
  ok = status >= 200 && status < 300,
) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  };
}

const mockEmbedHtml = `
<!DOCTYPE html>
<html>
<head>
  <script id="resource" type="application/json">
  {
    "id": "37i9dQZF1DXcBWIGoYBM5M",
    "name": "Today's Top Hits",
    "description": "Top music hits of today",
    "images": [{"url": "https://i.scdn.co/image/embed_cover.jpg"}],
    "owner": {"display_name": "Spotify"},
    "tracks": {
      "total": 2,
      "items": [
        {
          "id": "track_embed_1",
          "name": "Embed Track 1",
          "duration": 200000,
          "artists": [{"name": "Artist One", "id": "art1"}],
          "album": {"name": "Album One", "id": "alb1"}
        },
        {
          "id": "track_embed_2",
          "name": "Embed Track 2",
          "duration": 180000,
          "artists": [{"name": "Artist Two", "id": "art2"}],
          "album": {"name": "Album Two", "id": "alb2"}
        }
      ]
    }
  }
  </script>
</head>
<body></body>
</html>
`;

const mockEmbedHtmlEmptyTracks = `
<!DOCTYPE html>
<html>
<head>
  <script id="resource" type="application/json">
  {
    "id": "37i9dQZF1DXcBWIGoYBM5M",
    "name": "Empty Embed Playlist",
    "tracks": {
      "total": 0,
      "items": []
    }
  }
  </script>
</head>
<body></body>
</html>
`;

const openStateData = {
  entities: {
    items: {
      "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M": {
        id: "37i9dQZF1DXcBWIGoYBM5M",
        name: "Open Web Player Hits",
        description: "Open page description",
        images: [{ url: "https://i.scdn.co/image/open_cover.jpg" }],
        owner: { display_name: "Spotify Curator" },
        content: {
          totalCount: 1,
          items: [
            {
              itemV2: {
                data: {
                  uri: "spotify:track:open_track_1",
                  name: "Open Track 1",
                  duration: { totalMilliseconds: 215000 },
                  artists: {
                    items: [
                      {
                        profile: { name: "Open Page Artist" },
                        uri: "spotify:artist:open_art_1",
                      },
                    ],
                  },
                  albumOfTrack: {
                    name: "Open Page Album",
                    uri: "spotify:album:open_alb_1",
                    coverArt: {
                      sources: [
                        { url: "https://i.scdn.co/image/open_album_art.jpg" },
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
  },
};

const mockOpenHtml = `
<!DOCTYPE html>
<html>
<head>
  <script id="initialState" type="text/plain">${Buffer.from(JSON.stringify(openStateData)).toString("base64")}</script>
</head>
<body></body>
</html>
`;

const mockOembedData = {
  title: "oEmbed Playlist Title",
  author_name: "oEmbed Author",
  thumbnail_url: "https://i.scdn.co/image/oembed_thumb.jpg",
  tracks_count: 25,
};

const mockAlbumEmbedHtml = `
<!DOCTYPE html>
<html>
<head>
  <script id="resource" type="application/json">
  {
    "id": "4aawyAB9vmqN3uQ7FjRGTy",
    "type": "album",
    "name": "Random Access Memories",
    "subtitle": "Daft Punk",
    "images": [{"url": "https://i.scdn.co/image/ram_cover.jpg"}],
    "trackList": [
      {
        "id": "track_ram_1",
        "title": "Give Life Back to Music",
        "duration": 274000,
        "artists": [{"name": "Daft Punk", "id": "artist_dp"}]
      },
      {
        "id": "track_ram_2",
        "title": "Get Lucky",
        "duration": 369000,
        "artists": [{"name": "Daft Punk", "id": "artist_dp"}]
      }
    ]
  }
  </script>
</head>
<body></body>
</html>
`;

const mockTrackEmbedHtml = `
<!DOCTYPE html>
<html>
<head>
  <script id="resource" type="application/json">
  {
    "id": "11dFghVXANMlKmJXsNCbNl",
    "type": "track",
    "name": "Clint Eastwood",
    "subtitle": "Gorillaz",
    "album": {
      "name": "Gorillaz",
      "id": "alb_gorillaz_1",
      "images": [{"url": "https://i.scdn.co/image/gorillaz.jpg"}]
    },
    "duration": 340000,
    "images": [{"url": "https://i.scdn.co/image/gorillaz.jpg"}]
  }
  </script>
</head>
<body></body>
</html>
`;

describe("SpotifyService & URL Normalization", () => {
  let service: SpotifyService;
  let mockPreferencesService: PreferencesService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferencesService = {
      getRegion: vi.fn().mockReturnValue("CL"),
    } as unknown as PreferencesService;
    service = new SpotifyService(mockPreferencesService);
    // Ensure unauthenticated by default
    vi.mocked(store.get).mockReturnValue(undefined);
  });

  describe("extractPlaylistId", () => {
    it("extracts ID from standard Spotify URL", () => {
      expect(
        extractPlaylistId(
          "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
        ),
      ).toBe("37i9dQZF1DXcBWIGoYBM5M");
    });

    it("extracts ID from URL with query parameters", () => {
      expect(
        extractPlaylistId(
          "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123xyz&pt=456",
        ),
      ).toBe("37i9dQZF1DXcBWIGoYBM5M");
    });

    it("extracts ID from embed URL", () => {
      expect(
        extractPlaylistId(
          "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
        ),
      ).toBe("37i9dQZF1DXcBWIGoYBM5M");
    });

    it("extracts ID from embed URL with query parameters", () => {
      expect(
        extractPlaylistId(
          "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator",
        ),
      ).toBe("37i9dQZF1DXcBWIGoYBM5M");
    });

    it("extracts ID from localized URLs (e.g., /intl-es/)", () => {
      expect(
        extractPlaylistId(
          "https://open.spotify.com/intl-es/playlist/37i9dQZF1DXcBWIGoYBM5M",
        ),
      ).toBe("37i9dQZF1DXcBWIGoYBM5M");
      expect(
        extractPlaylistId(
          "https://open.spotify.com/intl-es/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?si=test",
        ),
      ).toBe("37i9dQZF1DXcBWIGoYBM5M");
    });

    it("extracts ID from spotify URI schemes", () => {
      expect(extractPlaylistId("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe(
        "37i9dQZF1DXcBWIGoYBM5M",
      );
      expect(
        extractPlaylistId("spotify:playlist::37i9dQZF1DXcBWIGoYBM5M"),
      ).toBe("37i9dQZF1DXcBWIGoYBM5M");
    });

    it("extracts ID from raw base62 playlist ID", () => {
      expect(extractPlaylistId("37i9dQZF1DXcBWIGoYBM5M")).toBe(
        "37i9dQZF1DXcBWIGoYBM5M",
      );
      expect(extractPlaylistId("  37i9dQZF1DXcBWIGoYBM5M  ")).toBe(
        "37i9dQZF1DXcBWIGoYBM5M",
      );
    });

    it("extracts ID from album URLs and URIs", () => {
      expect(
        extractPlaylistId(
          "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy",
        ),
      ).toBe("4aawyAB9vmqN3uQ7FjRGTy");
      expect(
        extractPlaylistId(
          "https://open.spotify.com/intl-es/album/4aawyAB9vmqN3uQ7FjRGTy?si=abc",
        ),
      ).toBe("4aawyAB9vmqN3uQ7FjRGTy");
      expect(extractPlaylistId("spotify:album:4aawyAB9vmqN3uQ7FjRGTy")).toBe(
        "4aawyAB9vmqN3uQ7FjRGTy",
      );
      expect(extractPlaylistId("spotify:album::4aawyAB9vmqN3uQ7FjRGTy")).toBe(
        "4aawyAB9vmqN3uQ7FjRGTy",
      );
    });

    it("extracts ID from track URLs and URIs", () => {
      expect(
        extractPlaylistId(
          "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl",
        ),
      ).toBe("11dFghVXANMlKmJXsNCbNl");
      expect(
        extractPlaylistId(
          "https://open.spotify.com/intl-de/track/11dFghVXANMlKmJXsNCbNl?si=xyz",
        ),
      ).toBe("11dFghVXANMlKmJXsNCbNl");
      expect(extractPlaylistId("spotify:track:11dFghVXANMlKmJXsNCbNl")).toBe(
        "11dFghVXANMlKmJXsNCbNl",
      );
      expect(extractPlaylistId("spotify:track::11dFghVXANMlKmJXsNCbNl")).toBe(
        "11dFghVXANMlKmJXsNCbNl",
      );
    });

    it("throws an error for invalid input or malformed URLs", () => {
      expect(() => extractPlaylistId("")).toThrow(
        "Invalid Spotify playlist URL or ID",
      );
      expect(() =>
        extractPlaylistId("https://notspotify.com/playlist/123"),
      ).toThrow();
      expect(() => extractPlaylistId("random-nonsense-string-!!!")).toThrow();
    });
  });

  describe("Multi-Tier Cascade (Zero-Login Public Ingestion)", () => {
    it("Tier 1: successfully extracts playlist and tracks from Embed endpoint", async () => {
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(200, mockEmbedHtml) as any,
      );

      const playlist = await service.getPlaylist(
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123",
      );

      expect(playlist).toBeDefined();
      expect(playlist.id).toBe("37i9dQZF1DXcBWIGoYBM5M");
      expect(playlist.name).toBe("Today's Top Hits");
      expect(playlist.tracks.total).toBe(2);
      expect(playlist.images[0].url).toBe(
        "https://i.scdn.co/image/embed_cover.jpg",
      );
      expect(playlist.owner.display_name).toBe("Spotify");

      // Verify net.fetch was called with the embed URL
      expect(net.fetch).toHaveBeenCalledWith(
        "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
      );

      // Verify getPlaylistTracks returns tracks without secondary network fetch if cached
      const tracks = await service.getPlaylistTracks("37i9dQZF1DXcBWIGoYBM5M");
      expect(tracks).toHaveLength(2);
      expect(tracks[0].name).toBe("Embed Track 1");
      expect(tracks[0].artists[0].name).toBe("Artist One");
    });

    it("Tier 2 Fallback: falls back to Open Page when Tier 1 returns 404", async () => {
      // Tier 1 returns 404
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(404, "Not Found") as any,
      );
      // Tier 2 returns 200 with open page HTML
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(200, mockOpenHtml) as any,
      );

      const playlist = await service.getPlaylist(
        "https://open.spotify.com/intl-es/playlist/37i9dQZF1DXcBWIGoYBM5M",
      );

      expect(playlist.name).toBe("Open Web Player Hits");
      expect(playlist.tracks.total).toBe(1);

      const tracks = await service.getPlaylistTracks("37i9dQZF1DXcBWIGoYBM5M");
      expect(tracks).toHaveLength(1);
      expect(tracks[0].name).toBe("Open Track 1");
      expect(tracks[0].artists[0].name).toBe("Open Page Artist");
      expect(tracks[0].album.name).toBe("Open Page Album");

      // Verify Tier 1 then Tier 2 were called
      expect(net.fetch).toHaveBeenNthCalledWith(
        1,
        "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
      );
      expect(net.fetch).toHaveBeenNthCalledWith(
        2,
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      );
    });

    it("Tier 2 Fallback: falls back to Open Page when Tier 1 returns 0 tracks", async () => {
      // Tier 1 returns empty tracks
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(200, mockEmbedHtmlEmptyTracks) as any,
      );
      // Tier 2 returns open page
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(200, mockOpenHtml) as any,
      );

      const tracks = await service.getPlaylistTracks(
        "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
      );

      expect(tracks).toHaveLength(1);
      expect(tracks[0].name).toBe("Open Track 1");
    });

    it("Tier 3 Fallback: fetches oEmbed when metadata is missing or partial", async () => {
      // Tier 1 returns tracks but lacks complete metadata (e.g. name or image)
      const embedWithoutCover = `
      <html>
      <head>
        <script id="resource" type="application/json">
        {
          "id": "37i9dQZF1DXcBWIGoYBM5M",
          "name": "",
          "images": [],
          "tracks": {
            "total": 1,
            "items": [
              {
                "id": "t1",
                "name": "Track Only",
                "artists": [{"name": "A1"}],
                "album": {"name": "Alb1"}
              }
            ]
          }
        }
        </script>
      </head>
      <body></body>
      </html>
      `;

      // Tier 1 call
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(200, embedWithoutCover) as any,
      );
      // Tier 3 oEmbed call
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(200, mockOembedData) as any,
      );

      const playlist = await service.getPlaylist("37i9dQZF1DXcBWIGoYBM5M");

      expect(playlist.name).toBe("oEmbed Playlist Title");
      expect(playlist.owner.display_name).toBe("oEmbed Author");
      expect(playlist.images[0].url).toBe(
        "https://i.scdn.co/image/oembed_thumb.jpg",
      );
    });

    it("Error Handling: throws when playlist is unreachable or not found across all tiers", async () => {
      // Tier 1 404
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(404, "Not Found") as any,
      );
      // Tier 2 404
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(404, "Not Found") as any,
      );
      // Tier 3 404
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(404, "Not Found") as any,
      );

      await expect(
        service.getPlaylist("37i9dQZF1DXcBWIGoYBM5M"),
      ).rejects.toThrow(/unreachable or not found/i);
    });

    it("Error Handling: throws when invalid playlist URL is passed", async () => {
      await expect(
        service.getPlaylist("https://invalid-url.com/nothing"),
      ).rejects.toThrow();

      await expect(service.getPlaylistTracks("")).rejects.toThrow();
    });

    it("Album Cascade: ingests album from public embed and caches tracks", async () => {
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(200, mockAlbumEmbedHtml) as any,
      );

      const albumUrl = "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy";
      const playlist = await service.getPlaylist(albumUrl);

      expect(playlist.id).toBe("4aawyAB9vmqN3uQ7FjRGTy");
      expect(playlist.name).toBe("Random Access Memories");
      expect(playlist.owner.display_name).toBe("Daft Punk");
      expect(playlist.tracks.total).toBe(2);

      // Verify net.fetch was called with embed album URL
      expect(net.fetch).toHaveBeenCalledWith(
        "https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy",
      );

      // Subsequent getPlaylistTracks should serve from memory cache without additional net.fetch
      const tracks = await service.getPlaylistTracks(albumUrl);
      expect(tracks.length).toBe(2);
      expect(tracks[0].name).toBe("Give Life Back to Music");
      expect(tracks[1].name).toBe("Get Lucky");
      expect(net.fetch).toHaveBeenCalledTimes(1);
    });

    it("Track Cascade: ingests single track as 1-item review collection and caches it", async () => {
      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(200, mockTrackEmbedHtml) as any,
      );

      const trackUrl = "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl";
      const playlist = await service.getPlaylist(trackUrl);

      expect(playlist.id).toBe("11dFghVXANMlKmJXsNCbNl");
      expect(playlist.name).toBe("Clint Eastwood");
      expect(playlist.owner.display_name).toBe("Gorillaz");
      expect(playlist.tracks.total).toBe(1);

      // Verify net.fetch was called with embed track URL
      expect(net.fetch).toHaveBeenCalledWith(
        "https://open.spotify.com/embed/track/11dFghVXANMlKmJXsNCbNl",
      );

      // Subsequent getPlaylistTracks should serve from memory cache
      const tracks = await service.getPlaylistTracks(trackUrl);
      expect(tracks.length).toBe(1);
      expect(tracks[0].name).toBe("Clint Eastwood");
      expect(tracks[0].artists[0].name).toBe("Gorillaz");
      expect(net.fetch).toHaveBeenCalledTimes(1);
    });

    it("Legacy Scraper Removal: verifies legacy regex methods are removed", () => {
      const untypedService = service as any;
      expect(untypedService.scrapePlaylistTracks).toBeUndefined();
      expect(untypedService.scrapePlaylistMetadata).toBeUndefined();
    });
  });
});
