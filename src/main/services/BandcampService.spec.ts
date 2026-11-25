import { vi, describe, it, expect, beforeEach } from "vitest";
import { net } from "electron";
import { BandcampService } from "./BandcampService";

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

describe("BandcampService", () => {
  let service: BandcampService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BandcampService();
  });

  it("ingests Bandcamp album via HTML data-tralbum and returns playlist with all tracks", async () => {
    const mockHtml = `
      <script data-tralbum='{"artist":"Four Tet","current":{"title":"Three","release_date":"15 Mar 2024"},"trackinfo":[{"id":701,"track_num":1,"title":"Loved","duration":242.0},{"id":702,"track_num":2,"title":"Gliding Through Everything","duration":308.0}]}'></script>
    `;

    vi.mocked(net.fetch).mockResolvedValueOnce(
      mockResponse(200, mockHtml) as unknown as Response,
    );

    const playlist = await service.getPlaylist(
      "https://fourtet.bandcamp.com/album/three",
    );

    expect(playlist).not.toBeNull();
    expect(playlist.name).toBe("Three");
    expect(playlist.type).toBe("bandcamp");
    expect(playlist.owner.display_name).toBe("Four Tet");
    expect(playlist.tracks.total).toBe(2);

    const tracks = await service.getTracks(playlist.id);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].name).toBe("Loved");
    expect(tracks[0].artists[0].name).toBe("Four Tet");
    expect(tracks[0].duration_ms).toBe(242000);
    expect(tracks[0].is_bandcamp).toBe(true);

    expect(tracks[1].name).toBe("Gliding Through Everything");
    expect(tracks[1].artists[0].name).toBe("Four Tet");
    expect(tracks[1].duration_ms).toBe(308000);
    expect(tracks[1].is_bandcamp).toBe(true);
  });

  it("throws error when fetch fails with non-200 status", async () => {
    vi.mocked(net.fetch).mockResolvedValueOnce(
      mockResponse(404, "Release Not Found", false) as unknown as Response,
    );

    await expect(
      service.getPlaylist("https://artist.bandcamp.com/album/nonexistent"),
    ).rejects.toThrow("Failed to fetch Bandcamp page");
  });
});
