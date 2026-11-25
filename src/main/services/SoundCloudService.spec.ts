import { vi, describe, it, expect, beforeEach } from "vitest";
import { net } from "electron";
import { SoundCloudService } from "./SoundCloudService";

vi.mock("electron", () => ({
  net: {
    fetch: vi.fn(),
  },
}));

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

describe("SoundCloudService", () => {
  let service: SoundCloudService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SoundCloudService();
  });

  it("ingests SoundCloud track via HTML hydration and returns playlist structure", async () => {
    const mockHtml = `
      <script>
        window.__sc_hydration = [
          {
            "hydratable": "sound",
            "data": {
              "id": 999111,
              "title": "Joy Orbison - flight fm",
              "duration": 240000,
              "artwork_url": "https://i1.sndcdn.com/artworks-joyo-large.jpg",
              "user": { "username": "Joy Orbison" }
            }
          }
        ];
      </script>
    `;

    vi.mocked(net.fetch).mockResolvedValueOnce(
      mockResponse(200, mockHtml) as unknown as Response,
    );

    const playlist = await service.getPlaylist(
      "https://soundcloud.com/joy-orbison/flight-fm",
    );

    expect(playlist).not.toBeNull();
    expect(playlist.name).toBe("Joy Orbison - flight fm");
    expect(playlist.type).toBe("soundcloud");
    expect(playlist.tracks.total).toBe(1);

    const tracks = await service.getTracks(playlist.id);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe("flight fm");
    expect(tracks[0].artists[0].name).toBe("Joy Orbison");
    expect(tracks[0].is_soundcloud).toBe(true);
  });

  it("falls back to oEmbed when HTML fetch returns no hydration", async () => {
    // 1st call for HTML returns 404 or empty
    vi.mocked(net.fetch).mockResolvedValueOnce(
      mockResponse(404, "Not Found", false) as unknown as Response,
    );

    // 2nd call for oEmbed returns JSON
    const mockOEmbed = {
      title: "Overmono - Gfortune",
      author_name: "Overmono",
      thumbnail_url: "https://i1.sndcdn.com/artworks-overmono-t500x500.jpg",
    };
    vi.mocked(net.fetch).mockResolvedValueOnce(
      mockResponse(200, mockOEmbed) as unknown as Response,
    );

    const playlist = await service.getPlaylist(
      "https://soundcloud.com/overmono/gfortune",
    );

    expect(playlist.name).toBe("Overmono - Gfortune");
    expect(playlist.type).toBe("soundcloud");

    const tracks = await service.getTracks(playlist.id);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].artists[0].name).toBe("Overmono");
    expect(tracks[0].name).toBe("Gfortune");
  });
});
