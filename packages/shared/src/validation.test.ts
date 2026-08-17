import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_MAX_UPLOAD_BYTES } from "./constants.ts";
import {
  extensionOf,
  validateCompletedParts,
  validateCreateVideoInput,
  validateDistributionStatus,
  validateListQuery,
  validatePartNumbers,
  validatePlaybackExpiresIn,
} from "./validation.ts";

const base = {
  title: "夜桜",
  filename: "yozakura-4k.mov",
  contentType: "video/quicktime",
  size: 8_531_214_567,
  sourceWidth: 3840,
  sourceHeight: 2160,
};

test("正常な入力を受け付け、拡張子と Content-Type を正規化する", () => {
  const result = validateCreateVideoInput(base);
  assert.ok(result.ok);
  assert.equal(result.value.extension, ".mov");
  assert.equal(result.value.contentType, "video/quicktime");
  assert.equal(result.value.sourceWidth, 3840);
});

test("title は前後の空白をトリムする", () => {
  const result = validateCreateVideoInput({ ...base, title: "  夜桜  " });
  assert.ok(result.ok);
  assert.equal(result.value.title, "夜桜");
});

test("空の title を拒否する", () => {
  const result = validateCreateVideoInput({ ...base, title: "   " });
  assert.equal(result.ok, false);
});

test("101 文字の title を拒否する", () => {
  const result = validateCreateVideoInput({ ...base, title: "あ".repeat(101) });
  assert.equal(result.ok, false);
});

test("制御文字を含む title を拒否する", () => {
  const result = validateCreateVideoInput({ ...base, title: "夜\u0007桜" });
  assert.equal(result.ok, false);
});

test("許可外の拡張子を拒否する", () => {
  const result = validateCreateVideoInput({
    ...base,
    filename: "movie.avi",
    contentType: "video/x-msvideo",
  });
  assert.equal(result.ok, false);
});

test("拡張子に対応しない Content-Type を拒否する", () => {
  const result = validateCreateVideoInput({
    ...base,
    filename: "movie.mp4",
    contentType: "video/quicktime",
  });
  assert.equal(result.ok, false);
});

test("パス区切りを含む filename を拒否する", () => {
  const result = validateCreateVideoInput({
    ...base,
    filename: "../../etc/passwd.mp4",
    contentType: "video/mp4",
  });
  assert.equal(result.ok, false);
});

test("上限を超えるサイズを拒否する", () => {
  const result = validateCreateVideoInput({
    ...base,
    size: DEFAULT_MAX_UPLOAD_BYTES + 1,
  });
  assert.equal(result.ok, false);
});

test("上限は maxUploadBytes で上書きできる", () => {
  const result = validateCreateVideoInput(
    { ...base, size: 2_000_000_000 },
    { maxUploadBytes: 1_000_000_000 },
  );
  assert.equal(result.ok, false);
});

test("サイズ 0 を拒否する", () => {
  const result = validateCreateVideoInput({ ...base, size: 0 });
  assert.equal(result.ok, false);
});

test("解像度 null は不明として扱う", () => {
  const result = validateCreateVideoInput({
    ...base,
    sourceWidth: null,
    sourceHeight: null,
  });
  assert.ok(result.ok);
  assert.equal(result.value.sourceWidth, undefined);
  assert.equal(result.value.sourceHeight, undefined);
});

test("片方の解像度しか取得できない場合は両方落とす", () => {
  const result = validateCreateVideoInput({ ...base, sourceHeight: null });
  assert.ok(result.ok);
  assert.equal(result.value.sourceWidth, undefined);
});

test("拡張子は大文字でも許可される", () => {
  const result = validateCreateVideoInput({
    ...base,
    filename: "YOZAKURA.MOV",
  });
  assert.ok(result.ok);
  assert.equal(result.value.extension, ".mov");
});

test("extensionOf は拡張子のない名前で null を返す", () => {
  assert.equal(extensionOf("movie"), null);
  assert.equal(extensionOf(".mp4"), null);
  assert.equal(extensionOf("movie."), null);
});

test("partNumbers は重複を拒否し昇順で返す", () => {
  assert.equal(validatePartNumbers({ partNumbers: [1, 1] }, 10).ok, false);
  const result = validatePartNumbers({ partNumbers: [3, 1, 2] }, 10);
  assert.ok(result.ok);
  assert.deepEqual(result.value, [1, 2, 3]);
});

test("partCount を超える partNumber を拒否する", () => {
  assert.equal(validatePartNumbers({ partNumbers: [11] }, 10).ok, false);
});

test("101 件以上の partNumbers を拒否する", () => {
  const partNumbers = Array.from({ length: 101 }, (_, i) => i + 1);
  assert.equal(validatePartNumbers({ partNumbers }, 200).ok, false);
});

test("complete のパート一覧は欠番を拒否する", () => {
  const parts = [
    { partNumber: 1, etag: '"a"' },
    { partNumber: 3, etag: '"c"' },
  ];
  assert.equal(validateCompletedParts({ parts }, 2).ok, false);
});

test("complete のパート一覧は昇順へ整列される", () => {
  const parts = [
    { partNumber: 2, etag: '"b"' },
    { partNumber: 1, etag: '"a"' },
  ];
  const result = validateCompletedParts({ parts }, 2);
  assert.ok(result.ok);
  assert.deepEqual(
    result.value.map((p) => p.partNumber),
    [1, 2],
  );
});

test("distributionStatus は列挙値のみ許可する", () => {
  assert.ok(validateDistributionStatus({ distributionStatus: "ENABLED" }).ok);
  assert.equal(validateDistributionStatus({ distributionStatus: "on" }).ok, false);
});

test("expiresIn は許可値のみ受け付ける", () => {
  assert.ok(validatePlaybackExpiresIn({ expiresIn: 10800 }).ok);
  assert.equal(validatePlaybackExpiresIn({ expiresIn: 7200 }).ok, false);
  assert.equal(validatePlaybackExpiresIn({ expiresIn: "3600" }).ok, false);
});

test("limit は 1〜100 の整数のみ許可する", () => {
  assert.deepEqual(validateListQuery(undefined, undefined, 50), {
    ok: true,
    value: { limit: 50 },
  });
  assert.equal(validateListQuery("0", undefined, 50).ok, false);
  assert.equal(validateListQuery("101", undefined, 50).ok, false);
  assert.equal(validateListQuery("abc", undefined, 50).ok, false);
  const withCursor = validateListQuery("10", "eyJpZCI6", 50);
  assert.ok(withCursor.ok);
  assert.deepEqual(withCursor.value, { limit: 10, cursor: "eyJpZCI6" });
});
