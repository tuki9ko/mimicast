/**
 * Multipart Upload 関連 API（設計 8.3）。
 */

import type {
  CompletedPart,
  CreatePartUrlsResponse,
  CreateUploadResponse,
  VideoDto,
} from "@mimicast/shared";

import { apiClient } from "./client.ts";

const uploadsPath = (videoId: string) =>
  `/videos/${encodeURIComponent(videoId)}/uploads`;

export function createUpload(videoId: string): Promise<CreateUploadResponse> {
  return apiClient.post<CreateUploadResponse>(uploadsPath(videoId));
}

export function createPartUrls(
  videoId: string,
  uploadId: string,
  partNumbers: number[],
): Promise<CreatePartUrlsResponse> {
  return apiClient.post<CreatePartUrlsResponse>(
    `${uploadsPath(videoId)}/${encodeURIComponent(uploadId)}/parts`,
    { partNumbers },
  );
}

export function completeUpload(
  videoId: string,
  uploadId: string,
  parts: CompletedPart[],
): Promise<VideoDto> {
  return apiClient.post<VideoDto>(
    `${uploadsPath(videoId)}/${encodeURIComponent(uploadId)}/complete`,
    { parts },
  );
}

export function abortUpload(
  videoId: string,
  uploadId: string,
): Promise<void> {
  return apiClient.delete<void>(
    `${uploadsPath(videoId)}/${encodeURIComponent(uploadId)}`,
  );
}
