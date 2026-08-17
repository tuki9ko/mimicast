/**
 * Frontend / Backend 共有の型定義。
 *
 * 設計 5.2（Video Entity）および 8 章（API 設計）に対応する。
 */

export type VideoStatus =
  | "UPLOADING"
  | "UPLOADED"
  | "TRANSCODING"
  | "READY"
  | "ERROR"
  | "DELETING";

export type DistributionStatus = "DISABLED" | "ENABLED";

/**
 * API が返す動画表現。
 *
 * DynamoDB の内部項目（gsi1pk / gsi1sk / uploadId / mediaConvertJobId）は含めない。
 */
export interface VideoDto {
  id: string;
  title: string;
  originalFilename: string;

  status: VideoStatus;
  distributionStatus: DistributionStatus;

  sourceKey: string;
  outputKey?: string;

  sourceContentType: string;
  sourceSize: number;
  sourceWidth?: number;
  sourceHeight?: number;

  outputSize?: number;
  width?: number;
  height?: number;
  frameRate?: number;

  errorCode?: string;
  errorMessage?: string;

  /** ISO8601 UTC */
  createdAt: string;
  /** ISO8601 UTC */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API: POST /videos
// ---------------------------------------------------------------------------

export interface CreateVideoRequest {
  title: string;
  filename: string;
  contentType: string;
  size: number;
  /** ブラウザで取得できなかった場合は null */
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}

export interface CreateVideoResponse {
  id: string;
  status: VideoStatus;
  sourceKey: string;
}

// ---------------------------------------------------------------------------
// API: Multipart Upload
// ---------------------------------------------------------------------------

export interface CreateUploadResponse {
  uploadId: string;
  partSize: number;
  partCount: number;
}

export interface CreatePartUrlsRequest {
  partNumbers: number[];
}

export interface PartUrl {
  partNumber: number;
  url: string;
  /** ISO8601 UTC */
  expiresAt: string;
}

export interface CreatePartUrlsResponse {
  urls: PartUrl[];
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface CompleteUploadRequest {
  parts: CompletedPart[];
}

// ---------------------------------------------------------------------------
// API: 一覧 / 配信制御 / URL 発行
// ---------------------------------------------------------------------------

export interface ListVideosResponse {
  items: VideoDto[];
  nextCursor: string | null;
}

export interface UpdateDistributionRequest {
  distributionStatus: DistributionStatus;
}

export interface PlaybackUrlRequest {
  /** PLAYBACK_EXPIRES_OPTIONS のいずれか（秒） */
  expiresIn: number;
}

export interface PlaybackUrlResponse {
  url: string;
  /** ISO8601 UTC */
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// エラー
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TRANSCODE_START_FAILED"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | string;
    message: string;
  };
}
