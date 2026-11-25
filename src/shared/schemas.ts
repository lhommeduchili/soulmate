import { z } from "zod";

export const StringQuerySchema = z.string().min(1);
export const FormatsSchema = z.array(z.string().min(2));

export const ArtistSchema = z.object({
  name: z.string(),
  id: z.string().optional(),
});

export const AlbumSchema = z.object({
  name: z.string(),
  id: z.string().optional(),
  images: z.array(z.object({ url: z.string() })).optional(),
});

export const FormatInfoSchema = z.object({
  format: z.enum(["FLAC", "MP3"]),
  sampleRate: z.number(),
  bitDepth: z.number().optional(),
  bitrate: z.number().optional(),
  channels: z.number().optional(),
  isVbr: z.boolean().optional(),
  bpm: z.number().optional(),
  camelotKey: z.string().optional(),
  integrity: z.enum(["genuine", "suspect_transcode", "unverified"]).optional(),
  cutoffFrequency: z.number().optional(),
  replayGain: z
    .object({
      trackGain: z.string(),
      trackPeak: z.string(),
      albumGain: z.string().optional(),
    })
    .optional(),
});
export type FormatInfoType = z.infer<typeof FormatInfoSchema>;

export const TrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  artists: z.array(ArtistSchema),
  album: AlbumSchema.optional(),
  duration_ms: z.number().optional(),
  image: z.string().optional(),
  is_youtube: z.boolean().optional(),
  track_number: z.number().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  targetPath: z.string().optional(),
  filePath: z.string().optional(),
  formatInfo: FormatInfoSchema.optional(),
});

export const TracksArraySchema = z.array(TrackSchema);

export const ExportPlaylistPayloadSchema = z.object({
  playlistName: z.string().min(1),
  tracks: TracksArraySchema.optional(),
  reveal: z.boolean().optional(),
});
export type ExportPlaylistPayload = z.infer<typeof ExportPlaylistPayloadSchema>;

export const ExportCratePayloadSchema = z.object({
  playlistName: z.string().min(1),
  tracks: TracksArraySchema.optional(),
  reveal: z.boolean().optional(),
  fileName: z.string().optional(),
});
export type ExportCratePayload = z.infer<typeof ExportCratePayloadSchema>;

export const RetryWithQueryPayloadSchema = z.object({
  id: z.string().min(1),
  customQuery: z.string().min(1),
});
export type RetryWithQueryPayload = z.infer<typeof RetryWithQueryPayloadSchema>;

export const SearchSourcesPayloadSchema = z.object({
  id: z.string().min(1),
  query: z.string().optional(),
});
export type SearchSourcesPayload = z.infer<typeof SearchSourcesPayloadSchema>;

export const SelectSourcePayloadSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().optional(),
  bitRate: z.number().optional(),
});
export type SelectSourcePayload = z.infer<typeof SelectSourcePayloadSchema>;

export const AppLocaleSchema = z.enum(["es-CL", "en"]);
export type AppLocale = z.infer<typeof AppLocaleSchema>;

export const AppRegionSchema = z.enum([
  "CL",
  "US",
  "GB",
  "AR",
  "MX",
  "ES",
  "BR",
]);
export type AppRegion = z.infer<typeof AppRegionSchema>;

export const FormatPrioritySchema = z.enum(["flac", "320kbps", "any"]);
export type FormatPriority = z.infer<typeof FormatPrioritySchema>;

export const BaseUserPreferencesSchema = z.object({
  downloadPath: z.string(),
  formatPriority: FormatPrioritySchema,
  locale: AppLocaleSchema,
  region: AppRegionSchema,
  maxConcurrentDownloads: z.number().int().min(0),
  autoQueryCascade: z.boolean(),
  downloadSpeedLimit: z.number().int().min(0),
  enableReplayGain: z.boolean(),
});

export const UserPreferencesSchema = z.object({
  downloadPath: z.string().default(""),
  formatPriority: FormatPrioritySchema.default("flac"),
  locale: AppLocaleSchema.default("es-CL"),
  region: AppRegionSchema.default("CL"),
  maxConcurrentDownloads: z.number().int().min(0).default(2),
  autoQueryCascade: z.boolean().default(true),
  downloadSpeedLimit: z.number().int().min(0).default(0),
  enableReplayGain: z.boolean().default(true),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const PartialUserPreferencesSchema = BaseUserPreferencesSchema.partial();

export const ParseSetlistPayloadSchema = z.object({
  content: z.string(),
  filename: z.string().optional(),
});
export type ParseSetlistPayload = z.infer<typeof ParseSetlistPayloadSchema>;

export const SaveSetlistPayloadSchema = z.object({
  id: z.string().min(1),
  tracks: TracksArraySchema,
  name: z.string().optional(),
});
export type SaveSetlistPayload = z.infer<typeof SaveSetlistPayloadSchema>;
