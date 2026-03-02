import { useState, useEffect } from 'react'
import { MatrixText } from './MatrixText'


interface Playlist {
    id: string
    name: string
    images: { url: string }[]
    tracks: { total: number }
}

interface Props {
    onSelect: (playlistId: string) => void
    isAuthenticated?: boolean
    onLoginRequested?: () => void
    searchResults?: Playlist[] | null
    isSearching?: boolean
    addedPlaylists?: Playlist[]
    onClearAdded?: () => void
    onRemoveAdded?: (playlistId: string) => void
}

export function PlaylistSelector({
    onSelect,
    isAuthenticated = false,
    onLoginRequested,
    searchResults,
    isSearching,
    addedPlaylists = [],
    onClearAdded,
    onRemoveAdded
}: Props): JSX.Element {
    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Fetch library on mount (only if authenticated)
    useEffect(() => {
        let cancelled = false

        if (!isAuthenticated) {
            setLoading(false)
            setPlaylists([])
            setError('')
            return
        }

        setLoading(true)
        window.api.spotify.getPlaylists()
            .then((data: Playlist[]) => {
                if (!cancelled) {
                    setPlaylists(data)
                    setLoading(false)
                }
            })
            .catch((err: Error) => {
                if (!cancelled) {
                    console.error(err)
                    setError('Failed to fetch playlists')
                    setLoading(false)
                }
            })

        return () => { cancelled = true }
    }, [isAuthenticated])

    // Prefer search results if active (even if empty array), otherwise show library
    const displayPlaylists = (searchResults !== null && typeof searchResults !== 'undefined') ? searchResults : playlists
    const isShowingSearch = searchResults !== null && typeof searchResults !== 'undefined'

    if (loading && !isShowingSearch) return (
        <div className="fixed inset-0 z-50 bg-app-bg flex flex-col items-center justify-center p-8 text-center font-mono">
            <div className="text-xl text-soul-green mb-2 lowercase tracking-tighter flex items-center">
                <style>{`
                    @keyframes blink-cursor {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0; }
                    }
                    .blink-cursor {
                        animation: blink-cursor 1s step-end infinite;
                    }
                `}</style>
                <MatrixText text="loading library..." />
                <span className="ml-2 w-3 h-5 bg-soul-green inline-block blink-cursor"></span>
            </div>
        </div>
    )

    if (isSearching) return (
        <div className="flex items-center justify-center h-full text-app-text-dim font-mono">
            <span className="text-soul-green"><MatrixText text="loading playlist..." /></span>
        </div>
    )

    if (error) return <div className="p-8 text-red-500 font-mono">{error}</div>

    return (
        <div className="px-8 pt-0 pb-8">
            {/* Added Playlists Section */}
            {addedPlaylists.length > 0 && !isShowingSearch && (
                <section className="mb-12" aria-labelledby="added-playlists-heading">
                    <div className="flex items-center justify-between mb-6 group/header">
                        <h2 id="added-playlists-heading" className="text-2xl font-bold text-app-text-main tracking-tight lowercase">
                            playlists added
                        </h2>
                        {onClearAdded && (
                            <button
                                onClick={onClearAdded}
                                className="text-xs font-mono text-app-text-dim hover:text-red-500 opacity-0 focus:opacity-100 group-hover/header:opacity-100 transition-opacity lowercase focus:outline-none rounded-sm"
                                aria-label="Clear all added playlists"
                            >
                                clear all
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" role="list" aria-label="Added Playlists">
                        {addedPlaylists.map(pl => (
                            <div
                                key={pl.id}
                                role="listitem"
                                className="relative"
                            >
                                <button
                                    onClick={() => onSelect(pl.id)}
                                    className="w-full text-left group bg-app-surface/40 hover:bg-app-surface-hover transition-all p-4 rounded-md cursor-pointer flex flex-col items-center text-center relative overflow-hidden focus:outline-none"
                                    aria-label={`Select added playlist: ${pl.name}`}
                                >
                                    <div className="w-full aspect-square bg-app-surface shadow-lg mb-4 relative rounded-sm overflow-hidden">
                                        {pl.images && pl.images[0] ? (
                                            <img
                                                src={pl.images[0].url}
                                                alt=""
                                                aria-hidden="true"
                                                referrerPolicy="no-referrer"
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-app-surface-hover text-app-text-dim" aria-hidden="true">
                                                <span className="text-4xl">♫</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                    </div>
                                    <h3 className="text-app-text-main font-bold text-sm truncate w-full mb-1 lowercase">{pl.name}</h3>
                                    <span className="text-app-text-muted text-xs font-medium lowercase">{pl.tracks?.total || 0} tracks</span>
                                </button>
                                {/* Remove Button */}
                                {onRemoveAdded && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onRemoveAdded(pl.id)
                                        }}
                                        className="absolute top-2 right-2 text-app-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all z-10 p-1 focus:outline-none bg-app-bg/50 rounded-full"
                                        aria-label={`Remove playlist: ${pl.name}`}
                                        title="Remove"
                                    >
                                        <svg className="w-4 h-4" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <h2 id="main-playlists-heading" className="text-2xl font-bold mb-6 text-app-text-main tracking-tight lowercase">
                {isShowingSearch ? 'search results' : 'your playlists'}
                {isShowingSearch && (
                    <span className="ml-3 text-xs text-app-text-dim font-normal font-mono" aria-label={`${displayPlaylists.length} playlists found`}>
                        ({displayPlaylists.length} found)
                    </span>
                )}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" role="list" aria-labelledby="main-playlists-heading">
                {!isAuthenticated && !isShowingSearch && (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 text-center rounded-lg border border-app-border border-dashed bg-app-surface/20" role="status">
                        <div className="text-4xl mb-4 text-soul-green/80" aria-hidden="true">
                            <svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.48.66.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.38 9.841-.719 13.44 1.441.42.3.6.84.3 1.26zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                            </svg>
                        </div>
                        <p className="text-app-text-dim text-sm mb-6 max-w-sm whitespace-pre-line lowercase">
                            connect your spotify account to see your personal playlists.
                            you can still search for public playlists without connecting.
                        </p>
                        {onLoginRequested && (
                            <button
                                onClick={onLoginRequested}
                                className="bg-soul-green text-app-bg font-bold uppercase text-xs px-6 py-3 rounded-full hover:scale-105 transition-transform focus:outline-none"
                                aria-label="Connect Spotify Account"
                            >
                                CONNECT SPOTIFY
                            </button>
                        )}
                    </div>
                )}

                {isAuthenticated && !isShowingSearch && displayPlaylists.length === 0 && (
                    <div className="col-span-full text-app-text-dim font-mono lowercase text-center py-12" role="status">
                        no playlists found
                    </div>
                )}

                {isShowingSearch && displayPlaylists.length === 0 && (
                    <div className="col-span-full text-app-text-dim font-mono lowercase text-center py-12" role="status">
                        no results found
                    </div>
                )}

                {displayPlaylists.map(pl => (
                    <button
                        key={pl.id}
                        role="listitem"
                        onClick={() => onSelect(pl.id)}
                        className="w-full text-left group bg-app-surface/40 hover:bg-app-surface-hover transition-all p-4 rounded-md cursor-pointer flex flex-col items-center text-center relative overflow-hidden focus:outline-none"
                        aria-label={`Select playlist: ${pl.name}`}
                    >
                        <div className="w-full aspect-square bg-app-surface shadow-lg mb-4 relative rounded-sm overflow-hidden" aria-hidden="true">
                            {pl.images && pl.images[0] ? (
                                <img
                                    src={pl.images[0].url}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-app-surface-hover text-app-text-dim">
                                    <span className="text-4xl">♫</span>
                                </div>
                            )}
                            {/* Hover highlight only, no play button */}
                            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                        </div>
                        <h3 className="text-app-text-main font-bold text-sm truncate w-full mb-1 lowercase">{pl.name}</h3>
                        <span className="text-app-text-muted text-xs font-medium lowercase">{pl.tracks?.total || 0} tracks</span>
                    </button>
                ))
                }
            </div >
        </div >
    )
}
