
export interface Artist {
    name: string
    id?: string
}

export interface Album {
    name: string
    id?: string
    images?: { url: string }[]
}

export interface Track {
    id: string
    name: string
    artists: Artist[]
    album: Album
    duration_ms: number
    image?: string
    is_youtube?: boolean
}

export interface Playlist {
    id: string
    name: string
    description?: string
    images: { url: string }[]
    tracks: { total: number }
    owner: { display_name: string }
    public?: boolean
    type?: 'spotify' | 'youtube'
    original_url?: string
}

export interface DownloadItem {
    id: string
    track: Track
    status: 'pending' | 'searching' | 'queued' | 'downloading' | 'completed' | 'failed'
    progress: number
    filename?: string
    username?: string
    transferId?: string
    error?: string
}

export interface SlskdFile {
    filename: string;
    bitRate: number;
    size: number;
    username: string;
    speed: number;
    slotsFree: boolean;
    queueLength: number;
    id?: string;
    state?: string;
    bytesTransferred?: number;
}
