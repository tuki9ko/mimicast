/**
 * Multipart Upload 関連のルート（設計 8.3）。
 *
 *   POST   /videos/{id}/uploads
 *   POST   /videos/{id}/uploads/{uploadId}/parts
 *   POST   /videos/{id}/uploads/{uploadId}/complete
 *   DELETE /videos/{id}/uploads/{uploadId}
 *
 * 動画本体は Lambda を経由しない。ブラウザが Presigned URL で直接 S3 へ送る。
 */

import {
  PART_SIZE_BYTES,
  PRESIGNED_URL_EXPIRES_SECONDS,
  validateCompletedParts,
  validatePartNumbers,
  type CreatePartUrlsResponse,
  type CreateUploadResponse,
} from "@mimicast/shared";

import {
  outputDestinationFor,
  sourcePrefixFor,
  toDto,
} from "../domain/video.ts";
import { AppError, conflict, validationError } from "../http/errors.ts";
import { requirePathParam } from "../http/request.ts";
import { noContentResult, okResult } from "../http/response.ts";
import { logger, toErrorFields } from "../logging/logger.ts";
import { s3Uri } from "../services/mediaConvertJob.ts";
import {
  assertUploadId,
  getRequiredVideo,
  partCountOf,
  type RouteHandler,
} from "./helpers.ts";

/** POST /videos/{id}/uploads */
export const createUpload: RouteHandler = async (ctx, deps) => {
  const id = requirePathParam(ctx, "id");
  const video = await getRequiredVideo(deps, id);

  if (video.status !== "UPLOADING") {
    throw conflict("video is not in UPLOADING state");
  }

  // 再開時など、古い Multipart Upload が残っている場合は破棄してから作り直す
  if (video.uploadId !== undefined) {
    try {
      await deps.storage.abortMultipartUpload(video.sourceKey, video.uploadId);
    } catch (error) {
      logger.warn("failed to abort stale multipart upload", {
        videoId: id,
        ...toErrorFields(error),
      });
    }
  }

  const uploadId = await deps.storage.createMultipartUpload(
    video.sourceKey,
    video.sourceContentType,
  );
  await deps.videos.setUploadId(id, uploadId, deps.now());

  const body: CreateUploadResponse = {
    uploadId,
    partSize: PART_SIZE_BYTES,
    partCount: partCountOf(video),
  };
  logger.info("multipart upload created", {
    videoId: id,
    partCount: body.partCount,
  });
  return okResult(body);
};

/** POST /videos/{id}/uploads/{uploadId}/parts */
export const createPartUrls: RouteHandler = async (ctx, deps) => {
  const id = requirePathParam(ctx, "id");
  const uploadId = requirePathParam(ctx, "uploadId");
  const video = await getRequiredVideo(deps, id);
  assertUploadId(video, uploadId);

  const validated = validatePartNumbers(ctx.body, partCountOf(video));
  if (!validated.ok) throw validationError(validated.message);

  const expiresAt = new Date(
    deps.now().getTime() + PRESIGNED_URL_EXPIRES_SECONDS * 1000,
  ).toISOString();

  const urls = await Promise.all(
    validated.value.map(async (partNumber) => ({
      partNumber,
      url: await deps.storage.presignUploadPart(
        video.sourceKey,
        uploadId,
        partNumber,
        PRESIGNED_URL_EXPIRES_SECONDS,
      ),
      expiresAt,
    })),
  );

  const body: CreatePartUrlsResponse = { urls };
  return okResult(body);
};

/** POST /videos/{id}/uploads/{uploadId}/complete */
export const completeUpload: RouteHandler = async (ctx, deps) => {
  const id = requirePathParam(ctx, "id");
  const uploadId = requirePathParam(ctx, "uploadId");
  const video = await getRequiredVideo(deps, id);
  assertUploadId(video, uploadId);

  const partCount = partCountOf(video);
  const validated = validateCompletedParts(ctx.body, partCount);
  if (!validated.ok) throw validationError(validated.message);

  await deps.storage.completeMultipartUpload(
    video.sourceKey,
    uploadId,
    validated.value,
  );
  await deps.videos.markUploaded(id, deps.now());
  logger.info("upload completed", { videoId: id, partCount });

  try {
    const jobId = await deps.transcoder.createJob({
      videoId: id,
      inputUri: s3Uri(deps.config.mediaBucket, video.sourceKey),
      destinationUri: s3Uri(deps.config.mediaBucket, outputDestinationFor(id)),
      ...(video.sourceWidth !== undefined && video.sourceHeight !== undefined
        ? { sourceWidth: video.sourceWidth, sourceHeight: video.sourceHeight }
        : {}),
    });
    await deps.videos.markTranscoding(id, jobId, deps.now());
    logger.info("mediaconvert job created", { videoId: id, jobId });
  } catch (error) {
    logger.error("failed to start transcoding", {
      videoId: id,
      ...toErrorFields(error),
    });
    await deps.videos.markError(
      id,
      "TRANSCODE_START_FAILED",
      error instanceof Error ? error.message : "failed to start transcoding",
      deps.now(),
    );
    throw new AppError(
      500,
      "TRANSCODE_START_FAILED",
      "failed to start transcoding",
    );
  }

  const updated = await getRequiredVideo(deps, id);
  return okResult(toDto(updated));
};

/** DELETE /videos/{id}/uploads/{uploadId} */
export const abortUpload: RouteHandler = async (ctx, deps) => {
  const id = requirePathParam(ctx, "id");
  const uploadId = requirePathParam(ctx, "uploadId");
  const video = await getRequiredVideo(deps, id);
  assertUploadId(video, uploadId);

  await deps.storage.abortMultipartUpload(video.sourceKey, uploadId);
  await deps.storage.deletePrefix(sourcePrefixFor(id));
  await deps.videos.remove(id);

  logger.info("upload aborted", { videoId: id });
  return noContentResult();
};
