import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  parseOpenPageHtml,
  parseEmbedHtml,
  parseAlbumHtml,
  parseTrackHtml,
  parseOembedJson,
  decodeHtmlEntities,
  cleanTrackText,
  extractSpotifyEntity,
} from "./spotifyParser";

describe("spotifyParser", () => {
  describe("parseOpenPageHtml", () => {
    it("parses real playlist_dump.html fixture correctly", () => {
      const dumpPath = path.resolve(__dirname, "../../../playlist_dump.html");
      const html = fs.readFileSync(dumpPath, "utf-8");

      const result = parseOpenPageHtml(html, "37i9dQZF1DXcBWIGoYBM5M");
      expect(result).not.toBeNull();
      if (!result) return;

      const { playlist, tracks } = result;

      // Assert Playlist metadata
      expect(playlist.id).toBe("37i9dQZF1DXcBWIGoYBM5M");
      expect(playlist.name).toBe("Today’s Top Hits");
      expect(playlist.description).toContain("The hottest 50");
      expect(playlist.owner?.display_name).toBe("Spotify");
      expect(playlist.tracks?.total).toBe(50);
      expect(playlist.images).toBeDefined();
      expect(playlist.images?.length).toBeGreaterThan(0);
      expect(playlist.images?.[0].url).toContain("i.scdn.co");

      // Assert Tracks
      expect(tracks.length).toBe(30);

      const firstTrack = tracks[0];
      expect(firstTrack.id).toBe("3qhlB30KknSejmIvZZLjOD");
      expect(firstTrack.name).toBe("End of Beginning");
      expect(firstTrack.duration_ms).toBe(159245);
      expect(firstTrack.artists).toEqual([
        {
          name: "Djo",
          id: "5p9HO3XC5P3BLxJs5Mtrhm",
        },
      ]);
      expect(firstTrack.album.name).toBe("DECIDE");
      expect(firstTrack.album.id).toBe("4JDXBZdRPId4devseaAOKH");
      expect(firstTrack.album.images?.length).toBeGreaterThan(0);
      expect(firstTrack.image).toBe(
        "https://i.scdn.co/image/ab67616d00001e02fddfffec51b4580acae727c1",
      );
    });

    it("parses empty playlist from Open Page initialState", () => {
      const payload = {
        entities: {
          items: {
            "spotify:playlist:empty123": {
              id: "empty123",
              name: "Empty Playlist",
              content: {
                totalCount: 0,
                items: [],
              },
            },
          },
        },
      };
      const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
      const html = `<html><body><script id="initialState" type="text/plain">${b64}</script></body></html>`;

      const result = parseOpenPageHtml(html, "empty123");
      expect(result).not.toBeNull();
      expect(result?.playlist.name).toBe("Empty Playlist");
      expect(result?.tracks).toEqual([]);
    });

    it("parses single-track playlist with Unicode and special characters", () => {
      const payload = {
        entities: {
          items: {
            "spotify:playlist:unicode123": {
              id: "unicode123",
              name: "Café Música & ☕ 日本語ロック",
              description: "Música de Chile & más 🇨🇱",
              images: {
                items: [
                  {
                    sources: [
                      {
                        url: "https://example.com/cover.jpg",
                        width: 300,
                        height: 300,
                      },
                    ],
                  },
                ],
              },
              ownerV2: {
                data: {
                  name: "Valparaíso Sounds",
                },
              },
              content: {
                totalCount: 1,
                items: [
                  {
                    itemV2: {
                      __typename: "TrackResponseWrapper",
                      data: {
                        __typename: "Track",
                        uri: "spotify:track:track_uni_1",
                        name: "Canción del Sur 🎵",
                        duration: { totalMilliseconds: 210000 },
                        artists: {
                          items: [
                            {
                              uri: "spotify:artist:art_1",
                              profile: { name: "Los Jaivas" },
                            },
                          ],
                        },
                        albumOfTrack: {
                          uri: "spotify:album:alb_1",
                          name: "Alturas de Macchu Picchu",
                          coverArt: {
                            sources: [
                              {
                                url: "https://example.com/album.jpg",
                                width: 640,
                                height: 640,
                              },
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
      const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
      const html = `<script id="initialState" type="text/plain">${b64}</script>`;

      const result = parseOpenPageHtml(html, "unicode123");
      expect(result).not.toBeNull();
      expect(result?.playlist.name).toBe("Café Música & ☕ 日本語ロック");
      expect(result?.playlist.owner?.display_name).toBe("Valparaíso Sounds");
      expect(result?.tracks.length).toBe(1);
      expect(result?.tracks[0].name).toBe("Canción del Sur 🎵");
      expect(result?.tracks[0].artists[0].name).toBe("Los Jaivas");
      expect(result?.tracks[0].album.name).toBe("Alturas de Macchu Picchu");
    });

    it("returns null for malformed HTML or missing script tag", () => {
      expect(
        parseOpenPageHtml("<div>No script here</div>", "any_id"),
      ).toBeNull();
      expect(
        parseOpenPageHtml(
          '<script id="initialState" type="text/plain">NotBase64!!</script>',
          "any_id",
        ),
      ).toBeNull();
    });

    it("returns null when playlist entity is not found in initialState", () => {
      const payload = {
        entities: {
          items: {},
        },
      };
      const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
      const html = `<script id="initialState" type="text/plain">${b64}</script>`;

      expect(parseOpenPageHtml(html, "unknown_id")).toBeNull();
    });
  });

  describe("parseEmbedHtml", () => {
    it("parses embed HTML with script id='resource'", () => {
      const resourceData = {
        type: "playlist",
        id: "embed_res_1",
        name: "Electronic Classics",
        description: "Classic electronic vibes",
        images: [{ url: "https://example.com/res_cover.jpg" }],
        tracks: {
          items: [
            {
              track: {
                id: "track_res_1",
                uri: "spotify:track:track_res_1",
                name: "Windowlicker",
                duration_ms: 367000,
                artists: [{ name: "Aphex Twin", id: "aphex_1" }],
                album: {
                  name: "Windowlicker EP",
                  id: "album_res_1",
                  images: [{ url: "https://example.com/album_res.jpg" }],
                },
              },
            },
          ],
          total: 1,
        },
      };

      const html = `<html><head><script id="resource" type="application/json">${JSON.stringify(
        resourceData,
      )}</script></head><body></body></html>`;

      const result = parseEmbedHtml(html);
      expect(result).not.toBeNull();
      expect(result?.playlist.id).toBe("embed_res_1");
      expect(result?.playlist.name).toBe("Electronic Classics");
      expect(result?.tracks.length).toBe(1);
      expect(result?.tracks[0].id).toBe("track_res_1");
      expect(result?.tracks[0].name).toBe("Windowlicker");
      expect(result?.tracks[0].artists[0].name).toBe("Aphex Twin");
      expect(result?.tracks[0].album.name).toBe("Windowlicker EP");
      expect(result?.tracks[0].duration_ms).toBe(367000);
    });

    it("parses embed HTML with script id='__NEXT_DATA__'", () => {
      const nextData = {
        props: {
          pageProps: {
            state: {
              data: {
                entity: {
                  type: "playlist",
                  id: "embed_next_1",
                  name: "Synthwave Beats",
                  description: "Retro synth dreams",
                  images: [{ url: "https://example.com/synth_cover.jpg" }],
                  trackList: [
                    {
                      id: "track_next_1",
                      uri: "spotify:track:track_next_1",
                      title: "Tech Noir",
                      subtitle: "Gunship",
                      artists: [{ name: "Gunship", id: "gunship_1" }],
                      duration: 297000,
                      album: "Gunship",
                    },
                    {
                      id: "track_next_2",
                      uri: "spotify:track:track_next_2",
                      name: "Turbo Killer",
                      artists: [{ name: "Carpenter Brut" }],
                      duration_ms: 208000,
                      album: { name: "Trilogy" },
                    },
                  ],
                },
              },
            },
          },
        },
      };

      const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
        nextData,
      )}</script></body></html>`;

      const result = parseEmbedHtml(html);
      expect(result).not.toBeNull();
      expect(result?.playlist.id).toBe("embed_next_1");
      expect(result?.playlist.name).toBe("Synthwave Beats");
      expect(result?.tracks.length).toBe(2);

      expect(result?.tracks[0].id).toBe("track_next_1");
      expect(result?.tracks[0].name).toBe("Tech Noir");
      expect(result?.tracks[0].artists[0].name).toBe("Gunship");
      expect(result?.tracks[0].album.name).toBe("Gunship");
      expect(result?.tracks[0].duration_ms).toBe(297000);

      expect(result?.tracks[1].id).toBe("track_next_2");
      expect(result?.tracks[1].name).toBe("Turbo Killer");
      expect(result?.tracks[1].artists[0].name).toBe("Carpenter Brut");
      expect(result?.tracks[1].album.name).toBe("Trilogy");
      expect(result?.tracks[1].duration_ms).toBe(208000);
    });

    it("parses embed HTML with script id='initial-state'", () => {
      const initialStateData = {
        data: {
          entity: {
            id: "embed_init_1",
            name: "Ambient Focus",
            trackList: [
              {
                id: "track_init_1",
                title: "Weightless",
                subtitle: "Marconi Union",
                duration: 485000,
              },
            ],
          },
        },
      };

      const html = `<script id="initial-state" type="application/json">${JSON.stringify(
        initialStateData,
      )}</script>`;

      const result = parseEmbedHtml(html);
      expect(result).not.toBeNull();
      expect(result?.playlist.id).toBe("embed_init_1");
      expect(result?.playlist.name).toBe("Ambient Focus");
      expect(result?.tracks.length).toBe(1);
      expect(result?.tracks[0].name).toBe("Weightless");
      expect(result?.tracks[0].artists[0].name).toBe("Marconi Union");
      expect(result?.tracks[0].duration_ms).toBe(485000);
    });

    it("handles empty playlist in embed HTML", () => {
      const resourceData = {
        type: "playlist",
        id: "empty_embed",
        name: "Empty Embed",
        tracks: { items: [], total: 0 },
      };
      const html = `<script id="resource" type="application/json">${JSON.stringify(
        resourceData,
      )}</script>`;

      const result = parseEmbedHtml(html);
      expect(result).not.toBeNull();
      expect(result?.playlist.name).toBe("Empty Embed");
      expect(result?.tracks).toEqual([]);
    });

    it("handles special characters and Unicode in embed HTML", () => {
      const resourceData = {
        type: "playlist",
        id: "unicode_embed",
        name: "Daft Punk &amp; Leiji Matsumoto — 宇宙",
        tracks: {
          items: [
            {
              track: {
                id: "track_u1",
                name: "One More Time (12&#x27; Mix)",
                artists: [{ name: "Daft Punk &amp; Romanthony" }],
                album: { name: "Discovery &apos;01" },
                duration_ms: 320000,
              },
            },
          ],
        },
      };
      const html = `<script id="resource" type="application/json">${JSON.stringify(
        resourceData,
      )}</script>`;

      const result = parseEmbedHtml(html);
      expect(result).not.toBeNull();
      expect(result?.playlist.name).toBe("Daft Punk & Leiji Matsumoto — 宇宙");
      expect(result?.tracks[0].name).toBe("One More Time (12' Mix)");
      expect(result?.tracks[0].artists[0].name).toBe("Daft Punk & Romanthony");
      expect(result?.tracks[0].album.name).toBe("Discovery '01");
    });

    it("returns null for malformed embed HTML", () => {
      expect(parseEmbedHtml("<div>No relevant scripts</div>")).toBeNull();
      expect(
        parseEmbedHtml(
          '<script id="resource" type="application/json">{invalid json</script>',
        ),
      ).toBeNull();
    });
  });

  describe("parseOembedJson", () => {
    it("parses standard Spotify oEmbed response correctly", () => {
      const oembed = {
        html: '<iframe src="..."></iframe>',
        width: 456,
        height: 152,
        version: "1.0",
        provider_name: "Spotify",
        provider_url: "https://spotify.com",
        type: "rich",
        title: "Today's Top Hits",
        thumbnail_url:
          "https://i.scdn.co/image/ab67706f00000002267b0f4979ef8caee19fae84",
        thumbnail_width: 300,
        thumbnail_height: 300,
        author_name: "Spotify",
      };

      const result = parseOembedJson(oembed, "37i9dQZF1DXcBWIGoYBM5M");
      expect(result.id).toBe("37i9dQZF1DXcBWIGoYBM5M");
      expect(result.name).toBe("Today's Top Hits");
      expect(result.owner?.display_name).toBe("Spotify");
      expect(result.images).toEqual([
        {
          url: "https://i.scdn.co/image/ab67706f00000002267b0f4979ef8caee19fae84",
        },
      ]);
      expect(result.public).toBe(true);
      expect(result.type).toBe("spotify");
    });

    it("handles minimal / missing oembed fields gracefully", () => {
      const oembed = {};
      const result = parseOembedJson(oembed, "playlist_fallback_1");
      expect(result.id).toBe("playlist_fallback_1");
      expect(result.name).toBe("Spotify Playlist");
      expect(result.owner?.display_name).toBe("Spotify");
      expect(result.images).toEqual([]);
    });

    it("decodes HTML entities and handles Unicode in oEmbed metadata", () => {
      const oembed = {
        title: "Caf&eacute; &amp; Lounge &#8212; 🇨🇱",
        author_name: "Dj &amp; Curador",
        thumbnail_url: "https://example.com/thumb.jpg",
      };
      const result = parseOembedJson(oembed, "pl_uni_1");
      expect(result.name).toBe("Café & Lounge — 🇨🇱");
      expect(result.owner?.display_name).toBe("Dj & Curador");
    });
  });

  describe("cleanTrackText & decodeHtmlEntities", () => {
    it("decodes nested and double-escaped HTML entities completely", () => {
      expect(decodeHtmlEntities("Guns &amp;amp; Roses")).toBe("Guns & Roses");
      expect(decodeHtmlEntities("Simon &amp;amp;amp; Garfunkel")).toBe(
        "Simon & Garfunkel",
      );
      expect(decodeHtmlEntities("&quot;Hello &amp; Welcome&quot;")).toBe(
        '"Hello & Welcome"',
      );
    });

    it("cleans non-breaking spaces, zero-width characters, and normalizes whitespace", () => {
      expect(cleanTrackText("Olivia Rodrigo,\u00a0Chappell Roan")).toBe(
        "Olivia Rodrigo, Chappell Roan",
      );
      expect(cleanTrackText("Artist\u200B Name  &amp;  Co.")).toBe(
        "Artist Name & Co.",
      );
      expect(cleanTrackText("  Track &apos;Title&apos;   ")).toBe(
        "Track 'Title'",
      );
    });
  });

  describe("extractSpotifyEntity", () => {
    it("extracts playlist URLs and URIs", () => {
      expect(
        extractSpotifyEntity(
          "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
        ),
      ).toEqual({
        type: "playlist",
        id: "37i9dQZF1DXcBWIGoYBM5M",
      });
      expect(
        extractSpotifyEntity(
          "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
        ),
      ).toEqual({
        type: "playlist",
        id: "37i9dQZF1DXcBWIGoYBM5M",
      });
      expect(
        extractSpotifyEntity(
          "https://open.spotify.com/intl-es/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123xyz",
        ),
      ).toEqual({
        type: "playlist",
        id: "37i9dQZF1DXcBWIGoYBM5M",
      });
      expect(
        extractSpotifyEntity("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"),
      ).toEqual({
        type: "playlist",
        id: "37i9dQZF1DXcBWIGoYBM5M",
      });
      expect(
        extractSpotifyEntity("spotify:playlist::37i9dQZF1DXcBWIGoYBM5M"),
      ).toEqual({
        type: "playlist",
        id: "37i9dQZF1DXcBWIGoYBM5M",
      });
    });

    it("extracts album URLs and URIs", () => {
      expect(
        extractSpotifyEntity(
          "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy",
        ),
      ).toEqual({
        type: "album",
        id: "4aawyAB9vmqN3uQ7FjRGTy",
      });
      expect(
        extractSpotifyEntity(
          "https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy",
        ),
      ).toEqual({
        type: "album",
        id: "4aawyAB9vmqN3uQ7FjRGTy",
      });
      expect(
        extractSpotifyEntity(
          "https://open.spotify.com/intl-pt/album/4aawyAB9vmqN3uQ7FjRGTy?si=feedbeef123",
        ),
      ).toEqual({
        type: "album",
        id: "4aawyAB9vmqN3uQ7FjRGTy",
      });
      expect(
        extractSpotifyEntity("spotify:album:4aawyAB9vmqN3uQ7FjRGTy"),
      ).toEqual({
        type: "album",
        id: "4aawyAB9vmqN3uQ7FjRGTy",
      });
      expect(
        extractSpotifyEntity("spotify:album::4aawyAB9vmqN3uQ7FjRGTy"),
      ).toEqual({
        type: "album",
        id: "4aawyAB9vmqN3uQ7FjRGTy",
      });
    });

    it("extracts track URLs and URIs", () => {
      expect(
        extractSpotifyEntity(
          "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl",
        ),
      ).toEqual({
        type: "track",
        id: "11dFghVXANMlKmJXsNCbNl",
      });
      expect(
        extractSpotifyEntity(
          "https://open.spotify.com/embed/track/11dFghVXANMlKmJXsNCbNl",
        ),
      ).toEqual({
        type: "track",
        id: "11dFghVXANMlKmJXsNCbNl",
      });
      expect(
        extractSpotifyEntity(
          "https://open.spotify.com/intl-de/track/11dFghVXANMlKmJXsNCbNl?si=tracktest999",
        ),
      ).toEqual({
        type: "track",
        id: "11dFghVXANMlKmJXsNCbNl",
      });
      expect(
        extractSpotifyEntity("spotify:track:11dFghVXANMlKmJXsNCbNl"),
      ).toEqual({
        type: "track",
        id: "11dFghVXANMlKmJXsNCbNl",
      });
      expect(
        extractSpotifyEntity("spotify:track::11dFghVXANMlKmJXsNCbNl"),
      ).toEqual({
        type: "track",
        id: "11dFghVXANMlKmJXsNCbNl",
      });
    });

    it("extracts short prefix notations and raw IDs", () => {
      expect(extractSpotifyEntity("album:4aawyAB9vmqN3uQ7FjRGTy")).toEqual({
        type: "album",
        id: "4aawyAB9vmqN3uQ7FjRGTy",
      });
      expect(extractSpotifyEntity("track:11dFghVXANMlKmJXsNCbNl")).toEqual({
        type: "track",
        id: "11dFghVXANMlKmJXsNCbNl",
      });
      expect(extractSpotifyEntity("playlist:37i9dQZF1DXcBWIGoYBM5M")).toEqual({
        type: "playlist",
        id: "37i9dQZF1DXcBWIGoYBM5M",
      });
      expect(extractSpotifyEntity("37i9dQZF1DXcBWIGoYBM5M")).toEqual({
        type: "playlist",
        id: "37i9dQZF1DXcBWIGoYBM5M",
      });
    });

    it("throws errors on invalid inputs", () => {
      expect(() => extractSpotifyEntity("")).toThrow();
      expect(() =>
        extractSpotifyEntity("https://notspotify.com/album/123"),
      ).toThrow();
      expect(() =>
        extractSpotifyEntity("random-nonsense-string-!!!"),
      ).toThrow();
    });
  });

  describe("parseAlbumHtml", () => {
    it("parses album Embed resource script correctly", () => {
      const html = `
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
                "id": "track_1",
                "title": "Give Life Back to Music",
                "duration": 274000,
                "artists": [{"name": "Daft Punk", "id": "artist_dp"}]
              },
              {
                "id": "track_2",
                "title": "Get Lucky",
                "duration": 369000,
                "artists": [
                  {"name": "Daft Punk", "id": "artist_dp"},
                  {"name": "Pharrell Williams", "id": "artist_pw"}
                ]
              }
            ]
          }
          </script>
        </head>
        <body></body>
        </html>
      `;

      const result = parseAlbumHtml(html, "4aawyAB9vmqN3uQ7FjRGTy");
      expect(result).not.toBeNull();
      if (!result) return;

      const { playlist, tracks } = result;
      expect(playlist.id).toBe("4aawyAB9vmqN3uQ7FjRGTy");
      expect(playlist.name).toBe("Random Access Memories");
      expect(playlist.owner?.display_name).toBe("Daft Punk");
      expect(playlist.images?.[0]?.url).toBe(
        "https://i.scdn.co/image/ram_cover.jpg",
      );
      expect(playlist.tracks?.total).toBe(2);

      expect(tracks.length).toBe(2);
      expect(tracks[0].name).toBe("Give Life Back to Music");
      expect(tracks[0].album.name).toBe("Random Access Memories");
      expect(tracks[0].artists[0].name).toBe("Daft Punk");
      expect(tracks[1].name).toBe("Get Lucky");
      expect(tracks[1].artists.length).toBe(2);
      expect(tracks[1].artists[1].name).toBe("Pharrell Williams");
    });

    it("parses album Open Page initialState base64 payload", () => {
      const statePayload = {
        entities: {
          items: {
            "spotify:album:4aawyAB9vmqN3uQ7FjRGTy": {
              id: "4aawyAB9vmqN3uQ7FjRGTy",
              name: "Discovery",
              artists: {
                items: [{ profile: { name: "Daft Punk" } }],
              },
              images: {
                items: [
                  {
                    sources: [
                      { url: "https://i.scdn.co/image/discovery_cover.jpg" },
                    ],
                  },
                ],
              },
              content: {
                totalCount: 2,
                items: [
                  {
                    itemV2: {
                      data: {
                        id: "disc_track_1",
                        name: "One More Time",
                        duration: { totalMilliseconds: 320000 },
                        artists: {
                          items: [{ profile: { name: "Daft Punk" } }],
                        },
                      },
                    },
                  },
                  {
                    itemV2: {
                      data: {
                        id: "disc_track_2",
                        name: "Aerodynamic",
                        duration: { totalMilliseconds: 207000 },
                        artists: {
                          items: [{ profile: { name: "Daft Punk" } }],
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

      const b64 = Buffer.from(JSON.stringify(statePayload)).toString("base64");
      const html = `<script id="initialState">${b64}</script>`;

      const result = parseAlbumHtml(html, "4aawyAB9vmqN3uQ7FjRGTy");
      expect(result).not.toBeNull();
      if (!result) return;

      expect(result.playlist.name).toBe("Discovery");
      expect(result.playlist.owner?.display_name).toBe("Daft Punk");
      expect(result.tracks.length).toBe(2);
      expect(result.tracks[0].name).toBe("One More Time");
      expect(result.tracks[0].album.name).toBe("Discovery");
      expect(result.tracks[1].name).toBe("Aerodynamic");
    });

    it("returns null on invalid or empty album HTML", () => {
      expect(parseAlbumHtml("", "album123")).toBeNull();
      expect(
        parseAlbumHtml("<html><body>No scripts</body></html>", "album123"),
      ).toBeNull();
    });
  });

  describe("parseTrackHtml", () => {
    it("parses single track Embed resource script correctly as 1-item collection", () => {
      const html = `
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
              "id": "gorillaz_album_1",
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

      const result = parseTrackHtml(html, "11dFghVXANMlKmJXsNCbNl");
      expect(result).not.toBeNull();
      if (!result) return;

      const { playlist, tracks } = result;
      // Single track collection assertions
      expect(playlist.id).toBe("11dFghVXANMlKmJXsNCbNl");
      expect(playlist.name).toBe("Clint Eastwood");
      expect(playlist.owner?.display_name).toBe("Gorillaz");
      expect(playlist.tracks?.total).toBe(1);
      expect(playlist.images?.[0]?.url).toBe(
        "https://i.scdn.co/image/gorillaz.jpg",
      );

      // Track assertions
      expect(tracks.length).toBe(1);
      const track = tracks[0];
      expect(track.id).toBe("11dFghVXANMlKmJXsNCbNl");
      expect(track.name).toBe("Clint Eastwood");
      expect(track.artists[0].name).toBe("Gorillaz");
      expect(track.album.name).toBe("Gorillaz");
      expect(track.duration_ms).toBe(340000);
      expect(track.image).toBe("https://i.scdn.co/image/gorillaz.jpg");
    });

    it("parses single track Open Page initialState base64 payload", () => {
      const statePayload = {
        entities: {
          items: {
            "spotify:track:11dFghVXANMlKmJXsNCbNl": {
              id: "11dFghVXANMlKmJXsNCbNl",
              name: "Feel Good Inc.",
              duration_ms: 223000,
              artists: {
                items: [{ profile: { name: "Gorillaz" } }],
              },
              albumOfTrack: {
                name: "Demon Days",
                uri: "spotify:album:demon_days_1",
                coverArt: {
                  sources: [{ url: "https://i.scdn.co/image/demon_days.jpg" }],
                },
              },
            },
          },
        },
      };

      const b64 = Buffer.from(JSON.stringify(statePayload)).toString("base64");
      const html = `<script id="initialState">${b64}</script>`;

      const result = parseTrackHtml(html, "11dFghVXANMlKmJXsNCbNl");
      expect(result).not.toBeNull();
      if (!result) return;

      expect(result.playlist.name).toBe("Feel Good Inc.");
      expect(result.playlist.tracks?.total).toBe(1);
      expect(result.tracks.length).toBe(1);
      expect(result.tracks[0].name).toBe("Feel Good Inc.");
      expect(result.tracks[0].album.name).toBe("Demon Days");
      expect(result.tracks[0].duration_ms).toBe(223000);
      expect(result.tracks[0].artists[0].name).toBe("Gorillaz");
    });

    it("returns null on invalid or empty track HTML", () => {
      expect(parseTrackHtml("", "track123")).toBeNull();
      expect(
        parseTrackHtml("<html><body>No scripts</body></html>", "track123"),
      ).toBeNull();
    });
  });
});
