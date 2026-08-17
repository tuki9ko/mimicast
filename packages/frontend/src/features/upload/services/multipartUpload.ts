/**
 * ブラウザ → S3 の Multipart Upload。
 *
 * 動画本体は API サーバー / Lambda を経由させない。
 * バックエンドから受け取った Presigned URL に対して直接 PUT する。
 *
 * React へ依存しないため、Astro 等へ移行しても再利用できる。
 */

import {
  MAX_PART_NUMBERS_PER_REQUEST,
  UPLOAD_CONCURRENCY,
  canonicalContentType,
  extensionOf,
  isAcceptableContentType,
  isAllowedExtension,
  type CompletedPart,
  type VideoDto,
} from "@mimicast/shared";

import * as uploadsApi from "../../../lib/api/uploads.ts";
import * as videosApi from "../../../lib/api/videos.ts";
import { AbortedError, putWithProgress } from "../../../lib/browser/http.ts";
import type { VideoResolution } from "../../../lib/media/probe.ts";

export interface UploadProgress {
  loadedBytes: number;
  totalBytes: number;
  /** 0-100 */
  percent: number;
}

export interface UploadHandle {
  videoId: string;
  uploadId: string;
}

export interface UploadCallbacks {
  onVideoCreated?: (videoId: string) => void;
  onUploadCreated?: (handle: UploadHandle) => void;
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadRequest {
  file: File;
  title: string;
  /** ブラウザで取得できなかった場合は null */
  resolution: VideoResolution | null;
}

const PART_RETRY_COUNT = 2;

/**
 * ブラウザが返す MIME タイプは環境差があるため、拡張子から正規の値を決める。
 * （.mkv や .mxf では空文字になることがある）
 */
export function resolveContentType(file: File): string {
  const extension = extensionOf(file.name);
  if (extension === null || !isAllowedExtension(extension)) {
    return file.type;
  }
  if (file.type !== "" && isAcceptableContentType(extension, file.type)) {
    return file.type;
  }
  return canonicalContentType(extension);
}

export async function uploadVideo(
  request: UploadRequest,
  callbacks: UploadCallbacks = {},
  signal?: AbortSignal,
): Promise<VideoDto> {
  const { file, title, resolution } = request;

  const created = await videosApi.createVideo({
    title,
    filename: file.name,
    contentType: resolveContentType(file),
    size: file.size,
    sourceWidth: resolution?.width ?? null,
    sourceHeight: resolution?.height ?? null,
  });
  callbacks.onVideoCreated?.(created.id);

  const upload = await uploadsApi.createUpload(created.id);
  callbacks.onUploadCreated?.({
    videoId: created.id,
    uploadId: upload.uploadId,
  });

  const loadedByPart = new Map<number, number>();
  const reportProgress = () => {
    let loadedBytes = 0;
    for (const loaded of loadedByPart.values()) loadedBytes += loaded;
    callbacks.onProgress?.({
      loadedBytes,
      totalBytes: file.size,
      percent: file.size === 0 ? 0 : Math.floor((loadedBytes / file.size) * 100),
    });
  };

  const completedParts: CompletedPart[] = [];

  // Presigned URL の発行は 1 リクエスト 100 パートまで。
  // バッチごとに発行することで、長時間アップロードでも URL の期限切れを避けられる。
  for (
    let start = 1;
    start <= upload.partCount;
    start += MAX_PART_NUMBERS_PER_REQUEST
  ) {
    throwIfAborted(signal);

    const partNumbers = rangeOf(
      start,
      Math.min(start + MAX_PART_NUMBERS_PER_REQUEST - 1, upload.partCount),
    );
    const { urls } = await uploadsApi.createPartUrls(
      created.id,
      upload.uploadId,
      partNumbers,
    );

    const results = await runWithConcurrency(
      urls,
      UPLOAD_CONCURRENCY,
      async ({ partNumber, url }) => {
        const body = sliceForPart(file, partNumber, upload.partSize);
        const etag = await uploadPartWithRetry(
          {
            videoId: created.id,
            uploadId: upload.uploadId,
            partNumber,
            url,
            body,
          },
          (loaded) => {
            loadedByPart.set(partNumber, loaded);
            reportProgress();
          },
          signal,
        );
        // 完了時は必ずパート全体が送信済み
        loadedByPart.set(partNumber, body.size);
        reportProgress();
        return { partNumber, etag };
      },
    );

    completedParts.push(...results);
  }

  throwIfAborted(signal);

  completedParts.sort((a, b) => a.partNumber - b.partNumber);
  return uploadsApi.completeUpload(
    created.id,
    upload.uploadId,
    completedParts,
  );
}

interface UploadPartInput {
  videoId: string;
  uploadId: string;
  partNumber: number;
  url: string;
  body: Blob;
}

async function uploadPartWithRetry(
  input: UploadPartInput,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  let url = input.url;
  let lastError: unknown;

  for (let attempt = 0; attempt <= PART_RETRY_COUNT; attempt += 1) {
    try {
      const result = await putWithProgress({
        url,
        body: input.body,
        onProgress,
        ...(signal === undefined ? {} : { signal }),
      });
      return result.etag;
    } catch (error) {
      if (error instanceof AbortedError) throw error;
      lastError = error;
      onProgress(0);

      // Presigned URL の期限切れの可能性があるため、再発行して試す
      const reissued = await uploadsApi.createPartUrls(
        input.videoId,
        input.uploadId,
        [input.partNumber],
      );
      const next = reissued.urls[0];
      if (next === undefined) break;
      url = next.url;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`failed to upload part ${input.partNumber}`);
}

function sliceForPart(file: File, partNumber: number, partSize: number): Blob {
  const start = (partNumber - 1) * partSize;
  return file.slice(start, Math.min(start + partSize, file.size));
}

function rangeOf(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new AbortedError();
}

/** 同時実行数を制限しながら順に処理する。 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (item === undefined) return;
        results[index] = await worker(item);
      }
    },
  );

  await Promise.all(runners);
  return results;
}
