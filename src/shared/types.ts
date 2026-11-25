export interface Artist {
  name: string;
  id?: string;
}

export interface Album {
  name: string;
  id?: string;
  images?: { url: string }[];
}

export interface Track {
  id: string;
  name: string;
  artists: Artist[];
  album: Album;
  duration_ms: number;
  image?: string;
  is_youtube?: boolean;
  is_soundcloud?: boolean;
  is_bandcamp?: boolean;
  track_number?: number;
  year?: string | number;
  targetPath?: string;
  filePath?: string;
  formatInfo?: FormatInfo;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  images: { url: string }[];
  tracks: { total: number };
  owner: { display_name: string };
  public?: boolean;
  type?: "spotify" | "youtube" | "setlist" | "soundcloud" | "bandcamp";
  original_url?: string;
}

export type DownloadStatus =
  | "pending"
  | "searching"
  | "queued"
  | "connecting"
  | "downloading"
  | "tagging"
  | "completed"
  | "failed"
  | "paused";

export interface FormatInfo {
  format: "FLAC" | "MP3";
  sampleRate: number;
  bitDepth?: number;
  bitrate?: number;
  channels?: number;
  isVbr?: boolean;
  bpm?: number;
  camelotKey?: string;
  integrity?: "genuine" | "suspect_transcode" | "unverified";
  cutoffFrequency?: number;
  replayGain?: {
    trackGain: string;
    trackPeak: string;
    albumGain?: string;
  };
}

export interface DownloadItem {
  id: string;
  track: Track;
  status: DownloadStatus;
  progress: number;
  filename?: string;
  username?: string;
  transferId?: string;
  error?: string;
  speed?: number;
  formattedSpeed?: string;
  bytesTransferred?: number;
  size?: number;
  formattedSize?: string;
  targetPath?: string;
  filePath?: string;
  playlistName?: string;
  customQuery?: string;
  formatInfo?: FormatInfo;
  searchAttempt?: number;
  failoverPeer?: string;
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
  averageSpeed?: number;
}

export interface SlskdStatus {
  server?: {
    isLoggedIn?: boolean;
    state?: string;
  };
  state?: string;
}

export interface TrackLibraryStatus {
  inLibrary: boolean;
  filePath?: string;
}

export interface ExportPlaylistResult {
  filePath: string;
  success: boolean;
  trackCount: number;
}

export interface ExportCrateResult {
  filePath: string;
  success: boolean;
  trackCount: number;
}

export type UpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "up-to-date"
  | "error";

export interface UpdateStatus {
  status: UpdateState;
  version?: string;
  releaseNotes?: string;
  progress?: number;
  error?: string;
}
