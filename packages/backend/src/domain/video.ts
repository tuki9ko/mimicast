/**
 * Video ドメインモデル。
 *
 * S3 キーの組み立てもここへ集約する（元動画のファイル名を S3 キーへ利用しない）。
 */

import {
  UPLOADING_TIMEOUT_MS,
  VIDEO_GSI1PK,
  type NormalizedCreateVideoInput,
  type VideoDto,
} from "@mimicast/shared";

/** DynamoDB へ保存する項目。DTO に内部管理用の属性を足したもの。 */
export interface VideoRecord extends VideoDto {
  gsi1pk: string;
  /** = createdAt */
  gsi1sk: string;
  /** 進行中の Multipart Upload。完了・中止時に削除する */
  uploadId?: string;
  mediaConvertJobId?: string;
}

const INTERNAL_KEYS = [
  "gsi1pk",
  "gsi1sk",
  "uploadId",
  "mediaConvertJobId",
] as const;

/** API レスポンス用に内部属性を落とす。 */
export function toDto(record: VideoRecord): VideoDto {
  const dto = { ...record } as Record<string, unknown>;
  for (const key of INTERNAL_KEYS) delete dto[key];
  return dto as unknown as VideoDto;
}

/** 元動画の S3 キー。拡張子のみを利用し、元ファイル名は使わない。 */
export function sourceKeyFor(id: string, extension: string): string {
  return `source/${id}/source${extension}`;
}

/** 配信用オブジェクトの S3 キー。CloudFront のパスと 1 対 1 で対応する。 */
export function outputKeyFor(id: string): string {
  return `videos/${id}/video.mp4`;
}

/** MediaConvert の出力先（拡張子はコンテナから自動決定されるため付けない）。 */
export function outputDestinationFor(id: string): string {
  return `videos/${id}/video`;
}

export function sourcePrefixFor(id: string): string {
  return `source/${id}/`;
}

export function outputPrefixFor(id: string): string {
  return `videos/${id}/`;
}

/** 新規レコードを作る。配信許可は必ず DISABLED から始める。 */
export function newVideoRecord(
  id: string,
  input: NormalizedCreateVideoInput,
  now: Date,
): VideoRecord {
  const timestamp = now.toISOString();
  const record: VideoRecord = {
    id,
    gsi1pk: VIDEO_GSI1PK,
    gsi1sk: timestamp,
    title: input.title,
    originalFilename: input.filename,
    status: "UPLOADING",
    distributionStatus: "DISABLED",
    sourceKey: sourceKeyFor(id, input.extension),
    sourceContentType: input.contentType,
    sourceSize: input.size,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (input.sourceWidth !== undefined && input.sourceHeight !== undefined) {
    record.sourceWidth = input.sourceWidth;
    record.sourceHeight = input.sourceHeight;
  }
  return record;
}

/**
 * UPLOADING のまま放置されたレコードか判定する。
 *
 * MVP では定期バッチを設けず、参照時の遅延評価で ERROR へ遷移させる。
 */
export function isUploadTimedOut(record: VideoRecord, now: Date): boolean {
  if (record.status !== "UPLOADING") return false;
  const updatedAt = Date.parse(record.updatedAt);
  if (Number.isNaN(updatedAt)) return false;
  return now.getTime() - updatedAt > UPLOADING_TIMEOUT_MS;
}

export const UPLOAD_TIMEOUT_ERROR_CODE = "UPLOAD_TIMEOUT";
export const UPLOAD_TIMEOUT_ERROR_MESSAGE =
  "upload did not complete within 24 hours";

/** タイムアウト判定を反映したレコードを返す（DB 更新は呼び出し側で行う）。 */
export function withUploadTimeoutApplied(
  record: VideoRecord,
  now: Date,
): VideoRecord {
  if (!isUploadTimedOut(record, now)) return record;
  return {
    ...record,
    status: "ERROR",
    errorCode: UPLOAD_TIMEOUT_ERROR_CODE,
    errorMessage: UPLOAD_TIMEOUT_ERROR_MESSAGE,
    updatedAt: now.toISOString(),
  };
}
