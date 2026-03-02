
import { useState, useCallback } from 'react'

export function useLibrary() {
    const [searchResults, setSearchResults] = useState<any[] | null>(null)
    const [isSearching, setIsSearching] = useState(false)
    const [addedPlaylists, setAddedPlaylists] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState('')

    const search = useCallback(async (query: string) => {
        if (!query.trim()) {
            setSearchResults(null)
            return
        }

        setIsSearching(true)
        try {
            // Check if query is a Spotify URL
            if (query.includes('spotify.com')) {
                const playlist = await window.api.spotify.getPlaylist(query)
                if (playlist) {
                    setAddedPlaylists(prev => {
                        // Avoid duplicates
                        if (prev.find(p => p.id === playlist.id)) return prev
                        return [playlist, ...prev]
                    })
                    // Clear search results AND search term
                    setSearchResults(null)
                    setSearchTerm('')
                }
            } else if (query.includes('youtube.com') || query.includes('youtu.be')) {
                const playlist = await window.api.youtube.getPlaylist(query)
                if (playlist) {
                    setAddedPlaylists(prev => {
                        if (prev.find(p => p.id === playlist.id)) return prev
                        return [playlist, ...prev]
                    })
                    setSearchResults(null)
                    setSearchTerm('')
                }
            } else {
                // Regular Search
                const results = await window.api.spotify.search(query)
                setSearchResults(results)
            }
        } catch (error) {
            console.error('Search/Add failed:', error)
        } finally {
            setIsSearching(false)
        }
    }, [])

    const clearAdded = useCallback(() => {
        setAddedPlaylists([])
    }, [])

    const removeAdded = useCallback((playlistId: string) => {
        setAddedPlaylists(prev => prev.filter(p => p.id !== playlistId))
    }, [])

    return {
        searchResults,
        isSearching,
        addedPlaylists,
        searchTerm,
        setSearchTerm,
        search,
        clearAdded,
        removeAdded
    }
}
