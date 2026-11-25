import { join, relative, sep } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { shell } from "electron";
import { Track } from "../../shared/types";
import { sanitizeFilename, buildTargetFilePath } from "./MetadataService";
import { LibraryService } from "./LibraryService";
import log from "../utils/logger";

export interface GenerateM3u8Options {
  tracks: Track[];
  downloadDir: string;
  playlistDir: string;
}

export interface ExportPlaylistOptions {
  playlistName: string;
  tracks: Track[];
  downloadDir: string;
  reveal?: boolean;
}

export interface ExportPlaylistResult {
  filePath: string;
  success: boolean;
  trackCount: number;
}

export class PlaylistExportService {
  private libraryService: LibraryService;

  constructor(libraryService: LibraryService = new LibraryService()) {
    this.libraryService = libraryService;
  }

  /**
   * Generates extended UTF-8 .m3u8 content with:
   * #EXTM3U
   * #EXTINF:<durationSeconds>,<Artist> - <Title>
   * <Relative/Path/To/Audio/File>
   */
  generateM3u8Content(options: GenerateM3u8Options): string {
    const { tracks, downloadDir, playlistDir } = options;
    const lines: string[] = ["#EXTM3U"];

    for (const track of tracks) {
      const durationSec =
        track.duration_ms && track.duration_ms > 0
          ? Math.round(track.duration_ms / 1000)
          : -1;

      const artist =
        track.artists && track.artists.length > 0
          ? track.artists.map((a) => a.name).join(", ")
          : "Unknown Artist";

      const title = track.name || "Unknown Track";

      // 1. Resolve audio file path
      let audioPath: string | null = null;

      // Check if item already has targetPath or filePath
      const possibleTrackWithPaths = track as Track & {
        targetPath?: string;
        filePath?: string;
      };
      if (
        possibleTrackWithPaths.targetPath &&
        existsSync(possibleTrackWithPaths.targetPath)
      ) {
        audioPath = possibleTrackWithPaths.targetPath;
      } else if (
        possibleTrackWithPaths.filePath &&
        existsSync(possibleTrackWithPaths.filePath)
      ) {
        audioPath = possibleTrackWithPaths.filePath;
      } else {
        // Query library to see if it exists on disk
        audioPath = this.libraryService.findTrackInLibrary(track, downloadDir);
      }

      // If not on disk, resolve the default DJ target path (FLAC preferred)
      if (!audioPath) {
        audioPath = buildTargetFilePath({
          downloadDir,
          track,
          extension: "flac",
          trackNumber: track.track_number,
          year: track.year,
        });
      }

      // 2. Compute relative path from playlistDir to audioPath
      // Cross-platform standard: normalize backslashes to forward slashes '/'
      const relPath = relative(playlistDir, audioPath).split(sep).join("/");

      lines.push(`#EXTINF:${durationSec},${artist} - ${title}`);
      lines.push(relPath);
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Saves the extended .m3u8 manifest to:
   * <DownloadDir>/Playlists/<SanitizedPlaylistName>.m3u8
   * and optionally reveals it in the OS file explorer.
   */
  exportPlaylist(options: ExportPlaylistOptions): ExportPlaylistResult {
    const { playlistName, tracks, downloadDir, reveal = false } = options;
    const sanitizedName = sanitizeFilename(playlistName) || "Soulmate Playlist";
    const playlistDir = join(downloadDir, "Playlists");

    mkdirSync(playlistDir, { recursive: true });

    const filePath = join(playlistDir, `${sanitizedName}.m3u8`);
    const content = this.generateM3u8Content({
      tracks,
      downloadDir,
      playlistDir,
    });

    writeFileSync(filePath, content, "utf-8");
    log.info(`[PlaylistExportService] Exported playlist to: ${filePath}`);

    const isTest =
      process.env.NODE_ENV === "test" ||
      Boolean(process.env.PLAYWRIGHT_TEST) ||
      Boolean(process.env.TEST_USER_DATA_DIR);

    if (reveal && !isTest) {
      try {
        if (existsSync(filePath)) {
          shell.showItemInFolder(filePath);
        }
      } catch (err) {
        log.warn(
          `[PlaylistExportService] Failed to reveal manifest in folder: ${filePath}`,
          err,
        );
      }
    }

    return {
      filePath,
      success: true,
      trackCount: tracks.length,
    };
  }
}
