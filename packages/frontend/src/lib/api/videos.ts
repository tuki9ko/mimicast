/**
 * 動画関連 API（設計 16 章）。
 */

import type {
  CreateVideoRequest,
  CreateVideoResponse,
  DistributionStatus,
  ListVideosResponse,
  PlaybackUrlResponse,
  VideoDto,
} from "@mimicast/shared";

import { apiClient } from "./client.ts";

export interface ListVideosParams {
  limit?: number;
  cursor?: string;
}

export function listVideos(
  params: ListVideosParams = {},
): Promise<ListVideosResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.cursor !== undefined) query.set("cursor", params.cursor);
  const suffix = query.size === 0 ? "" : `?${query.toString()}`;
  return apiClient.get<ListVideosResponse>(`/videos${suffix}`);
}

export function getVideo(id: string): Promise<VideoDto> {
  return apiClient.get<VideoDto>(`/videos/${encodeURIComponent(id)}`);
}

export function createVideo(
  request: CreateVideoRequest,
): Promise<CreateVideoResponse> {
  return apiClient.post<CreateVideoResponse>("/videos", request);
}

export function deleteVideo(id: string): Promise<void> {
  return apiClient.delete<void>(`/videos/${encodeURIComponent(id)}`);
}

export function updateDistribution(
  id: string,
  distributionStatus: DistributionStatus,
): Promise<VideoDto> {
  return apiClient.patch<VideoDto>(
    `/videos/${encodeURIComponent(id)}/distribution`,
    { distributionStatus },
  );
}

export function createPlaybackUrl(
  id: string,
  expiresIn: number,
): Promise<PlaybackUrlResponse> {
  return apiClient.post<PlaybackUrlResponse>(
    `/videos/${encodeURIComponent(id)}/playback-url`,
    { expiresIn },
  );
}
