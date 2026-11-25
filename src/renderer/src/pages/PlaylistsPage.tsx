import { useNavigate } from "react-router-dom";
import { PlaylistSelector } from "../components/PlaylistSelector";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useLibraryContext } from "../context/LibraryContext";
import { useSpotifyAuthContext } from "../context/SpotifyAuthContext";

export function PlaylistsPage() {
  const navigate = useNavigate();
  const {
    searchResults,
    isSearching,
    addedPlaylists,
    clearAdded,
    removeAdded,
    addPlaylist,
  } = useLibraryContext();
  const { isAuthenticated, login } = useSpotifyAuthContext();

  return (
    <ErrorBoundary componentName="playlists">
      <PlaylistSelector
        onSelect={(id) => {
          const playlist = addedPlaylists.find((p) => p.id === id);
          const type = playlist?.type || "spotify";
          navigate(`/review/${type}/${id}`);
        }}
        isAuthenticated={isAuthenticated}
        onLoginRequested={login}
        searchResults={searchResults}
        isSearching={isSearching}
        addedPlaylists={addedPlaylists}
        onClearAdded={clearAdded}
        onRemoveAdded={removeAdded}
        onImportSetlist={(playlist) => {
          addPlaylist(playlist);
          navigate(`/review/setlist/${playlist.id}`);
        }}
      />
    </ErrorBoundary>
  );
}
