/**
 * Frontend / Backend 共有のバリデーション。
 *
 * サーバー側の検証は必須であり、クライアント側検証のみに依存してはならない。
 * 同じ実装を両方から呼び出すことで、判定のズレを防ぐ。
 */

import {
  ALLOWED_EXTENSIONS,
  ALLOWED_EXTENSION_LIST,
  DEFAULT_MAX_UPLOAD_BYTES,
  FILENAME_MAX_LENGTH,
  MAX_PART_NUMBERS_PER_REQUEST,
  MAX_PAGE_SIZE,
  MAX_MULTIPART_PARTS,
  PLAYBACK_EXPIRES_OPTIONS,
  TITLE_MAX_LENGTH,
  type AllowedExtension,
  type PlaybackExpiresIn,
} from "./constants.ts";
import type { DistributionStatus } from "./types.ts";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const ok = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
const ng = <T>(message: string): ValidationResult<T> => ({
  ok: false,
  message,
});

/** 制御文字（C0 / DEL / C1）を含むか。 */
export function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F-\u009F]/.test(value);
}

/** ファイル名から小文字の拡張子を取り出す。取れない場合は null。 */
export function extensionOf(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return null;
  return filename.slice(dot).toLowerCase();
}

export function isAllowedExtension(ext: string): ext is AllowedExtension {
  return Object.prototype.hasOwnProperty.call(ALLOWED_EXTENSIONS, ext);
}

/** 拡張子に対応する正規の Content-Type（S3 へ設定する値）。 */
export function canonicalContentType(ext: AllowedExtension): string {
  return ALLOWED_EXTENSIONS[ext][0];
}

/** 拡張子に対して許容される Content-Type か。 */
export function isAcceptableContentType(
  ext: AllowedExtension,
  contentType: string,
): boolean {
  const allowed: readonly string[] = ALLOWED_EXTENSIONS[ext];
  return allowed.includes(contentType.toLowerCase());
}

/** バリデーション済みかつ正規化された動画作成入力。 */
export interface NormalizedCreateVideoInput {
  title: string;
  filename: string;
  extension: AllowedExtension;
  /** 拡張子から決まる正規の Content-Type */
  contentType: string;
  size: number;
  sourceWidth?: number;
  sourceHeight?: number;
}

interface CreateVideoValidationOptions {
  maxUploadBytes?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalDimension(
  value: unknown,
  field: string,
): ValidationResult<number | undefined> {
  if (value === undefined || value === null) return ok(undefined);
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 16384
  ) {
    return ng(`${field} must be a positive integer or null`);
  }
  return ok(value);
}

/**
 * POST /videos の入力を検証する。
 */
export function validateCreateVideoInput(
  input: unknown,
  options: CreateVideoValidationOptions = {},
): ValidationResult<NormalizedCreateVideoInput> {
  const maxUploadBytes = options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;

  if (!isPlainObject(input)) return ng("request body must be an object");

  if (typeof input.title !== "string") return ng("title is required");
  const title = input.title.trim();
  if (title.length < 1 || title.length > TITLE_MAX_LENGTH) {
    return ng(`title must be 1-${TITLE_MAX_LENGTH} characters`);
  }
  if (hasControlCharacters(title)) {
    return ng("title must not contain control characters");
  }

  if (typeof input.filename !== "string") return ng("filename is required");
  const filename = input.filename;
  if (filename.length < 1 || filename.length > FILENAME_MAX_LENGTH) {
    return ng(`filename must be 1-${FILENAME_MAX_LENGTH} characters`);
  }
  if (hasControlCharacters(filename)) {
    return ng("filename must not contain control characters");
  }
  if (filename.includes("/") || filename.includes("\\")) {
    return ng("filename must not contain path separators");
  }

  const extension = extensionOf(filename);
  if (extension === null || !isAllowedExtension(extension)) {
    return ng(
      `filename extension must be one of ${ALLOWED_EXTENSION_LIST.join(", ")}`,
    );
  }

  if (typeof input.contentType !== "string") {
    return ng("contentType is required");
  }
  if (!isAcceptableContentType(extension, input.contentType)) {
    return ng(`contentType is not acceptable for ${extension}`);
  }

  if (
    typeof input.size !== "number" ||
    !Number.isInteger(input.size) ||
    input.size < 1
  ) {
    return ng("size must be a positive integer");
  }
  if (input.size > maxUploadBytes) {
    return ng(`size exceeds the limit (${maxUploadBytes} bytes)`);
  }

  const width = optionalDimension(input.sourceWidth, "sourceWidth");
  if (!width.ok) return ng(width.message);
  const height = optionalDimension(input.sourceHeight, "sourceHeight");
  if (!height.ok) return ng(height.message);

  const value: NormalizedCreateVideoInput = {
    title,
    filename,
    extension,
    contentType: canonicalContentType(extension),
    size: input.size,
  };
  // 片方しか取得できていない場合は、解像度不明として両方落とす。
  if (width.value !== undefined && height.value !== undefined) {
    value.sourceWidth = width.value;
    value.sourceHeight = height.value;
  }
  return ok(value);
}

/** アップロードサイズとパートサイズからパート数を求める。 */
export function calculatePartCount(size: number, partSize: number): number {
  return Math.ceil(size / partSize);
}

/** POST /videos/{id}/uploads/{uploadId}/parts の入力を検証する。 */
export function validatePartNumbers(
  input: unknown,
  partCount: number,
): ValidationResult<number[]> {
  if (!isPlainObject(input)) return ng("request body must be an object");
  const { partNumbers } = input;
  if (!Array.isArray(partNumbers) || partNumbers.length === 0) {
    return ng("partNumbers must be a non-empty array");
  }
  if (partNumbers.length > MAX_PART_NUMBERS_PER_REQUEST) {
    return ng(`partNumbers must contain at most ${MAX_PART_NUMBERS_PER_REQUEST} items`);
  }

  const seen = new Set<number>();
  for (const partNumber of partNumbers) {
    if (
      typeof partNumber !== "number" ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > MAX_MULTIPART_PARTS
    ) {
      return ng("partNumbers must contain integers within 1-10000");
    }
    if (partNumber > partCount) {
      return ng(`partNumber ${partNumber} exceeds partCount ${partCount}`);
    }
    if (seen.has(partNumber)) return ng("partNumbers must be unique");
    seen.add(partNumber);
  }
  return ok([...seen].sort((a, b) => a - b));
}

/** POST /videos/{id}/uploads/{uploadId}/complete の入力を検証する。 */
export function validateCompletedParts(
  input: unknown,
  partCount: number,
): ValidationResult<{ partNumber: number; etag: string }[]> {
  if (!isPlainObject(input)) return ng("request body must be an object");
  const { parts } = input;
  if (!Array.isArray(parts) || parts.length === 0) {
    return ng("parts must be a non-empty array");
  }
  if (parts.length !== partCount) {
    return ng(`parts must contain exactly ${partCount} items`);
  }

  const normalized: { partNumber: number; etag: string }[] = [];
  for (const part of parts) {
    if (!isPlainObject(part)) return ng("parts must contain objects");
    const { partNumber, etag } = part;
    if (
      typeof partNumber !== "number" ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > partCount
    ) {
      return ng("parts[].partNumber is invalid");
    }
    if (typeof etag !== "string" || etag.length === 0 || etag.length > 256) {
      return ng("parts[].etag is invalid");
    }
    normalized.push({ partNumber, etag });
  }

  normalized.sort((a, b) => a.partNumber - b.partNumber);
  // S3 は昇順かつ欠番のないパート一覧を要求する。
  for (const [index, part] of normalized.entries()) {
    if (part.partNumber !== index + 1) {
      return ng("parts must cover partNumber 1..partCount without gaps");
    }
  }
  return ok(normalized);
}

/** PATCH /videos/{id}/distribution の入力を検証する。 */
export function validateDistributionStatus(
  input: unknown,
): ValidationResult<DistributionStatus> {
  if (!isPlainObject(input)) return ng("request body must be an object");
  const value = input.distributionStatus;
  if (value !== "ENABLED" && value !== "DISABLED") {
    return ng("distributionStatus must be ENABLED or DISABLED");
  }
  return ok(value);
}

/** POST /videos/{id}/playback-url の入力を検証する。 */
export function validatePlaybackExpiresIn(
  input: unknown,
): ValidationResult<PlaybackExpiresIn> {
  if (!isPlainObject(input)) return ng("request body must be an object");
  const value = input.expiresIn;
  const allowed: readonly number[] = PLAYBACK_EXPIRES_OPTIONS;
  if (typeof value !== "number" || !allowed.includes(value)) {
    return ng(`expiresIn must be one of ${PLAYBACK_EXPIRES_OPTIONS.join(", ")}`);
  }
  return ok(value as PlaybackExpiresIn);
}

/** GET /videos のページングパラメータを検証する。 */
export function validateListQuery(
  limitRaw: string | undefined,
  cursorRaw: string | undefined,
  defaultLimit: number,
): ValidationResult<{ limit: number; cursor?: string }> {
  let limit = defaultLimit;
  if (limitRaw !== undefined && limitRaw !== "") {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
      return ng(`limit must be an integer within 1-${MAX_PAGE_SIZE}`);
    }
    limit = parsed;
  }
  if (cursorRaw !== undefined && cursorRaw !== "") {
    if (cursorRaw.length > 2048) return ng("cursor is invalid");
    return ok({ limit, cursor: cursorRaw });
  }
  return ok({ limit });
}
