import { useState, useCallback } from "react";
import { Playlist } from "../../../shared/types";
import { useI18n } from "../context/I18nContext";

export function useLibrary() {
  const { t } = useI18n();
  const [searchResults, setSearchResults] = useState<Playlist[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [addedPlaylists, setAddedPlaylists] = useState<Playlist[]>([]);
  const [searchTerm, setSearchTermState] = useState("");
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setSearchTerm = useCallback((term: string) => {
    setSearchTermState(term);
    setError(null);
  }, []);

  const search = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      setError(null);

      if (!trimmed) {
        setSearchResults(null);
        return;
      }

      setIsSearching(true);
      try {
        // 1. Spotify URL / URI / Prefix
        if (
          trimmed.includes("spotify.com") ||
          trimmed.startsWith("spotify:") ||
          /^(album|track|playlist):[a-zA-Z0-9]+$/i.test(trimmed)
        ) {
          const playlist = await window.api.spotify.getPlaylist(trimmed);
          if (playlist && playlist.id) {
            setAddedPlaylists((prev) => {
              if (prev.find((p) => p.id === playlist.id)) return prev;
              return [playlist, ...prev];
            });
            setSearchResults(null);
            setSearchTermState("");
          } else {
            setError(t("error.playlistNotFound"));
          }
        }
        // 2. YouTube URL
        else if (
          trimmed.includes("youtube.com") ||
          trimmed.includes("youtu.be")
        ) {
          const playlist = await window.api.youtube.getPlaylist(trimmed);
          if (playlist && playlist.id) {
            setAddedPlaylists((prev) => {
              if (prev.find((p) => p.id === playlist.id)) return prev;
              return [playlist, ...prev];
            });
            setSearchResults(null);
            setSearchTermState("");
          } else {
            setError(t("error.playlistNotFound"));
          }
        }
        // 3. SoundCloud URL
        else if (
          trimmed.includes("soundcloud.com") ||
          trimmed.includes("on.soundcloud.com")
        ) {
          const playlist = await window.api.soundcloud.getPlaylist(trimmed);
          if (playlist && playlist.id) {
            setAddedPlaylists((prev) => {
              if (prev.find((p) => p.id === playlist.id)) return prev;
              return [playlist, ...prev];
            });
            setSearchResults(null);
            setSearchTermState("");
          } else {
            setError(t("error.playlistNotFound"));
          }
        }
        // 4. Bandcamp URL
        else if (
          trimmed.includes("bandcamp.com") ||
          /^https?:\/\/[a-zA-Z0-9-.]+\/(album|track)\//i.test(trimmed)
        ) {
          const playlist = await window.api.bandcamp.getPlaylist(trimmed);
          if (playlist && playlist.id) {
            setAddedPlaylists((prev) => {
              if (prev.find((p) => p.id === playlist.id)) return prev;
              return [playlist, ...prev];
            });
            setSearchResults(null);
            setSearchTermState("");
          } else {
            setError(t("error.playlistNotFound"));
          }
        }
        // 5. Other generic URLs that aren't Spotify, YouTube, SoundCloud, or Bandcamp
        else if (
          trimmed.startsWith("http://") ||
          trimmed.startsWith("https://")
        ) {
          setError(t("error.invalidUrl"));
        }
        // 4. Regular keyword search
        else {
          const results = await window.api.spotify.search(trimmed);
          if (results) {
            setSearchResults(results);
          } else {
            setSearchResults([]);
          }
        }
      } catch (err) {
        console.error("Search/Add failed:", err);
        setError(t("error.importFailed"));
      } finally {
        setIsSearching(false);
      }
    },
    [t],
  );

  const clearAdded = useCallback(() => {
    setAddedPlaylists([]);
  }, []);

  const removeAdded = useCallback((playlistId: string) => {
    setAddedPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
  }, []);

  const addPlaylist = useCallback((playlist: Playlist) => {
    setAddedPlaylists((prev) => {
      if (prev.find((p) => p.id === playlist.id)) return prev;
      return [playlist, ...prev];
    });
  }, []);

  return {
    searchResults,
    isSearching,
    addedPlaylists,
    searchTerm,
    setSearchTerm,
    search,
    error,
    clearError,
    clearAdded,
    removeAdded,
    addPlaylist,
  };
}
