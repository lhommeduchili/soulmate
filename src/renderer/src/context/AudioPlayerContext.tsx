import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useI18n } from "./I18nContext";
import { FormatInfo } from "../../../shared/types";

export interface AudioTrackInfo {
  id: string;
  title: string;
  artist: string;
  filePath: string;
  formatInfo?: FormatInfo;
}

interface AudioPlayerContextType {
  currentTrack: AudioTrackInfo | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  audioError: string | null;
  announcement: string;
  playTrack: (track: AudioTrackInfo) => void;
  pauseTrack: () => void;
  togglePlay: () => void;
  stopTrack: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

export function AudioPlayerProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const { t } = useI18n();
  const [currentTrack, setCurrentTrack] = useState<AudioTrackInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.85);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setAudioError(null);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setAudioError(t("player.audioError"));
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [t]);

  const playTrack = useCallback(
    (track: AudioTrackInfo) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (currentTrack?.id === track.id) {
        if (isPlaying) {
          audio.pause();
          setIsPlaying(false);
          setAnnouncement(t("player.pause"));
        } else {
          audio.play().catch(() => {
            setAudioError(t("player.audioError"));
          });
          setIsPlaying(true);
          setAnnouncement(
            t("player.previewing", {
              title: track.title,
              artist: track.artist,
            }),
          );
        }
        return;
      }

      // New track
      setCurrentTrack(track);
      setAudioError(null);
      setCurrentTime(0);

      const streamUrl = window.api?.media?.getPreviewUrl
        ? window.api.media.getPreviewUrl(track.filePath)
        : track.filePath;

      audio.src = streamUrl;
      audio.load();
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setAnnouncement(
            t("player.previewing", {
              title: track.title,
              artist: track.artist,
            }),
          );
        })
        .catch(() => {
          setAudioError(t("player.audioError"));
          setIsPlaying(false);
        });
    },
    [currentTrack, isPlaying, t],
  );

  const pauseTrack = useCallback(() => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      setAnnouncement(t("player.pause"));
    }
  }, [isPlaying, t]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      setAnnouncement(t("player.pause"));
    } else {
      audio.play().catch(() => {
        setAudioError(t("player.audioError"));
      });
      setIsPlaying(true);
      setAnnouncement(
        t("player.previewing", {
          title: currentTrack.title,
          artist: currentTrack.artist,
        }),
      );
    }
  }, [currentTrack, isPlaying, t]);

  const stopTrack = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTrack(null);
    setCurrentTime(0);
    setAudioError(null);
    setAnnouncement(t("player.stop"));
  }, [t]);

  const seek = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    setVolumeState(clamped);
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        volume,
        audioError,
        announcement,
        playTrack,
        pauseTrack,
        togglePlay,
        stopTrack,
        seek,
        setVolume,
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerContextType {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error(
      "useAudioPlayer must be used within an AudioPlayerProvider",
    );
  }
  return context;
}
