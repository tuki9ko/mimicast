/**
 * ルーティング表。API Gateway HTTP API の routeKey をそのままキーにする。
 *
 * 設計 16 章の API 一覧と 1 対 1 で対応する。
 */

import { createPlaybackUrl } from "./playbackUrl.ts";
import {
  abortUpload,
  completeUpload,
  createPartUrls,
  createUpload,
} from "./uploads.ts";
import {
  createVideo,
  deleteVideo,
  getVideo,
  listVideos,
  updateDistribution,
} from "./videos.ts";
import type { RouteHandler } from "./helpers.ts";

export const routes: Record<string, RouteHandler> = {
  "GET /videos": listVideos,
  "POST /videos": createVideo,
  "GET /videos/{id}": getVideo,
  "DELETE /videos/{id}": deleteVideo,
  "POST /videos/{id}/uploads": createUpload,
  "POST /videos/{id}/uploads/{uploadId}/parts": createPartUrls,
  "POST /videos/{id}/uploads/{uploadId}/complete": completeUpload,
  "DELETE /videos/{id}/uploads/{uploadId}": abortUpload,
  "PATCH /videos/{id}/distribution": updateDistribution,
  "POST /videos/{id}/playback-url": createPlaybackUrl,
};

export type { RouteHandler };
