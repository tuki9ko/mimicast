import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isUploadTimedOut,
  newVideoRecord,
  outputDestinationFor,
  outputKeyFor,
  sourceKeyFor,
  toDto,
  withUploadTimeoutApplied,
  type VideoRecord,
} from "./video.ts";

const ID = "01K2H4ZBV3GAC5YKZCGMKAH8YX";

test("S3 キーは videoId と拡張子だけで組み立てる", () => {
  assert.equal(sourceKeyFor(ID, ".mov"), `source/${ID}/source.mov`);
  assert.equal(outputKeyFor(ID), `videos/${ID}/video.mp4`);
  assert.equal(outputDestinationFor(ID), `videos/${ID}/video`);
});

test("新規レコードは UPLOADING / DISABLED で始まる", () => {
  const record = newVideoRecord(
    ID,
    {
      title: "夜桜",
      filename: "yozakura.mov",
      extension: ".mov",
      contentType: "video/quicktime",
      size: 100,
      sourceWidth: 3840,
      sourceHeight: 2160,
    },
    new Date("2026-08-17T00:00:00.000Z"),
  );

  assert.equal(record.status, "UPLOADING");
  assert.equal(record.distributionStatus, "DISABLED");
  assert.equal(record.createdAt, "2026-08-17T00:00:00.000Z");
  assert.equal(record.gsi1sk, record.createdAt);
  assert.equal(record.originalFilename, "yozakura.mov");
  // 元ファイル名は S3 キーへ利用しない
  assert.equal(record.sourceKey, `source/${ID}/source.mov`);
});

test("解像度不明ならフィールドを持たない", () => {
  const record = newVideoRecord(
    ID,
    {
      title: "t",
      filename: "a.mp4",
      extension: ".mp4",
      contentType: "video/mp4",
      size: 1,
    },
    new Date(),
  );
  assert.equal("sourceWidth" in record, false);
});

test("DTO は内部属性を含まない", () => {
  const record: VideoRecord = {
    id: ID,
    gsi1pk: "VIDEO",
    gsi1sk: "2026-08-17T00:00:00.000Z",
    title: "t",
    originalFilename: "a.mp4",
    status: "TRANSCODING",
    distributionStatus: "DISABLED",
    sourceKey: `source/${ID}/source.mp4`,
    sourceContentType: "video/mp4",
    sourceSize: 1,
    uploadId: "upload-1",
    mediaConvertJobId: "job-1",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  };

  const dto = toDto(record) as unknown as Record<string, unknown>;
  assert.equal(dto["uploadId"], undefined);
  assert.equal(dto["mediaConvertJobId"], undefined);
  assert.equal(dto["gsi1pk"], undefined);
  assert.equal(dto["gsi1sk"], undefined);
  assert.equal(dto["id"], ID);
  // 元レコードは破壊しない
  assert.equal(record.uploadId, "upload-1");
});

test("UPLOADING が 24 時間を超えるとタイムアウト扱いになる", () => {
  const record = {
    status: "UPLOADING",
    updatedAt: "2026-08-17T00:00:00.000Z",
  } as VideoRecord;

  assert.equal(
    isUploadTimedOut(record, new Date("2026-08-17T23:59:00.000Z")),
    false,
  );
  assert.equal(
    isUploadTimedOut(record, new Date("2026-08-18T00:00:01.000Z")),
    true,
  );
});

test("UPLOADING 以外はタイムアウトしない", () => {
  const record = {
    status: "TRANSCODING",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as VideoRecord;
  assert.equal(isUploadTimedOut(record, new Date("2026-08-18T00:00:00.000Z")), false);
});

test("タイムアウト適用後は ERROR になる", () => {
  const record = {
    id: ID,
    status: "UPLOADING",
    updatedAt: "2026-08-17T00:00:00.000Z",
  } as VideoRecord;

  const applied = withUploadTimeoutApplied(
    record,
    new Date("2026-08-19T00:00:00.000Z"),
  );
  assert.equal(applied.status, "ERROR");
  assert.equal(applied.errorCode, "UPLOAD_TIMEOUT");
  assert.equal(record.status, "UPLOADING");
});
