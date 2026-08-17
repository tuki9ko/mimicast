/**
 * 表示用のフォーマッタ（純関数）。UI から Browser API 依存を持ち込まないために共有側へ置く。
 */

import type { VideoDto } from "./types.ts";

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** バイト数を人間可読な文字列にする（1000 進法）。 */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "-";
  if (bytes < 1000) return `${bytes} B`;

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < UNITS.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${UNITS[unitIndex]}`;
}

/**
 * 出力解像度・フレームレートの表示文字列。
 *
 * MediaConvert の完了イベントにはフレームレートが含まれないことがあるため、
 * 取得できた場合のみ付与する（例: "1080p60" / "1080p"）。
 */
export function formatOutputProfile(video: VideoDto): string {
  if (video.height === undefined) return "-";
  const base = `${video.height}p`;
  if (video.frameRate === undefined) return base;
  return `${base}${Math.round(video.frameRate)}`;
}

/** 解像度の表示文字列（例: "1920x1080"）。 */
export function formatResolution(
  width: number | undefined,
  height: number | undefined,
): string {
  if (width === undefined || height === undefined) return "-";
  return `${width}x${height}`;
}

/** ISO8601 UTC を表示用ローカル日時にする。保存側は常に UTC のままとする。 */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

/** 有効期限（秒）の表示ラベル。 */
export function formatExpiresIn(seconds: number): string {
  return `${Math.round(seconds / 3600)}時間`;
}
