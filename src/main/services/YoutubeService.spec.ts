import { vi, describe, it, expect, beforeEach } from "vitest";
import { net } from "electron";
import { YoutubeService, extractYoutubeVideoId } from "./YoutubeService";

// Mock electron net
vi.mock("electron", () => ({
  net: {
    fetch: vi.fn(),
  },
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

describe("YoutubeService", () => {
  let service: YoutubeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new YoutubeService();
  });

  describe("extractYoutubeVideoId", () => {
    it("extracts ID from standard watch URL", () => {
      expect(
        extractYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      ).toBe("dQw4w9WgXcQ");
      expect(
        extractYoutubeVideoId(
          "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
        ),
      ).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from youtu.be short URL", () => {
      expect(extractYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
        "dQw4w9WgXcQ",
      );
      expect(
        extractYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ?si=abcdef12345"),
      ).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from embed and v URLs", () => {
      expect(
        extractYoutubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
      ).toBe("dQw4w9WgXcQ");
      expect(
        extractYoutubeVideoId("https://www.youtube.com/v/dQw4w9WgXcQ"),
      ).toBe("dQw4w9WgXcQ");
    });

    it("returns null for playlist URLs without single video", () => {
      expect(
        extractYoutubeVideoId(
          "https://www.youtube.com/playlist?list=PLMC9KNkIncKvYin_USF1qoJQnIyMAfRxl",
        ),
      ).toBeNull();
    });

    it("returns null for invalid inputs", () => {
      expect(extractYoutubeVideoId("")).toBeNull();
      expect(
        extractYoutubeVideoId("https://notyoutube.com/watch?v=123"),
      ).toBeNull();
    });
  });

  describe("Single Video Ingestion", () => {
    it("fetches single video as a 1-item collection and caches track", async () => {
      const mockOembed = {
        title: "Rick Astley - Never Gonna Give You Up (Official Music Video)",
        author_name: "Rick Astley",
        thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      };

      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(200, mockOembed) as any,
      );

      const videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const playlist = await service.getPlaylist(videoUrl);

      expect(playlist).not.toBeNull();
      if (!playlist) return;

      expect(playlist.id).toBe("dQw4w9WgXcQ");
      expect(playlist.name).toBe(
        "Rick Astley - Never Gonna Give You Up (Official Music Video)",
      );
      expect(playlist.owner.display_name).toBe("Rick Astley");
      expect(playlist.tracks.total).toBe(1);
      expect(playlist.type).toBe("youtube");
      expect(playlist.images[0].url).toContain("hqdefault.jpg");

      // Verify tracks fetch returns the single track with parsed artist and name
      const tracks = await service.getPlaylistTracks("dQw4w9WgXcQ");
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe("dQw4w9WgXcQ");
      expect(tracks[0].artists[0].name).toBe("Rick Astley");
      expect(tracks[0].name).toContain("Never Gonna Give You Up");
      expect(tracks[0].is_youtube).toBe(true);
    });

    it("handles youtu.be short URLs seamlessly", async () => {
      const mockOembed = {
        title: "Daft Punk - One More Time (Official Audio)",
        author_name: "Daft Punk",
        thumbnail_url: "https://i.ytimg.com/vi/FGBhQbmPwH8/hqdefault.jpg",
      };

      vi.mocked(net.fetch).mockResolvedValueOnce(
        mockResponse(200, mockOembed) as any,
      );

      const videoUrl = "https://youtu.be/FGBhQbmPwH8";
      const playlist = await service.getPlaylist(videoUrl);

      expect(playlist).not.toBeNull();
      if (!playlist) return;

      expect(playlist.id).toBe("FGBhQbmPwH8");
      expect(playlist.tracks.total).toBe(1);

      const tracks = await service.getPlaylistTracks("FGBhQbmPwH8");
      expect(tracks.length).toBe(1);
      expect(tracks[0].artists[0].name).toBe("Daft Punk");
      expect(tracks[0].name).toContain("One More Time");
    });
  });
});
