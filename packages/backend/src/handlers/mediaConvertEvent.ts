/**
 * MediaConvert 完了・失敗イベントを受け取り、動画レコードの状態を更新する。
 *
 * 処理に失敗した場合は例外を投げ、EventBridge のリトライ → DLQ へ流す。
 * イベントを取りこぼすと動画が TRANSCODING のまま復旧できなくなるため。
 */

import type { EventBridgeEvent } from "aws-lambda";

import { getEventConfig } from "../config/env.ts";
import {
  extractErrorInfo,
  extractOutputInfo,
  videoIdOf,
  type MediaConvertEventDetail,
} from "../domain/mediaConvertEvent.ts";
import { outputKeyFor } from "../domain/video.ts";
import { logger } from "../logging/logger.ts";
import { createMediaStorage, type MediaStorage } from "../services/mediaStorage.ts";
import {
  createVideoRepository,
  type ReadyOutput,
  type VideoRepository,
} from "../repositories/videoRepository.ts";

export interface EventDependencies {
  videos: VideoRepository;
  storage: MediaStorage;
  now: () => Date;
}

let dependencies: EventDependencies | undefined;

function getDependencies(): EventDependencies {
  if (dependencies === undefined) {
    const config = getEventConfig();
    dependencies = {
      videos: createVideoRepository(config.tableName),
      storage: createMediaStorage(config.mediaBucket),
      now: () => new Date(),
    };
  }
  return dependencies;
}

export type MediaConvertStateChangeEvent = EventBridgeEvent<
  "MediaConvert Job State Change",
  MediaConvertEventDetail
>;

export async function handler(
  event: MediaConvertStateChangeEvent,
): Promise<void> {
  await handleEvent(event, getDependencies());
}

export async function handleEvent(
  event: MediaConvertStateChangeEvent,
  deps: EventDependencies,
): Promise<void> {
  const detail = event.detail;
  const jobId = detail.jobId ?? "-";
  const videoId = videoIdOf(detail);

  if (videoId === undefined) {
    // UserMetadata を持たないジョブ（本システム以外が作成したもの）。
    // リトライしても解決しないため、記録だけして終了する。
    logger.error("mediaconvert event without videoId", {
      jobId,
      status: detail.status,
    });
    return;
  }

  if (detail.status === "COMPLETE") {
    await handleComplete(videoId, jobId, detail, deps);
    return;
  }

  if (detail.status === "ERROR") {
    await handleError(videoId, jobId, detail, deps);
    return;
  }

  logger.warn("unexpected mediaconvert status", {
    videoId,
    jobId,
    status: detail.status,
  });
}

async function handleComplete(
  videoId: string,
  jobId: string,
  detail: MediaConvertEventDetail,
  deps: EventDependencies,
): Promise<void> {
  const outputKey = outputKeyFor(videoId);
  const info = extractOutputInfo(detail);

  // 完了イベントには出力ファイルサイズが含まれないため HeadObject で取得する
  const outputSize = await deps.storage.headObjectSize(outputKey);
  if (outputSize === undefined) {
    logger.warn("output object not found", { videoId, jobId, outputKey });
  }

  const output: ReadyOutput = { outputKey, ...info };
  if (outputSize !== undefined) output.outputSize = outputSize;

  const updated = await deps.videos.markReady(videoId, output, deps.now());
  if (!updated) {
    // 削除処理と競合した場合など。DELETING のレコードを READY へ戻さない。
    logger.warn("video was not in TRANSCODING state", { videoId, jobId });
    return;
  }

  logger.info("mediaconvert job completed", {
    videoId,
    jobId,
    outputSize,
    width: info.width,
    height: info.height,
  });
}

async function handleError(
  videoId: string,
  jobId: string,
  detail: MediaConvertEventDetail,
  deps: EventDependencies,
): Promise<void> {
  const { errorCode, errorMessage } = extractErrorInfo(detail);
  const updated = await deps.videos.markError(
    videoId,
    errorCode,
    errorMessage,
    deps.now(),
  );
  if (!updated) {
    logger.warn("video was already deleted", { videoId, jobId });
    return;
  }

  logger.error("mediaconvert job failed", {
    videoId,
    jobId,
    errorCode,
    errorMessage,
  });
}
