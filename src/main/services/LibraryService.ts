import { existsSync } from "fs";
import { join } from "path";
import { Track } from "../../shared/types";
import { buildTargetFilePath, sanitizeFilename } from "./MetadataService";
import log from "../utils/logger";

export interface TrackLibraryStatus {
  inLibrary: boolean;
  filePath?: string;
}

export class LibraryService {
  /**
   * Scans the configured download directory to see if an audio file matching
   * the given track already exists on disk (checking FLAC, MP3, and organized subdirectories).
   */
  findTrackInLibrary(track: Track, downloadDir: string): string | null {
    if (!downloadDir || !existsSync(downloadDir)) {
      return null;
    }

    const primaryArtist =
      track.artists && track.artists.length > 0
        ? track.artists.map((a) => a.name).join(", ")
        : "Unknown Artist";

    const sanitizedArtist = sanitizeFilename(primaryArtist);
    const sanitizedTitle = sanitizeFilename(track.name || "Unknown Track");
    const albumName = track.album?.name?.trim();
    const hasValidAlbum =
      albumName &&
      albumName.toLowerCase() !== "unknown" &&
      albumName.length > 0;

    const extensions = ["flac", "mp3", "wav", "aiff"];

    for (const ext of extensions) {
      // 1. Standard buildTargetFilePath with album and track number if applicable
      const targetPath = buildTargetFilePath({
        downloadDir,
        track,
        extension: ext,
        trackNumber: track.track_number,
        year: track.year,
      });

      if (existsSync(targetPath)) {
        return targetPath;
      }

      // 2. Check without track number in album folder if album is present
      if (hasValidAlbum) {
        const sanitizedAlbum = sanitizeFilename(albumName);
        const noTrackNumPath = join(
          downloadDir,
          sanitizedArtist,
          sanitizedAlbum,
          `${sanitizedTitle}.${ext}`,
        );
        if (existsSync(noTrackNumPath)) {
          return noTrackNumPath;
        }
      }

      // 3. Check directly in artist folder: <DownloadDir>/<Artist>/<Artist> - <Title>.<ext>
      const artistFolderTitle = join(
        downloadDir,
        sanitizedArtist,
        `${sanitizedArtist} - ${sanitizedTitle}.${ext}`,
      );
      if (existsSync(artistFolderTitle)) {
        return artistFolderTitle;
      }

      // 4. Check flat file: <DownloadDir>/<Artist> - <Title>.<ext>
      const flatPath = join(
        downloadDir,
        `${sanitizedArtist} - ${sanitizedTitle}.${ext}`,
      );
      if (existsSync(flatPath)) {
        return flatPath;
      }
    }

    return null;
  }

  /**
   * Checks whether a single track exists in the library.
   */
  isTrackInLibrary(track: Track, downloadDir: string): TrackLibraryStatus {
    try {
      const filePath = this.findTrackInLibrary(track, downloadDir);
      if (filePath) {
        return { inLibrary: true, filePath };
      }
    } catch (err) {
      log.warn(`[LibraryService] Error checking track ${track.id}:`, err);
    }
    return { inLibrary: false };
  }

  /**
   * Batch checks a list of tracks against the user's download directory.
   */
  checkTracks(
    tracks: Track[],
    downloadDir: string,
  ): Record<string, TrackLibraryStatus> {
    const results: Record<string, TrackLibraryStatus> = {};
    for (const track of tracks) {
      results[track.id] = this.isTrackInLibrary(track, downloadDir);
    }
    return results;
  }
}
