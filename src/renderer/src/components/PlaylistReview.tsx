import { useState, useEffect } from 'react'
import { LoadingOverlay } from './LoadingOverlay'
import { EditableCell } from './EditableCell'
import { Track } from '../../../shared/types'

interface Props {
    playlistId: string
    playlistType?: 'spotify' | 'youtube'
    onBack: () => void
}

export function PlaylistReview({ playlistId, playlistType = 'spotify', onBack }: Props): JSX.Element {
    const [tracks, setTracks] = useState<Track[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        const fetcher = playlistType === 'youtube'
            ? window.api.youtube.getTracks(playlistId)
            : window.api.spotify.getTracks(playlistId)

        fetcher
            .then((data: Track[]) => {
                setTracks(data)
                setSelected(new Set(data.map((t: Track) => t.id)))
                setLoading(false)
            })
            .catch((err: Error) => {
                console.error(err)
                setLoading(false)
            })
    }, [playlistId])

    const toggleSelect = (id: string) => {
        const next = new Set(selected)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelected(next)
    }

    const downloadSelected = () => {
        const toDownload = tracks.filter(t => selected.has(t.id))
        window.api.queue.start(toDownload)
        // Show integrated toast/status instead of alert in future
    }

    const handleUpdateTrack = (id: string, field: 'name' | 'artist' | 'album', value: string) => {
        setTracks(prev => prev.map(track => {
            if (track.id !== id) return track

            // Create a deep copy or use spread for shallow 
            // Since artists is array of objects, be careful
            const newTrack = { ...track }

            if (field === 'name') {
                newTrack.name = value
            } else if (field === 'album') {
                newTrack.album = { ...newTrack.album, name: value }
            } else if (field === 'artist') {
                // Update first artist name
                const newArtists = [...newTrack.artists]
                if (newArtists.length > 0) {
                    newArtists[0] = { ...newArtists[0], name: value }
                } else {
                    newArtists.push({ name: value })
                }
                newTrack.artists = newArtists
            }
            return newTrack
        }))
    }

    if (loading) return <LoadingOverlay text="decrypting playlist..." />

    return (
        <div className="flex flex-col h-full" role="region" aria-label="Playlist editor">
            {/* Header Toolbar */}
            <header className="sticky top-0 z-20 bg-app-bg/95 backdrop-blur border-b border-app-border p-6 flex justify-between items-center shadow-2xl">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="sr-only" aria-label="Go back to playlists">Back</button> {/* Hidden for a11y, using Home button now */}
                    <span className="text-app-text-dim text-xs font-mono uppercase tracking-widest pl-1" aria-live="polite">{selected.size} / {tracks.length} Selected</span>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={downloadSelected}
                        disabled={selected.size === 0}
                        aria-label={`Download ${selected.size} selected tracks`}
                        className="bg-soul-green hover:bg-green-400 text-app-bg font-bold py-2 px-6 rounded-full text-sm uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow focus:outline-none"
                    >
                        Download Selected
                    </button>
                </div>
            </header>

            {/* Content Table */}
            <div className="flex-1 overflow-auto p-6 pt-0" role="region" aria-label="Track list" tabIndex={0}>
                <table className="w-full text-left text-sm table-fixed">
                    <caption className="sr-only">Tracks in this playlist</caption>
                    <thead className="text-app-text-dim border-b border-app-border uppercase font-medium text-xs sticky top-0 bg-app-bg z-10">
                        <tr>
                            <th scope="col" className="pb-3 pt-4 w-10 text-center">
                                <label className="sr-only" htmlFor="select-all-tracks">Select all tracks</label>
                                <input
                                    id="select-all-tracks"
                                    type="checkbox"
                                    checked={selected.size === tracks.length && tracks.length > 0}
                                    onChange={() => {
                                        if (selected.size === tracks.length) setSelected(new Set())
                                        else setSelected(new Set(tracks.map(t => t.id)))
                                    }}
                                    className="accent-soul-green bg-app-surface border-app-line rounded-sm w-4 h-4 cursor-pointer focus:outline-none"
                                />
                            </th>
                            <th scope="col" className="pb-3 pt-4 pl-4 w-1/3">Title</th>
                            <th scope="col" className="pb-3 pt-4 w-1/4">Artist</th>
                            <th scope="col" className="pb-3 pt-4 w-1/4">Album</th>
                            <th scope="col" className="pb-3 pt-4 w-20 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-app-line/50">
                        {tracks.map((track, i) => (
                            <tr key={`${track.id}-${i}`} className="group hover:bg-app-surface/60 transition-colors">
                                <td className="py-3 text-center">
                                    <label className="sr-only" htmlFor={`select-track-${track.id}`}>Select track {track.name}</label>
                                    <input
                                        id={`select-track-${track.id}`}
                                        type="checkbox"
                                        checked={selected.has(track.id)}
                                        onChange={() => toggleSelect(track.id)}
                                        className="accent-soul-green bg-app-surface border-app-line rounded-sm w-4 h-4 cursor-pointer opacity-50 group-hover:opacity-100 transition-opacity focus:outline-none focus:opacity-100"
                                    />
                                </td>
                                <td className="py-3 pl-4 font-medium text-app-text-main overflow-hidden">
                                    <EditableCell
                                        value={track.name}
                                        onChange={(val) => handleUpdateTrack(track.id, 'name', val)}
                                        aria-label={`Edit title for ${track.name}`}
                                    />
                                </td>
                                <td className="py-3 text-app-text-muted overflow-hidden">
                                    <EditableCell
                                        value={track.artists.map(a => a.name).join(', ')}
                                        onChange={(val) => handleUpdateTrack(track.id, 'artist', val)}
                                        aria-label={`Edit artist for ${track.name}`}
                                    />
                                </td>
                                <td className="py-3 text-app-text-dim overflow-hidden">
                                    <EditableCell
                                        value={track.album?.name || ''}
                                        onChange={(val) => handleUpdateTrack(track.id, 'album', val)}
                                        aria-label={`Edit album for ${track.name}`}
                                    />
                                </td>
                                <td className="py-3 text-right">
                                    <button
                                        onClick={() => window.api.queue.start([track])}
                                        aria-label={`Download track ${track.name}`}
                                        className="text-soul-green hover:text-app-text-main text-xs border border-soul-green/30 hover:bg-soul-green hover:border-transparent px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all focus:outline-none"
                                    >
                                        GET
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
