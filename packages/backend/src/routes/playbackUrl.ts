/**
 * POST /videos/{id}/playback-url（設計 13 章）
 *
 * READY かつ ENABLED の動画のみ発行できる。
 * 生成した URL は DB へ保存せず、ログにも出力しない（videoId と expiresAt のみ記録する）。
 */

import {
  validatePlaybackExpiresIn,
  type PlaybackUrlResponse,
} from "@mimicast/shared";

import { conflict, validationError } from "../http/errors.ts";
import { requirePathParam } from "../http/request.ts";
import { okResult } from "../http/response.ts";
import { logger } from "../logging/logger.ts";
import { getRequiredVideo, type RouteHandler } from "./helpers.ts";

export const createPlaybackUrl: RouteHandler = async (ctx, deps) => {
  const id = requirePathParam(ctx, "id");
  const validated = validatePlaybackExpiresIn(ctx.body);
  if (!validated.ok) throw validationError(validated.message);

  const video = await getRequiredVideo(deps, id);
  if (video.status !== "READY") {
    throw conflict("video is not READY");
  }
  if (video.distributionStatus !== "ENABLED") {
    throw conflict("distribution is disabled");
  }
  if (video.outputKey === undefined) {
    throw conflict("video has no output object");
  }

  const expiresAt = new Date(deps.now().getTime() + validated.value * 1000);
  const url = await deps.signer.sign(video.outputKey, expiresAt);

  // URL 本体は記録しない
  logger.info("playback url issued", {
    videoId: id,
    expiresAt: expiresAt.toISOString(),
  });

  const body: PlaybackUrlResponse = {
    url,
    expiresAt: expiresAt.toISOString(),
  };
  return okResult(body);
};
