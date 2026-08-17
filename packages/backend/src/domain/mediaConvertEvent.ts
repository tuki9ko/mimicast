/**
 * MediaConvert Job State Change イベントの解釈（純関数）。
 *
 * 完了イベントには出力ファイルサイズが含まれないため、サイズは別途 HeadObject で取得する。
 */

export interface MediaConvertEventDetail {
  status?: string;
  jobId?: string;
  userMetadata?: Record<string, string>;
  errorCode?: number | string;
  errorMessage?: string;
  outputGroupDetails?: {
    outputDetails?: {
      durationInMs?: number;
      videoDetails?: {
        widthInPx?: number;
        heightInPx?: number;
        averageFrameRate?: number;
        frameRate?: number;
      };
    }[];
  }[];
}

export interface CompletedOutputInfo {
  width?: number;
  height?: number;
  frameRate?: number;
}

/** ジョブに紐づく videoId（UserMetadata から取得する）。 */
export function videoIdOf(detail: MediaConvertEventDetail): string | undefined {
  const videoId = detail.userMetadata?.["videoId"];
  return videoId === undefined || videoId === "" ? undefined : videoId;
}

/**
 * 完了イベントから出力メタデータを取り出す。
 *
 * フレームレートはイベントに含まれないことがあるため、取得できた場合のみ返す。
 */
export function extractOutputInfo(
  detail: MediaConvertEventDetail,
): CompletedOutputInfo {
  const videoDetails =
    detail.outputGroupDetails?.[0]?.outputDetails?.[0]?.videoDetails;
  if (videoDetails === undefined) return {};

  const info: CompletedOutputInfo = {};
  if (isPositiveNumber(videoDetails.widthInPx)) {
    info.width = videoDetails.widthInPx;
  }
  if (isPositiveNumber(videoDetails.heightInPx)) {
    info.height = videoDetails.heightInPx;
  }
  const frameRate = videoDetails.averageFrameRate ?? videoDetails.frameRate;
  if (isPositiveNumber(frameRate)) {
    info.frameRate = Math.round(frameRate * 100) / 100;
  }
  return info;
}

/** エラーイベントのコード・メッセージを文字列へ正規化する。 */
export function extractErrorInfo(detail: MediaConvertEventDetail): {
  errorCode: string;
  errorMessage: string;
} {
  return {
    errorCode:
      detail.errorCode === undefined ? "UNKNOWN" : String(detail.errorCode),
    errorMessage: detail.errorMessage ?? "MediaConvert job failed",
  };
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
