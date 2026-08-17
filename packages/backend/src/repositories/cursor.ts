/**
 * 一覧ページングのカーソル（設計 16.1）。
 *
 * LastEvaluatedKey を base64url エンコードしたものをカーソルとする。
 * 外部から渡ってくる値なので、復号後にキー構成を検証してから DynamoDB へ渡す。
 */

import { VIDEO_GSI1PK } from "@mimicast/shared";

import { validationError } from "../http/errors.ts";

/** GSI1 の LastEvaluatedKey は主キーとインデックスキーで構成される。 */
export interface VideosPageKey {
  id: string;
  gsi1pk: string;
  gsi1sk: string;
}

export function encodeCursor(key: Record<string, unknown>): string {
  const { id, gsi1pk, gsi1sk } = key;
  if (
    typeof id !== "string" ||
    typeof gsi1pk !== "string" ||
    typeof gsi1sk !== "string"
  ) {
    // DynamoDB のレスポンスが想定外の形なら、次ページなしとして扱う方が安全。
    throw new Error("unexpected LastEvaluatedKey shape");
  }
  const json = JSON.stringify({ id, gsi1pk, gsi1sk });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): VideosPageKey {
  let parsed: unknown;
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw validationError("cursor is invalid");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw validationError("cursor is invalid");
  }
  const { id, gsi1pk, gsi1sk } = parsed as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    typeof gsi1sk !== "string" ||
    gsi1pk !== VIDEO_GSI1PK
  ) {
    throw validationError("cursor is invalid");
  }
  return { id, gsi1pk, gsi1sk };
}
