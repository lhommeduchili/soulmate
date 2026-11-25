import { describe, it, expect } from "vitest";
import {
  isBandcampUrl,
  extractBandcampEntity,
  parseIsoDuration,
  parseBandcampJsonLd,
  parseBandcampDataTralbum,
  parseBandcampHtml,
} from "./bandcampParser";

describe("Bandcamp Parser Engine (bandcampParser)", () => {
  describe("isBandcampUrl", () => {
    it("identifies standard bandcamp.com album and track URLs", () => {
      expect(isBandcampUrl("https://fourtet.bandcamp.com/album/three")).toBe(
        true,
      );
      expect(isBandcampUrl("https://bicep.bandcamp.com/track/glue")).toBe(true);
      expect(
        isBandcampUrl(
          "http://sub.bandcamp.com/album/release-slug?from=fanpub_fb",
        ),
      ).toBe(true);
    });

    it("identifies custom domain Bandcamp releases with /album/ or /track/", () => {
      expect(isBandcampUrl("https://music.dan-snaith.com/album/cherry")).toBe(
        true,
      );
      expect(isBandcampUrl("https://releases.hyperdub.net/track/untrue")).toBe(
        true,
      );
    });

    it("rejects non-Bandcamp URLs", () => {
      expect(isBandcampUrl("https://open.spotify.com/album/12345")).toBe(false);
      expect(isBandcampUrl("https://soundcloud.com/artist/track")).toBe(false);
      expect(isBandcampUrl("https://youtube.com/watch?v=12345678901")).toBe(
        false,
      );
      expect(isBandcampUrl("not-a-url")).toBe(false);
      expect(isBandcampUrl("")).toBe(false);
    });
  });

  describe("extractBandcampEntity", () => {
    it("extracts album entity details", () => {
      const entity = extractBandcampEntity(
        "https://fourtet.bandcamp.com/album/three",
      );
      expect(entity.type).toBe("album");
      expect(entity.slug).toBe("three");
      expect(entity.subdomain).toBe("fourtet");
    });

    it("extracts track entity details", () => {
      const entity = extractBandcampEntity(
        "https://bicep.bandcamp.com/track/glue",
      );
      expect(entity.type).toBe("track");
      expect(entity.slug).toBe("glue");
      expect(entity.subdomain).toBe("bicep");
    });

    it("handles query strings and hash anchors", () => {
      const entity = extractBandcampEntity(
        "https://artist.bandcamp.com/album/lp-title/?action=download#track-1",
      );
      expect(entity.type).toBe("album");
      expect(entity.slug).toBe("lp-title");
    });
  });

  describe("parseIsoDuration", () => {
    it("parses minutes and seconds (PT3M45S)", () => {
      expect(parseIsoDuration("PT3M45S")).toBe(225000);
    });

    it("parses seconds only (PT45S)", () => {
      expect(parseIsoDuration("PT45S")).toBe(45000);
    });

    it("parses hours, minutes, and seconds (PT1H2M30S)", () => {
      expect(parseIsoDuration("PT1H2M30S")).toBe(3750000);
    });

    it("handles fractional seconds (PT4M12.5S)", () => {
      expect(parseIsoDuration("PT4M12.5S")).toBe(252500);
    });

    it("safely returns 0 on invalid or missing string", () => {
      expect(parseIsoDuration("")).toBe(0);
      expect(parseIsoDuration("invalid")).toBe(0);
      expect(parseIsoDuration(undefined as unknown as string)).toBe(0);
    });
  });

  describe("parseBandcampJsonLd", () => {
    it("extracts MusicAlbum JSON-LD schema with tracks", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "MusicAlbum",
                "name": "Parallel",
                "byArtist": {
                  "@type": "MusicGroup",
                  "name": "Four Tet"
                },
                "image": "https://f4.bcbits.com/img/a1234567890_10.jpg",
                "numTracks": 2,
                "datePublished": "25 Dec 2020 00:00:00 GMT",
                "track": {
                  "@type": "ItemList",
                  "numberOfItems": 2,
                  "itemListElement": [
                    {
                      "@type": "ListItem",
                      "position": 1,
                      "item": {
                        "@type": "MusicRecording",
                        "name": "Parallel 1",
                        "duration": "PT5M42S",
                        "additionalProperty": [
                          { "name": "tracknum", "value": 1 }
                        ]
                      }
                    },
                    {
                      "@type": "ListItem",
                      "position": 2,
                      "item": {
                        "@type": "MusicRecording",
                        "name": "Parallel 2",
                        "duration": "PT4M15S",
                        "additionalProperty": [
                          { "name": "tracknum", "value": 2 }
                        ]
                      }
                    }
                  ]
                }
              }
            </script>
          </head>
        </html>
      `;

      const parsed = parseBandcampJsonLd(html);
      expect(parsed).not.toBeNull();
      expect(parsed?.name).toBe("Parallel");
      expect(parsed?.byArtist?.name).toBe("Four Tet");
      expect(parsed?.image).toBe(
        "https://f4.bcbits.com/img/a1234567890_10.jpg",
      );
      expect(parsed?.track?.itemListElement).toHaveLength(2);
    });

    it("extracts single MusicRecording JSON-LD", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "MusicRecording",
                "name": "Single Release",
                "byArtist": {
                  "@type": "MusicGroup",
                  "name": "Aphex Twin"
                },
                "inAlbum": {
                  "@type": "MusicAlbum",
                  "name": "Drukqs"
                },
                "duration": "PT3M30S",
                "image": "https://f4.bcbits.com/img/a999_10.jpg"
              }
            </script>
          </head>
        </html>
      `;

      const parsed = parseBandcampJsonLd(html);
      expect(parsed).not.toBeNull();
      expect(parsed?.name).toBe("Single Release");
      expect(parsed?.byArtist?.name).toBe("Aphex Twin");
      expect(parsed?.duration).toBe("PT3M30S");
    });
  });

  describe("parseBandcampDataTralbum", () => {
    it("extracts data-tralbum JSON attribute with trackinfo", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <script id="pagedata" data-tralbum='{"artist":"Overmono","current":{"title":"Cash Romantic","release_date":"08 Apr 2022 00:00:00 GMT"},"trackinfo":[{"id":1001,"track_num":1,"title":"Cash Romantic","duration":243.2},{"id":1002,"track_num":2,"title":"Gfortune","duration":312.0}]}'></script>
          </body>
        </html>
      `;

      const tralbum = parseBandcampDataTralbum(html);
      expect(tralbum).not.toBeNull();
      expect(tralbum?.artist).toBe("Overmono");
      expect(tralbum?.current?.title).toBe("Cash Romantic");
      expect(tralbum?.trackinfo).toHaveLength(2);
      expect(tralbum?.trackinfo?.[0].title).toBe("Cash Romantic");
      expect(tralbum?.trackinfo?.[0].duration).toBe(243.2);
    });

    it("parses escaped HTML entities in data-tralbum attribute", () => {
      const html = `
        <div data-tralbum="{&quot;artist&quot;:&quot;Joy O &amp; Ben UFO&quot;,&quot;current&quot;:{&quot;title&quot;:&quot;Transit EP&quot;},&quot;trackinfo&quot;:[{&quot;id&quot;:201,&quot;title&quot;:&quot;Transit&quot;,&quot;duration&quot;:300}]}"></script>
      `;

      const tralbum = parseBandcampDataTralbum(html);
      expect(tralbum).not.toBeNull();
      expect(tralbum?.artist).toBe("Joy O & Ben UFO");
      expect(tralbum?.current?.title).toBe("Transit EP");
      expect(tralbum?.trackinfo?.[0].title).toBe("Transit");
    });
  });

  describe("parseBandcampHtml", () => {
    it("parses full Bandcamp album HTML with tracks, durations, and artwork", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta property="og:title" content="Isles by Bicep" />
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "MusicAlbum",
                "name": "Isles",
                "byArtist": {
                  "@type": "MusicGroup",
                  "name": "Bicep"
                },
                "image": "https://f4.bcbits.com/img/a_bicep_isles_10.jpg",
                "datePublished": "22 Jan 2021 00:00:00 GMT",
                "track": {
                  "@type": "ItemList",
                  "numberOfItems": 2,
                  "itemListElement": [
                    {
                      "@type": "ListItem",
                      "position": 1,
                      "item": {
                        "@type": "MusicRecording",
                        "name": "Atlas",
                        "duration": "PT5M52S",
                        "additionalProperty": [
                          { "name": "tracknum", "value": 1 }
                        ]
                      }
                    },
                    {
                      "@type": "ListItem",
                      "position": 2,
                      "item": {
                        "@type": "MusicRecording",
                        "name": "Apricots",
                        "duration": "PT4M06S",
                        "additionalProperty": [
                          { "name": "tracknum", "value": 2 }
                        ]
                      }
                    }
                  ]
                }
              }
            </script>
          </head>
          <body>
            <script data-tralbum='{"artist":"Bicep","current":{"title":"Isles"},"trackinfo":[{"id":501,"track_num":1,"title":"Atlas","duration":352.0},{"id":502,"track_num":2,"title":"Apricots","duration":246.0}]}'></script>
          </body>
        </html>
      `;

      const result = parseBandcampHtml(
        html,
        "https://bicep.bandcamp.com/album/isles",
      );

      expect(result).not.toBeNull();
      expect(result?.playlist.id).toBe("isles");
      expect(result?.playlist.name).toBe("Isles");
      expect(result?.playlist.type).toBe("bandcamp");
      expect(result?.playlist.owner.display_name).toBe("Bicep");
      expect(result?.playlist.images[0].url).toBe(
        "https://f4.bcbits.com/img/a_bicep_isles_10.jpg",
      );

      expect(result?.tracks).toHaveLength(2);
      const track1 = result!.tracks[0];
      expect(track1.id).toBe("501");
      expect(track1.name).toBe("Atlas");
      expect(track1.artists[0].name).toBe("Bicep");
      expect(track1.album.name).toBe("Isles");
      expect(track1.duration_ms).toBe(352000);
      expect(track1.track_number).toBe(1);
      expect(track1.year).toBe("2021");
      expect(track1.is_bandcamp).toBe(true);

      const track2 = result!.tracks[1];
      expect(track2.id).toBe("502");
      expect(track2.name).toBe("Apricots");
      expect(track2.artists[0].name).toBe("Bicep");
      expect(track2.track_number).toBe(2);
      expect(track2.duration_ms).toBe(246000);
      expect(track2.is_bandcamp).toBe(true);
    });

    it("parses single track Bandcamp page", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "MusicRecording",
                "name": "Klap",
                "byArtist": {
                  "@type": "MusicGroup",
                  "name": "Floating Points"
                },
                "inAlbum": {
                  "@type": "MusicAlbum",
                  "name": "Crush"
                },
                "image": "https://f4.bcbits.com/img/a_crush_10.jpg",
                "duration": "PT3M15S",
                "datePublished": "18 Oct 2019 00:00:00 GMT"
              }
            </script>
          </head>
          <body>
            <script data-tralbum='{"artist":"Floating Points","current":{"title":"Klap"},"trackinfo":[{"id":9901,"track_num":1,"title":"Klap","duration":195.0}]}'></script>
          </body>
        </html>
      `;

      const result = parseBandcampHtml(
        html,
        "https://floatingpoints.bandcamp.com/track/klap",
      );

      expect(result).not.toBeNull();
      expect(result?.playlist.name).toBe("Klap");
      expect(result?.playlist.type).toBe("bandcamp");
      expect(result?.playlist.tracks.total).toBe(1);

      expect(result?.tracks).toHaveLength(1);
      const track = result!.tracks[0];
      expect(track.name).toBe("Klap");
      expect(track.artists[0].name).toBe("Floating Points");
      expect(track.album.name).toBe("Crush");
      expect(track.duration_ms).toBe(195000);
      expect(track.year).toBe("2019");
      expect(track.is_bandcamp).toBe(true);
    });

    it("falls back to OpenGraph meta tags when JSON-LD and data-tralbum are missing", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta property="og:title" content="Untrue by Burial" />
            <meta property="og:image" content="https://f4.bcbits.com/img/untrue_cover.jpg" />
            <meta property="og:description" content="Hyperdub releases" />
          </head>
          <body><div>Content</div></body>
        </html>
      `;

      const result = parseBandcampHtml(
        html,
        "https://burial.bandcamp.com/album/untrue",
      );

      expect(result).not.toBeNull();
      expect(result?.playlist.name).toBe("Untrue");
      expect(result?.playlist.owner.display_name).toBe("Burial");
      expect(result?.tracks).toHaveLength(1);
      expect(result?.tracks[0].name).toBe("Untrue");
      expect(result?.tracks[0].artists[0].name).toBe("Burial");
      expect(result?.tracks[0].is_bandcamp).toBe(true);
    });
  });
});
