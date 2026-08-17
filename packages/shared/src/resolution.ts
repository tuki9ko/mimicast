/**
 * 出力解像度の決定ロジック。
 *
 * MediaConvert には「上限を超えた場合のみ縮小する」設定が存在せず、
 * 出力へ width / height を指定すると低解像度の入力も拡大されてしまう。
 * そのため CreateJob 時にこのロジックで出力設定を組み立てる。
 */

import { MAX_OUTPUT_HEIGHT, MAX_OUTPUT_WIDTH } from "./constants.ts";

export interface OutputResolution {
  width: number;
  height: number;
}

/** H.264 4:2:0 は幅・高さが偶数である必要があるため、必ず偶数へ丸める。 */
export function toEven(n: number): number {
  return n % 2 === 0 ? n : n - 1;
}

/**
 * 出力解像度を決定する。
 *
 * - 1080p 以下: `undefined`（解像度を指定せず入力へ追従＝アップスケールしない）
 * - 1080p 超 / 解像度不明: アスペクト比を維持して 1920x1080 に収める
 */
export function resolveOutputResolution(
  sourceWidth?: number,
  sourceHeight?: number,
): OutputResolution | undefined {
  // 不明な場合は 1080p へ収める既定動作
  if (!sourceWidth || !sourceHeight) {
    return { width: MAX_OUTPUT_WIDTH, height: MAX_OUTPUT_HEIGHT };
  }

  // 1080p 以下はアップスケールしない → 解像度を指定せず入力へ追従
  if (sourceWidth <= MAX_OUTPUT_WIDTH && sourceHeight <= MAX_OUTPUT_HEIGHT) {
    return undefined;
  }

  // アスペクト比を維持して 1920x1080 に収める
  const scale = Math.min(
    MAX_OUTPUT_WIDTH / sourceWidth,
    MAX_OUTPUT_HEIGHT / sourceHeight,
  );
  return {
    width: Math.max(2, toEven(Math.round(sourceWidth * scale))),
    height: Math.max(2, toEven(Math.round(sourceHeight * scale))),
  };
}
