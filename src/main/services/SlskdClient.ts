import { net, app } from "electron";
import { join } from "path";
import Database from "better-sqlite3";
import log from "../utils/logger";
import { AppError } from "../utils/AppError";
import { SlskdFile, SlskdStatus } from "../../shared/types";

interface DbSearchRow {
  ResponsesJson: string;
}

export interface SlskdSearchResponse {
  username?: string;
  Username?: string;
  hasFreeUploadSlot?: boolean;
  HasFreeUploadSlot?: boolean;
  uploadSpeed?: number;
  UploadSpeed?: number;
  queueLength?: number;
  QueueLength?: number;
  files?: SlskdFile[];
  Files?: SlskdFile[];
  fileCount?: number;
  FileCount?: number;
}

export interface SlskdSearchState {
  id: string;
  Id?: string;
  searchText?: string;
  state?: string;
  isComplete?: boolean;
  fileCount?: number;
  responseCount?: number;
  responses?: SlskdSearchResponse[];
}

export interface SlskdDownloadTransfer {
  [key: string]: unknown;
  id?: string;
  Id?: string;
  filename?: string;
  Filename?: string;
  state?: string;
  State?: string;
  percentComplete?: number;
  PercentComplete?: number;
  bytesTransferred?: number;
  BytesTransferred?: number;
  size?: number;
  Size?: number;
  averageSpeed?: number;
  AverageSpeed?: number;
  bytesRemaining?: number;
  BytesRemaining?: number;
  enqueued?: boolean;
  direction?: string;
  startTime?: string;
  endTime?: string;
}

export interface SlskdDownloadDirectory {
  directory?: string;
  Directory?: string;
  files?: SlskdDownloadTransfer[];
  Files?: SlskdDownloadTransfer[];
}

export interface SlskdUserDownloads {
  username?: string;
  Username?: string;
  directories?: SlskdDownloadDirectory[];
  Directories?: SlskdDownloadDirectory[];
}

export interface SlskdDownloadEnqueueResponse {
  id?: string;
  Id?: string;
  enqueued?: SlskdDownloadTransfer[];
  failed?: unknown[];
}

export class SlskdClient {
  private port: number = 0;
  private apiKey: string = "";
  private dbPath: string = "";

  constructor() {
    const userDataPath = app.getPath("userData");
    this.dbPath = join(userDataPath, "data", "search.db");
  }

  configure(port: number, apiKey: string): void {
    this.port = port;
    this.apiKey = apiKey;
  }

  private async request<T>(
    apiPath: string,
    method: string = "GET",
    body?: unknown,
  ): Promise<T> {
    if (!this.port || !this.apiKey) {
      throw new AppError("SLSKD_NOT_CONFIGURED", "SlskdClient not configured");
    }

    const url = `http://127.0.0.1:${this.port}/api/v0${apiPath}`;

    const response = await net.fetch(url, {
      method,
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new AppError(
        "SLSKD_API_ERROR",
        `Slskd API Error: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }

  async getSoulseekConnectionState(): Promise<SlskdStatus> {
    return this.request<SlskdStatus>("/application");
  }

  async search(query: string): Promise<SlskdSearchState> {
    return this.request<SlskdSearchState>("/searches", "POST", {
      searchText: query,
    });
  }

  async getSearchResults(id: string): Promise<SlskdSearchState> {
    const encodedId = encodeURIComponent(id);
    const apiData = await this.request<SlskdSearchState>(
      `/searches/${encodedId}`,
    );

    if (
      (!apiData.responses || apiData.responses.length === 0) &&
      (apiData.fileCount ?? 0) > 0
    ) {
      log.info(
        `[SlskdClient] API returned empty responses for ${id} (${apiData.fileCount} files). Checking DB...`,
      );
      const dbResults = this.getSearchResultsFromDb(id);
      if (dbResults) {
        log.info(`[SlskdClient] DB returned ${dbResults.length} responses`);
        apiData.responses = dbResults;
      } else {
        log.info("[SlskdClient] DB returned null");
      }
    }
    return apiData;
  }

  private getSearchResultsFromDb(
    searchId: string,
  ): SlskdSearchResponse[] | null {
    try {
      const db = new Database(this.dbPath, {
        readonly: true,
        fileMustExist: true,
      });

      const stmt = db.prepare(
        "SELECT ResponsesJson FROM Searches WHERE Id = ?",
      );
      const row = stmt.get(searchId.toUpperCase()) as DbSearchRow | undefined;

      db.close();

      if (row && row.ResponsesJson) {
        return JSON.parse(row.ResponsesJson) as SlskdSearchResponse[];
      }
    } catch (error: unknown) {
      const errCode =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: string }).code
          : undefined;
      if (errCode !== "SQLITE_CANTOPEN") {
        log.error("[SlskdClient] DB Read Error:", error);
      }
    }
    return null;
  }

  async download(
    username: string,
    filename: string,
    size: number,
  ): Promise<SlskdDownloadEnqueueResponse> {
    return this.request<SlskdDownloadEnqueueResponse>(
      `/transfers/downloads/${encodeURIComponent(username)}`,
      "POST",
      [{ filename, size }],
    );
  }

  async getDownloads(): Promise<SlskdUserDownloads[]> {
    return this.request<SlskdUserDownloads[]>("/transfers/downloads");
  }

  async cancelDownload(username: string, itemId: string): Promise<unknown> {
    return this.request<unknown>(
      `/transfers/downloads/${encodeURIComponent(username)}/${encodeURIComponent(itemId)}`,
      "DELETE",
    );
  }

  async reconfigureOptions(options: Record<string, unknown>): Promise<unknown> {
    return this.request<unknown>("/options", "POST", options);
  }
}
