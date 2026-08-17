/**
 * Frontend / Backend 共有の定数。
 *
 * 要件定義 FR-011 / FR-053、設計 8.3 / 13 に対応する。
 */

/**
 * アップロードを許可する拡張子と、それぞれに対して許容する Content-Type。
 *
 * ブラウザが返す MIME タイプは環境差があるため、拡張子ごとに複数の別名を許容する。
 * 先頭の要素を「正規の Content-Type」として扱う（S3 へ渡す値）。
 */
export const ALLOWED_EXTENSIONS = {
  ".mp4": ["video/mp4"],
  ".m4v": ["video/x-m4v", "video/mp4"],
  ".mov": ["video/quicktime"],
  ".mkv": ["video/x-matroska", "video/matroska"],
  ".mxf": ["application/mxf", "application/octet-stream"],
  ".webm": ["video/webm"],
} as const satisfies Record<string, readonly string[]>;

export type AllowedExtension = keyof typeof ALLOWED_EXTENSIONS;

export const ALLOWED_EXTENSION_LIST = Object.keys(
  ALLOWED_EXTENSIONS,
) as AllowedExtension[];

/** title の最大長（トリム後）。 */
export const TITLE_MAX_LENGTH = 100;

/** filename の最大長。 */
export const FILENAME_MAX_LENGTH = 255;

/** アップロードサイズ上限の既定値（64 GiB）。実際の上限は MAX_UPLOAD_BYTES で上書きする。 */
export const DEFAULT_MAX_UPLOAD_BYTES = 64 * 1024 * 1024 * 1024;

/** Multipart Upload の 1 パートサイズ（64 MiB）。 */
export const PART_SIZE_BYTES = 64 * 1024 * 1024;

/** S3 Multipart Upload のパート数上限。 */
export const MAX_MULTIPART_PARTS = 10_000;

/** 1 リクエストで発行できる Presigned Part URL の上限。 */
export const MAX_PART_NUMBERS_PER_REQUEST = 100;

/** ブラウザからの同時アップロード数。 */
export const UPLOAD_CONCURRENCY = 4;

/** Presigned URL の有効期限（6 時間）。 */
export const PRESIGNED_URL_EXPIRES_SECONDS = 6 * 60 * 60;

/** Signed URL の有効期限として選択できる値（秒）。 */
export const PLAYBACK_EXPIRES_OPTIONS = [3600, 10800, 21600, 86400] as const;

export type PlaybackExpiresIn = (typeof PLAYBACK_EXPIRES_OPTIONS)[number];

/** Signed URL の既定有効期限（3 時間）。 */
export const DEFAULT_PLAYBACK_EXPIRES_IN: PlaybackExpiresIn = 10800;

/** 一覧の既定取得件数。 */
export const DEFAULT_PAGE_SIZE = 50;

/** 一覧の最大取得件数。 */
export const MAX_PAGE_SIZE = 100;

/** UPLOADING のまま放置されたレコードを ERROR とみなすまでの時間（24 時間）。 */
export const UPLOADING_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** 出力解像度の上限。 */
export const MAX_OUTPUT_WIDTH = 1920;
export const MAX_OUTPUT_HEIGHT = 1080;

/** DynamoDB GSI1 のパーティションキー固定値。 */
export const VIDEO_GSI1PK = "VIDEO";
