export const APP_ERROR_CODES = [
  "SLSKD_DAEMON_OFFLINE",
  "SLSKD_NOT_CONFIGURED",
  "SLSKD_API_ERROR",
  "SEARCH_TIMEOUT",
  "DOWNLOAD_ABORTED",
  "DOWNLOAD_STALLED",
  "INGESTION_RATE_LIMIT",
  "STORAGE_IO_ERROR",
  "INVALID_PAYLOAD",
  "SPOTIFY_AUTH_FAILED",
  "PLAYLIST_NOT_FOUND",
  "NETWORK_ERROR",
  "UNKNOWN_ERROR",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export interface SerializedAppError {
  name: "AppError";
  code: AppErrorCode;
  message: string;
  fallbackMessage?: string;
  details?: Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERN =
  /^(api_?key|password|token|access_?token|refresh_?token|secret|auth|authorization|cookie|credentials?)$/i;

const PATH_PATTERNS = [
  /(?:[a-zA-Z]:\\(?:Users|Program Files|AppData|Windows)[^\s'"]*)/gi,
  /(?:\/(?:Users|home|var|tmp|etc|usr|opt|private|app)[^\s'"]*)/gi,
  /file:\/\/\/[^\s'"]+/gi,
];

function sanitizeString(input: string): string {
  let result = input;

  for (const pattern of PATH_PATTERNS) {
    result = result.replace(pattern, "[path]");
  }

  result = result.replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, "Bearer [redacted]");
  result = result.replace(
    /(token|api_?key|password|secret|access_?token)=([^\s&'"]+)/gi,
    "$1=[redacted]",
  );

  return result;
}

function sanitizeDetails(
  details?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!details || typeof details !== "object") return undefined;

  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(details)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = "[redacted]";
    } else if (typeof val === "string") {
      sanitized[key] = sanitizeString(val);
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      sanitized[key] = sanitizeDetails(val as Record<string, unknown>);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

export class AppError extends Error {
  public override readonly name = "AppError";
  public readonly code: AppErrorCode;
  public readonly fallbackMessage?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode | string,
    message: string,
    fallbackMessage?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = (
      APP_ERROR_CODES.includes(code as AppErrorCode) ? code : "UNKNOWN_ERROR"
    ) as AppErrorCode;
    this.fallbackMessage = fallbackMessage;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  public toJSON(): SerializedAppError {
    return AppError.serialize(this);
  }

  public static serialize(error: unknown): SerializedAppError {
    if (isAppError(error)) {
      return {
        name: "AppError",
        code: error.code,
        message: sanitizeString(error.message),
        fallbackMessage: error.fallbackMessage
          ? sanitizeString(error.fallbackMessage)
          : undefined,
        details: sanitizeDetails(error.details),
      };
    }

    // Check if error is a Zod validation error
    if (
      error &&
      typeof error === "object" &&
      ("issues" in error || (error as { name?: string }).name === "ZodError")
    ) {
      return {
        name: "AppError",
        code: "INVALID_PAYLOAD",
        message: "Invalid payload format",
        fallbackMessage: "The provided parameters failed validation",
        details: sanitizeDetails(error as Record<string, unknown>),
      };
    }

    if (error instanceof Error) {
      return {
        name: "AppError",
        code: "UNKNOWN_ERROR",
        message: sanitizeString(
          error.message || "An unexpected error occurred",
        ),
        details: sanitizeDetails(
          (error as unknown as { details?: Record<string, unknown> }).details,
        ),
      };
    }

    return {
      name: "AppError",
      code: "UNKNOWN_ERROR",
      message: sanitizeString(String(error ?? "An unknown error occurred")),
    };
  }

  public static deserialize(data: unknown): AppError {
    if (!isSerializedAppError(data)) {
      return new AppError("UNKNOWN_ERROR", "Failed to deserialize error");
    }

    return new AppError(
      data.code,
      data.message,
      data.fallbackMessage,
      data.details,
    );
  }
}

export function isAppError(error: unknown): error is AppError {
  return (
    error instanceof AppError ||
    (error instanceof Error &&
      error.name === "AppError" &&
      typeof (error as AppError).code === "string")
  );
}

export function isSerializedAppError(
  data: unknown,
): data is SerializedAppError {
  if (!data || typeof data !== "object") return false;
  const candidate = data as Record<string, unknown>;
  return (
    candidate.name === "AppError" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  );
}
