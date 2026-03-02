
import { useNavigate } from 'react-router-dom'
import { PlaylistSelector } from '../components/PlaylistSelector'
import { useLibraryContext } from '../context/LibraryContext'
import { useSpotifyAuthContext } from '../context/SpotifyAuthContext'

export function PlaylistsPage() {
    const navigate = useNavigate()
    const { searchResults, isSearching, addedPlaylists, clearAdded, removeAdded } = useLibraryContext()
    const { isAuthenticated, login } = useSpotifyAuthContext()

    return (
        <PlaylistSelector
            onSelect={(id) => {
                // Determine logic to find type - we need the playlist object to know the type
                // or we rely on param. `PlaylistSelector` implementation only passes ID.
                // We should find the playlist in `addedPlaylists` passed to it.
                // BUT `PlaylistSelector` logic might need to be checked.
                // Let's assume we can look it up here.
                const playlist = addedPlaylists.find(p => p.id === id)
                const type = playlist?.type || 'spotify'
                navigate(`/review/${type}/${id}`)
            }}
            isAuthenticated={isAuthenticated}
            onLoginRequested={login}
            searchResults={searchResults}
            isSearching={isSearching}
            addedPlaylists={addedPlaylists}
            onClearAdded={clearAdded}
            onRemoveAdded={removeAdded}
        />
    )
}
