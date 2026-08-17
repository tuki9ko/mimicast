/**
 * 動画レコードそのものを扱うルート。
 *
 *   POST   /videos
 *   GET    /videos
 *   GET    /videos/{id}
 *   DELETE /videos/{id}
 *   PATCH  /videos/{id}/distribution
 */

import {
  DEFAULT_PAGE_SIZE,
  validateCreateVideoInput,
  validateDistributionStatus,
  validateListQuery,
  type CreateVideoResponse,
  type ListVideosResponse,
} from "@mimicast/shared";

import {
  outputPrefixFor,
  newVideoRecord,
  sourcePrefixFor,
  toDto,
} from "../domain/video.ts";
import { validationError } from "../http/errors.ts";
import { requirePathParam } from "../http/request.ts";
import {
  createdResult,
  noContentResult,
  okResult,
} from "../http/response.ts";
import { logger, toErrorFields } from "../logging/logger.ts";
import {
  applyUploadTimeout,
  getRequiredVideo,
  type RouteHandler,
} from "./helpers.ts";

/** POST /videos */
export const createVideo: RouteHandler = async (ctx, deps) => {
  const validated = validateCreateVideoInput(ctx.body, {
    maxUploadBytes: deps.config.maxUploadBytes,
  });
  if (!validated.ok) throw validationError(validated.message);

  const record = newVideoRecord(deps.newId(), validated.value, deps.now());
  await deps.videos.create(record);

  logger.info("upload started", {
    videoId: record.id,
    size: record.sourceSize,
    filename: record.originalFilename,
  });

  const body: CreateVideoResponse = {
    id: record.id,
    status: record.status,
    sourceKey: record.sourceKey,
  };
  return createdResult(body);
};

/** GET /videos */
export const listVideos: RouteHandler = async (ctx, deps) => {
  const validated = validateListQuery(
    ctx.queryStringParameters["limit"],
    ctx.queryStringParameters["cursor"],
    DEFAULT_PAGE_SIZE,
  );
  if (!validated.ok) throw validationError(validated.message);

  const page = await deps.videos.list(validated.value);
  const items = await Promise.all(
    page.items.map((video) => applyUploadTimeout(deps, video)),
  );

  const body: ListVideosResponse = {
    items: items.map(toDto),
    nextCursor: page.nextCursor,
  };
  return okResult(body);
};

/** GET /videos/{id} */
export const getVideo: RouteHandler = async (ctx, deps) => {
  const id = requirePathParam(ctx, "id");
  const video = await applyUploadTimeout(deps, await getRequiredVideo(deps, id));
  return okResult(toDto(video));
};

/**
 * DELETE /videos/{id}
 *
 * どの状態からでも削除できる（FR-071）。状態に応じた後始末を先に行う。
 */
export const deleteVideo: RouteHandler = async (ctx, deps) => {
  const id = requirePathParam(ctx, "id");
  const previous = await deps.videos.markDeleting(id, deps.now());

  if (previous.status === "UPLOADING" && previous.uploadId !== undefined) {
    // すでに中止済み・完了済みでも削除は続行する
    try {
      await deps.storage.abortMultipartUpload(
        previous.sourceKey,
        previous.uploadId,
      );
    } catch (error) {
      logger.warn("failed to abort multipart upload", {
        videoId: id,
        ...toErrorFields(error),
      });
    }
  }

  if (
    previous.status === "TRANSCODING" &&
    previous.mediaConvertJobId !== undefined
  ) {
    try {
      await deps.transcoder.cancelJob(previous.mediaConvertJobId);
    } catch (error) {
      logger.warn("failed to cancel mediaconvert job", {
        videoId: id,
        jobId: previous.mediaConvertJobId,
        ...toErrorFields(error),
      });
    }
  }

  await deps.storage.deletePrefix(sourcePrefixFor(id));
  await deps.storage.deletePrefix(outputPrefixFor(id));
  await deps.videos.remove(id);

  logger.info("video deleted", { videoId: id, statusBefore: previous.status });
  return noContentResult();
};

/**
 * PATCH /videos/{id}/distribution
 *
 * READY でない動画を ENABLED にすることは許可する（URL 発行時に改めて判定する）。
 */
export const updateDistribution: RouteHandler = async (ctx, deps) => {
  const id = requirePathParam(ctx, "id");
  const validated = validateDistributionStatus(ctx.body);
  if (!validated.ok) throw validationError(validated.message);

  // 存在確認（条件式だけだと 404 と 409 を区別できない）
  await getRequiredVideo(deps, id);
  const updated = await deps.videos.setDistributionStatus(
    id,
    validated.value,
    deps.now(),
  );

  logger.info("distribution status changed", {
    videoId: id,
    distributionStatus: validated.value,
  });
  return okResult(toDto(updated));
};
