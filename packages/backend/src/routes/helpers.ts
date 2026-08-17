/**
 * ルートハンドラの共通処理。
 */

import { PART_SIZE_BYTES, calculatePartCount } from "@mimicast/shared";

import type { Dependencies } from "../deps.ts";
import {
  UPLOAD_TIMEOUT_ERROR_CODE,
  UPLOAD_TIMEOUT_ERROR_MESSAGE,
  isUploadTimedOut,
  withUploadTimeoutApplied,
  type VideoRecord,
} from "../domain/video.ts";
import { notFound } from "../http/errors.ts";
import type { HttpResult } from "../http/response.ts";
import type { RequestContext } from "../http/request.ts";
import { logger, toErrorFields } from "../logging/logger.ts";

export type RouteHandler = (
  ctx: RequestContext,
  deps: Dependencies,
) => Promise<HttpResult>;

/** 存在しなければ 404 を投げる。 */
export async function getRequiredVideo(
  deps: Dependencies,
  id: string,
): Promise<VideoRecord> {
  const video = await deps.videos.get(id);
  if (video === undefined) throw notFound("video not found");
  return video;
}

/**
 * パスの uploadId が保存済みの uploadId と一致することを確認する（設計 8.3）。
 *
 * この検証がないと、任意の uploadId に対する Presigned URL を発行させられる余地が生じる。
 */
export function assertUploadId(video: VideoRecord, uploadId: string): void {
  if (video.uploadId === undefined || video.uploadId !== uploadId) {
    throw notFound("upload not found");
  }
}

/** このレコードのパート数。 */
export function partCountOf(video: VideoRecord): number {
  return calculatePartCount(video.sourceSize, PART_SIZE_BYTES);
}

/**
 * UPLOADING のまま放置されたレコードを ERROR へ遷移させる（設計 7.2 の遅延評価）。
 *
 * 一覧・詳細の参照時に呼ぶ。DB 更新に失敗しても参照自体は成功させる。
 */
export async function applyUploadTimeout(
  deps: Dependencies,
  video: VideoRecord,
): Promise<VideoRecord> {
  const now = deps.now();
  if (!isUploadTimedOut(video, now)) return video;

  try {
    await deps.videos.markError(
      video.id,
      UPLOAD_TIMEOUT_ERROR_CODE,
      UPLOAD_TIMEOUT_ERROR_MESSAGE,
      now,
    );
    logger.info("upload timed out", { videoId: video.id });
  } catch (error) {
    logger.warn("failed to mark upload timeout", {
      videoId: video.id,
      ...toErrorFields(error),
    });
  }
  return withUploadTimeoutApplied(video, now);
}
