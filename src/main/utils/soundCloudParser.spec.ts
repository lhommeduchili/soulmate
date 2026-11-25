import { describe, it, expect } from "vitest";
import {
  isSoundCloudUrl,
  extractSoundCloudEntity,
  normalizeArtworkUrl,
  parseSoundCloudHydration,
  parseSoundCloudHtml,
  parseSoundCloudOEmbed,
  parseArtistAndTitle,
} from "./soundCloudParser";

describe("SoundCloud Parser Engine (soundCloudParser)", () => {
  describe("isSoundCloudUrl", () => {
    it("identifies standard track URLs", () => {
      expect(
        isSoundCloudUrl(
          "https://soundcloud.com/four-tet/baby-feat-ellie-goulding",
        ),
      ).toBe(true);
      expect(
        isSoundCloudUrl("http://soundcloud.com/bicep/glue?in=bicep/sets/bicep"),
      ).toBe(true);
      expect(
        isSoundCloudUrl("https://www.soundcloud.com/floatingpoints/les-alphas"),
      ).toBe(true);
    });

    it("identifies playlist and set URLs", () => {
      expect(
        isSoundCloudUrl(
          "https://soundcloud.com/resident-advisor/sets/ra-podcast",
        ),
      ).toBe(true);
      expect(
        isSoundCloudUrl(
          "https://soundcloud.com/user-12345/sets/summer-2026-dj-mix",
        ),
      ).toBe(true);
    });

    it("identifies mobile and shortlink URLs", () => {
      expect(isSoundCloudUrl("https://m.soundcloud.com/artist/track")).toBe(
        true,
      );
      expect(isSoundCloudUrl("https://on.soundcloud.com/abc123xyz")).toBe(true);
    });

    it("rejects non-SoundCloud URLs", () => {
      expect(isSoundCloudUrl("https://open.spotify.com/track/12345")).toBe(
        false,
      );
      expect(isSoundCloudUrl("https://youtube.com/watch?v=12345678901")).toBe(
        false,
      );
      expect(isSoundCloudUrl("https://artist.bandcamp.com/album/lp")).toBe(
        false,
      );
      expect(isSoundCloudUrl("random-string")).toBe(false);
      expect(isSoundCloudUrl("")).toBe(false);
    });
  });

  describe("extractSoundCloudEntity", () => {
    it("extracts track entity info correctly", () => {
      const entity = extractSoundCloudEntity(
        "https://soundcloud.com/four-tet/baby-feat-ellie-goulding",
      );
      expect(entity.type).toBe("track");
      expect(entity.artist).toBe("four-tet");
      expect(entity.slug).toBe("baby-feat-ellie-goulding");
    });

    it("extracts set/playlist entity info correctly", () => {
      const entity = extractSoundCloudEntity(
        "https://soundcloud.com/resident-advisor/sets/ra-podcast",
      );
      expect(entity.type).toBe("playlist");
      expect(entity.artist).toBe("resident-advisor");
      expect(entity.slug).toBe("ra-podcast");
    });

    it("handles query params and trailing slashes", () => {
      const entity = extractSoundCloudEntity(
        "https://soundcloud.com/artist-name/track-name/?si=123456&utm_source=clipboard",
      );
      expect(entity.type).toBe("track");
      expect(entity.artist).toBe("artist-name");
      expect(entity.slug).toBe("track-name");
    });

    it("handles mobile shortlinks", () => {
      const entity = extractSoundCloudEntity("https://on.soundcloud.com/zXy89");
      expect(entity.type).toBe("track");
      expect(entity.slug).toBe("zXy89");
    });
  });

  describe("normalizeArtworkUrl", () => {
    it("converts -large to -t500x500 high-resolution artwork", () => {
      const large =
        "https://i1.sndcdn.com/artworks-000123456789-abcdef-large.jpg";
      expect(normalizeArtworkUrl(large)).toBe(
        "https://i1.sndcdn.com/artworks-000123456789-abcdef-t500x500.jpg",
      );
    });

    it("converts -badge or -t300x300 to -t500x500", () => {
      const badge = "https://i1.sndcdn.com/avatars-000999999-badge.jpg";
      expect(normalizeArtworkUrl(badge)).toBe(
        "https://i1.sndcdn.com/avatars-000999999-t500x500.jpg",
      );
      const t300 = "https://i1.sndcdn.com/artworks-123-t300x300.jpg";
      expect(normalizeArtworkUrl(t300)).toBe(
        "https://i1.sndcdn.com/artworks-123-t500x500.jpg",
      );
    });

    it("returns original URL or undefined safely", () => {
      expect(normalizeArtworkUrl("https://example.com/art.png")).toBe(
        "https://example.com/art.png",
      );
      expect(normalizeArtworkUrl(null)).toBeUndefined();
      expect(normalizeArtworkUrl(undefined)).toBeUndefined();
    });
  });

  describe("parseArtistAndTitle", () => {
    it("splits 'Artist - Title' format when present", () => {
      const result = parseArtistAndTitle(
        "Overmono - So U Kno",
        "Overmono Official",
      );
      expect(result.artist).toBe("Overmono");
      expect(result.title).toBe("So U Kno");
    });

    it("uses uploader as artist when title has no delimiter", () => {
      const result = parseArtistAndTitle("Bha (Original Mix)", "Joy Orbison");
      expect(result.artist).toBe("Joy Orbison");
      expect(result.title).toBe("Bha (Original Mix)");
    });

    it("handles multiple delimiters cleanly", () => {
      const result = parseArtistAndTitle(
        "Bicep - Apricots - Live Edit",
        "Bicep",
      );
      expect(result.artist).toBe("Bicep");
      expect(result.title).toBe("Apricots - Live Edit");
    });
  });

  describe("parseSoundCloudHydration", () => {
    it("parses window.__sc_hydration JSON from HTML", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Track</title></head>
          <body>
            <script>window.__sc_hydration = [{"hydratable":"sound","data":{"id":123,"title":"Test"}}];</script>
          </body>
        </html>
      `;
      const hydration = parseSoundCloudHydration(html);
      expect(hydration).toHaveLength(1);
      expect(hydration?.[0]).toEqual({
        hydratable: "sound",
        data: { id: 123, title: "Test" },
      });
    });

    it("returns null if no hydration script is found or invalid JSON", () => {
      expect(
        parseSoundCloudHydration("<html><body>No script</body></html>"),
      ).toBeNull();
      expect(
        parseSoundCloudHydration(
          "<script>window.__sc_hydration = invalid json;</script>",
        ),
      ).toBeNull();
    });
  });

  describe("parseSoundCloudHtml", () => {
    it("extracts single track with artist, duration, and artwork", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta property="og:title" content="Bicep - Glue" />
          </head>
          <body>
            <script>
              window.__sc_hydration = [
                {
                  "hydratable": "sound",
                  "data": {
                    "id": 341852901,
                    "title": "Bicep - Glue",
                    "duration": 269000,
                    "artwork_url": "https://i1.sndcdn.com/artworks-000241852901-large.jpg",
                    "user": {
                      "username": "BICEP",
                      "avatar_url": "https://i1.sndcdn.com/avatars-0001-large.jpg"
                    },
                    "genre": "Electronic",
                    "created_at": "2017-09-01T12:00:00.000Z",
                    "permalink_url": "https://soundcloud.com/feelmybicep/bicep-glue"
                  }
                }
              ];
            </script>
          </body>
        </html>
      `;

      const result = parseSoundCloudHtml(
        html,
        "https://soundcloud.com/feelmybicep/bicep-glue",
      );

      expect(result).not.toBeNull();
      expect(result?.playlist.id).toBe("341852901");
      expect(result?.playlist.name).toBe("Bicep - Glue");
      expect(result?.playlist.type).toBe("soundcloud");
      expect(result?.playlist.tracks.total).toBe(1);
      expect(result?.playlist.images[0].url).toBe(
        "https://i1.sndcdn.com/artworks-000241852901-t500x500.jpg",
      );

      expect(result?.tracks).toHaveLength(1);
      const track = result!.tracks[0];
      expect(track.id).toBe("341852901");
      expect(track.name).toBe("Glue");
      expect(track.artists[0].name).toBe("Bicep");
      expect(track.duration_ms).toBe(269000);
      expect(track.track_number).toBe(1);
      expect(track.year).toBe("2017");
      expect(track.is_soundcloud).toBe(true);
    });

    it("extracts playlist/set with multiple tracks and sequence order", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <script>
              window.__sc_hydration = [
                {
                  "hydratable": "playlist",
                  "data": {
                    "id": 987654321,
                    "title": "Fabriclive Mix Series",
                    "description": "Exclusive underground dance music selections",
                    "track_count": 2,
                    "artwork_url": "https://i1.sndcdn.com/artworks-987-large.jpg",
                    "user": { "username": "Fabric London" },
                    "created_at": "2024-03-15T00:00:00.000Z",
                    "tracks": [
                      {
                        "id": 111,
                        "title": "Four Tet - Parallel 1",
                        "duration": 340000,
                        "artwork_url": "https://i1.sndcdn.com/artworks-111-large.jpg",
                        "user": { "username": "Four Tet" }
                      },
                      {
                        "id": 222,
                        "title": "Floating Points - Grammar",
                        "duration": 450000,
                        "artwork_url": "https://i1.sndcdn.com/artworks-222-large.jpg",
                        "user": { "username": "Floating Points" }
                      }
                    ]
                  }
                }
              ];
            </script>
          </body>
        </html>
      `;

      const result = parseSoundCloudHtml(
        html,
        "https://soundcloud.com/fabric/sets/fabriclive-mix",
      );

      expect(result).not.toBeNull();
      expect(result?.playlist.id).toBe("987654321");
      expect(result?.playlist.name).toBe("Fabriclive Mix Series");
      expect(result?.playlist.type).toBe("soundcloud");
      expect(result?.playlist.tracks.total).toBe(2);

      expect(result?.tracks).toHaveLength(2);
      expect(result?.tracks[0].name).toBe("Parallel 1");
      expect(result?.tracks[0].artists[0].name).toBe("Four Tet");
      expect(result?.tracks[0].track_number).toBe(1);
      expect(result?.tracks[0].duration_ms).toBe(340000);

      expect(result?.tracks[1].name).toBe("Grammar");
      expect(result?.tracks[1].artists[0].name).toBe("Floating Points");
      expect(result?.tracks[1].track_number).toBe(2);
      expect(result?.tracks[1].duration_ms).toBe(450000);
    });

    it("falls back to OpenGraph meta tags when hydration is absent", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta property="og:title" content="Burial - Archangel" />
            <meta property="og:image" content="https://i1.sndcdn.com/artworks-burial-large.jpg" />
            <meta property="og:description" content="Untrue LP" />
          </head>
          <body>
            <div>No hydration available</div>
          </body>
        </html>
      `;

      const result = parseSoundCloudHtml(
        html,
        "https://soundcloud.com/hyperdub/burial-archangel",
      );

      expect(result).not.toBeNull();
      expect(result?.playlist.name).toBe("Burial - Archangel");
      expect(result?.tracks).toHaveLength(1);
      expect(result?.tracks[0].artists[0].name).toBe("Burial");
      expect(result?.tracks[0].name).toBe("Archangel");
      expect(result?.tracks[0].image).toBe(
        "https://i1.sndcdn.com/artworks-burial-t500x500.jpg",
      );
    });
  });

  describe("parseSoundCloudOEmbed", () => {
    it("parses valid SoundCloud oEmbed JSON payload", () => {
      const oembedData = {
        version: 1.0,
        type: "rich",
        provider_name: "SoundCloud",
        title: "Mall Grab - Liverpool Street In The Rain",
        description: "Steel City Dance Discs",
        thumbnail_url: "https://i1.sndcdn.com/artworks-mallgrab-t500x500.jpg",
        author_name: "Mall Grab",
        author_url: "https://soundcloud.com/mallgrab",
      };

      const result = parseSoundCloudOEmbed(
        oembedData,
        "https://soundcloud.com/mallgrab/liverpool-street",
      );

      expect(result).not.toBeNull();
      expect(result?.playlist.name).toBe(
        "Mall Grab - Liverpool Street In The Rain",
      );
      expect(result?.playlist.type).toBe("soundcloud");
      expect(result?.tracks).toHaveLength(1);
      expect(result?.tracks[0].artists[0].name).toBe("Mall Grab");
      expect(result?.tracks[0].name).toBe("Liverpool Street In The Rain");
      expect(result?.tracks[0].image).toBe(
        "https://i1.sndcdn.com/artworks-mallgrab-t500x500.jpg",
      );
      expect(result?.tracks[0].is_soundcloud).toBe(true);
    });

    it("returns null on null or invalid oEmbed payload", () => {
      expect(parseSoundCloudOEmbed(null, "url")).toBeNull();
      expect(parseSoundCloudOEmbed({}, "url")).toBeNull();
    });
  });
});
