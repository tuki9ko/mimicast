import assert from "node:assert/strict";
import { test } from "node:test";

import type { ListVideosResponse, VideoDto } from "@mimicast/shared";

import type { VideoRecord } from "../domain/video.ts";
import { AppError } from "../http/errors.ts";
import type { HttpResult } from "../http/response.ts";
import {
  createTestContext,
  createTestDependencies,
  type TestDependencies,
} from "../testing/fakes.ts";
import { createPlaybackUrl } from "./playbackUrl.ts";
import {
  abortUpload,
  completeUpload,
  createPartUrls,
  createUpload,
} from "./uploads.ts";
import {
  createVideo,
  deleteVideo,
  getVideo,
  listVideos,
  updateDistribution,
} from "./videos.ts";

const VIDEO_ID = "01K2H4ZBV3GAC5YKZCGMKAH8YX";

function seedVideo(
  deps: TestDependencies,
  overrides: Partial<VideoRecord> = {},
): VideoRecord {
  const createdAt = "2026-08-17T00:00:00.000Z";
  return deps.videos.seed({
    id: VIDEO_ID,
    gsi1pk: "VIDEO",
    gsi1sk: createdAt,
    title: "夜桜",
    originalFilename: "yozakura.mov",
    status: "UPLOADING",
    distributionStatus: "DISABLED",
    sourceKey: `source/${VIDEO_ID}/source.mov`,
    sourceContentType: "video/quicktime",
    // 64 MiB * 2 + 1 byte -> 3 parts
    sourceSize: 64 * 1024 * 1024 * 2 + 1,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  });
}

async function expectStatus(
  promise: Promise<HttpResult>,
  status: number,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AppError, `expected AppError, got ${String(error)}`);
    assert.equal(error.status, status);
    return true;
  });
}

// ---------------------------------------------------------------------------
// POST /videos
// ---------------------------------------------------------------------------

test("POST /videos は UPLOADING / 配信 OFF のレコードを作る", async () => {
  const deps = createTestDependencies();
  const result = await createVideo(
    createTestContext("POST /videos", {
      body: {
        title: "夜桜",
        filename: "yozakura-4k.mov",
        contentType: "video/quicktime",
        size: 8_531_214_567,
        sourceWidth: 3840,
        sourceHeight: 2160,
      },
    }),
    deps,
  );

  assert.equal(result.status, 201);
  const stored = deps.videos.items.get(VIDEO_ID);
  assert.ok(stored);
  assert.equal(stored.status, "UPLOADING");
  assert.equal(stored.distributionStatus, "DISABLED");
  assert.equal(stored.sourceKey, `source/${VIDEO_ID}/source.mov`);
  assert.equal(stored.gsi1pk, "VIDEO");
  assert.equal(stored.gsi1sk, stored.createdAt);
});

test("POST /videos は許可外の拡張子を 400 で拒否する", async () => {
  const deps = createTestDependencies();
  await expectStatus(
    createVideo(
      createTestContext("POST /videos", {
        body: {
          title: "test",
          filename: "movie.avi",
          contentType: "video/x-msvideo",
          size: 100,
        },
      }),
      deps,
    ),
    400,
  );
});

test("POST /videos はサイズ上限超過を 400 で拒否する", async () => {
  const deps = createTestDependencies();
  await expectStatus(
    createVideo(
      createTestContext("POST /videos", {
        body: {
          title: "test",
          filename: "movie.mp4",
          contentType: "video/mp4",
          size: deps.config.maxUploadBytes + 1,
        },
      }),
      deps,
    ),
    400,
  );
});

// ---------------------------------------------------------------------------
// Multipart Upload
// ---------------------------------------------------------------------------

test("POST /videos/{id}/uploads は uploadId を保存しパート数を返す", async () => {
  const deps = createTestDependencies();
  seedVideo(deps);

  const result = await createUpload(
    createTestContext("POST /videos/{id}/uploads", {
      pathParameters: { id: VIDEO_ID },
    }),
    deps,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    uploadId: "upload-1",
    partSize: 64 * 1024 * 1024,
    partCount: 3,
  });
  assert.equal(deps.videos.items.get(VIDEO_ID)?.uploadId, "upload-1");
  assert.equal(deps.storage.created[0]?.contentType, "video/quicktime");
});

test("uploadId が一致しない場合は 404 を返す", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { uploadId: "upload-1" });

  await expectStatus(
    createPartUrls(
      createTestContext("POST /videos/{id}/uploads/{uploadId}/parts", {
        pathParameters: { id: VIDEO_ID, uploadId: "other-upload" },
        body: { partNumbers: [1] },
      }),
      deps,
    ),
    404,
  );
});

test("Part URL はリクエストしたパート分だけ発行される", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { uploadId: "upload-1" });

  const result = await createPartUrls(
    createTestContext("POST /videos/{id}/uploads/{uploadId}/parts", {
      pathParameters: { id: VIDEO_ID, uploadId: "upload-1" },
      body: { partNumbers: [1, 2] },
    }),
    deps,
  );

  const body = result.body as { urls: { partNumber: number }[] };
  assert.deepEqual(
    body.urls.map((url) => url.partNumber),
    [1, 2],
  );
  assert.equal(deps.storage.presigned.length, 2);
});

test("partCount を超える partNumber は 400 で拒否する", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { uploadId: "upload-1" });

  await expectStatus(
    createPartUrls(
      createTestContext("POST /videos/{id}/uploads/{uploadId}/parts", {
        pathParameters: { id: VIDEO_ID, uploadId: "upload-1" },
        body: { partNumbers: [4] },
      }),
      deps,
    ),
    400,
  );
});

test("complete で S3 完了 → MediaConvert 起動 → TRANSCODING になる", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { uploadId: "upload-1", sourceWidth: 3840, sourceHeight: 2160 });

  const result = await completeUpload(
    createTestContext("POST /videos/{id}/uploads/{uploadId}/complete", {
      pathParameters: { id: VIDEO_ID, uploadId: "upload-1" },
      body: {
        parts: [
          { partNumber: 1, etag: '"a"' },
          { partNumber: 2, etag: '"b"' },
          { partNumber: 3, etag: '"c"' },
        ],
      },
    }),
    deps,
  );

  assert.equal(result.status, 200);
  const dto = result.body as VideoDto;
  assert.equal(dto.status, "TRANSCODING");
  assert.equal(
    (dto as unknown as Record<string, unknown>)["uploadId"],
    undefined,
  );
  assert.equal(
    (dto as unknown as Record<string, unknown>)["mediaConvertJobId"],
    undefined,
  );

  assert.equal(deps.storage.completed.length, 1);
  const job = deps.transcoder.jobs[0];
  assert.ok(job);
  assert.equal(
    job.inputUri,
    `s3://mimicast-media-test/source/${VIDEO_ID}/source.mov`,
  );
  // 末尾に "/" を付けない（付けると入力ファイル名がベース名として使われる）
  assert.equal(
    job.destinationUri,
    `s3://mimicast-media-test/videos/${VIDEO_ID}/video`,
  );
  assert.equal(deps.videos.items.get(VIDEO_ID)?.mediaConvertJobId, "job-1");
});

test("complete でパートが欠けている場合は 400", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { uploadId: "upload-1" });

  await expectStatus(
    completeUpload(
      createTestContext("POST /videos/{id}/uploads/{uploadId}/complete", {
        pathParameters: { id: VIDEO_ID, uploadId: "upload-1" },
        body: { parts: [{ partNumber: 1, etag: '"a"' }] },
      }),
      deps,
    ),
    400,
  );
});

test("CreateJob 失敗時は ERROR へ遷移し 500 を返す", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { uploadId: "upload-1" });
  deps.transcoder.createShouldFail = true;

  await expectStatus(
    completeUpload(
      createTestContext("POST /videos/{id}/uploads/{uploadId}/complete", {
        pathParameters: { id: VIDEO_ID, uploadId: "upload-1" },
        body: {
          parts: [
            { partNumber: 1, etag: '"a"' },
            { partNumber: 2, etag: '"b"' },
            { partNumber: 3, etag: '"c"' },
          ],
        },
      }),
      deps,
    ),
    500,
  );

  const stored = deps.videos.items.get(VIDEO_ID);
  assert.equal(stored?.status, "ERROR");
  assert.equal(stored?.errorCode, "TRANSCODE_START_FAILED");
});

test("アップロード中止で Multipart Upload を破棄しレコードを削除する", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { uploadId: "upload-1" });

  const result = await abortUpload(
    createTestContext("DELETE /videos/{id}/uploads/{uploadId}", {
      pathParameters: { id: VIDEO_ID, uploadId: "upload-1" },
    }),
    deps,
  );

  assert.equal(result.status, 204);
  assert.deepEqual(deps.storage.aborted, [
    { key: `source/${VIDEO_ID}/source.mov`, uploadId: "upload-1" },
  ]);
  assert.equal(deps.videos.items.has(VIDEO_ID), false);
});

// ---------------------------------------------------------------------------
// 削除
// ---------------------------------------------------------------------------

test("TRANSCODING 中の削除は MediaConvert ジョブを中止する", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { status: "TRANSCODING", mediaConvertJobId: "job-9" });

  const result = await deleteVideo(
    createTestContext("DELETE /videos/{id}", {
      pathParameters: { id: VIDEO_ID },
    }),
    deps,
  );

  assert.equal(result.status, 204);
  assert.deepEqual(deps.transcoder.cancelled, ["job-9"]);
  assert.deepEqual(deps.storage.deletedPrefixes, [
    `source/${VIDEO_ID}/`,
    `videos/${VIDEO_ID}/`,
  ]);
  assert.equal(deps.videos.items.has(VIDEO_ID), false);
});

test("UPLOADING 中の削除は未完了 Multipart Upload を破棄する", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { uploadId: "upload-1" });

  await deleteVideo(
    createTestContext("DELETE /videos/{id}", {
      pathParameters: { id: VIDEO_ID },
    }),
    deps,
  );

  assert.equal(deps.storage.aborted.length, 1);
  assert.equal(deps.videos.items.has(VIDEO_ID), false);
});

test("AbortMultipartUpload が失敗しても削除は完了する", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { uploadId: "upload-1" });
  deps.storage.abortShouldFail = true;

  const result = await deleteVideo(
    createTestContext("DELETE /videos/{id}", {
      pathParameters: { id: VIDEO_ID },
    }),
    deps,
  );

  assert.equal(result.status, 204);
  assert.equal(deps.videos.items.has(VIDEO_ID), false);
});

test("存在しない動画の削除は 404", async () => {
  const deps = createTestDependencies();
  await expectStatus(
    deleteVideo(
      createTestContext("DELETE /videos/{id}", {
        pathParameters: { id: "missing" },
      }),
      deps,
    ),
    404,
  );
});

// ---------------------------------------------------------------------------
// 配信制御 / URL 発行
// ---------------------------------------------------------------------------

test("配信 ON/OFF を切り替えられる", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { status: "READY", outputKey: `videos/${VIDEO_ID}/video.mp4` });

  const result = await updateDistribution(
    createTestContext("PATCH /videos/{id}/distribution", {
      pathParameters: { id: VIDEO_ID },
      body: { distributionStatus: "ENABLED" },
    }),
    deps,
  );

  assert.equal((result.body as VideoDto).distributionStatus, "ENABLED");
});

test("配信 OFF の動画は URL を発行できない（409）", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, {
    status: "READY",
    distributionStatus: "DISABLED",
    outputKey: `videos/${VIDEO_ID}/video.mp4`,
  });

  await expectStatus(
    createPlaybackUrl(
      createTestContext("POST /videos/{id}/playback-url", {
        pathParameters: { id: VIDEO_ID },
        body: { expiresIn: 10800 },
      }),
      deps,
    ),
    409,
  );
});

test("READY でない動画は URL を発行できない（409）", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { status: "TRANSCODING", distributionStatus: "ENABLED" });

  await expectStatus(
    createPlaybackUrl(
      createTestContext("POST /videos/{id}/playback-url", {
        pathParameters: { id: VIDEO_ID },
        body: { expiresIn: 10800 },
      }),
      deps,
    ),
    409,
  );
});

test("READY かつ ENABLED なら Signed URL を発行する", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, {
    status: "READY",
    distributionStatus: "ENABLED",
    outputKey: `videos/${VIDEO_ID}/video.mp4`,
  });

  const result = await createPlaybackUrl(
    createTestContext("POST /videos/{id}/playback-url", {
      pathParameters: { id: VIDEO_ID },
      body: { expiresIn: 10800 },
    }),
    deps,
  );

  const body = result.body as { url: string; expiresAt: string };
  assert.match(body.url, /^https:\/\/video\.example\.jp\/videos\//);
  assert.equal(body.expiresAt, "2026-08-17T03:00:00.000Z");
  assert.equal(
    deps.signer.signed[0]?.objectKey,
    `videos/${VIDEO_ID}/video.mp4`,
  );
});

test("許可外の expiresIn は 400", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, {
    status: "READY",
    distributionStatus: "ENABLED",
    outputKey: `videos/${VIDEO_ID}/video.mp4`,
  });

  await expectStatus(
    createPlaybackUrl(
      createTestContext("POST /videos/{id}/playback-url", {
        pathParameters: { id: VIDEO_ID },
        body: { expiresIn: 7200 },
      }),
      deps,
    ),
    400,
  );
});

// ---------------------------------------------------------------------------
// 一覧・詳細
// ---------------------------------------------------------------------------

test("一覧は作成日時の降順で返る", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { id: "a", gsi1sk: "2026-08-01T00:00:00.000Z" });
  seedVideo(deps, { id: "b", gsi1sk: "2026-08-03T00:00:00.000Z" });
  seedVideo(deps, { id: "c", gsi1sk: "2026-08-02T00:00:00.000Z" });

  const result = await listVideos(createTestContext("GET /videos"), deps);
  const body = result.body as ListVideosResponse;
  assert.deepEqual(
    body.items.map((item) => item.id),
    ["b", "c", "a"],
  );
});

test("一覧のレスポンスに内部属性が含まれない", async () => {
  const deps = createTestDependencies();
  seedVideo(deps, { uploadId: "upload-1", mediaConvertJobId: "job-1" });

  const result = await listVideos(createTestContext("GET /videos"), deps);
  const item = (result.body as ListVideosResponse).items[0] as unknown as Record<
    string,
    unknown
  >;
  assert.equal(item["uploadId"], undefined);
  assert.equal(item["mediaConvertJobId"], undefined);
  assert.equal(item["gsi1pk"], undefined);
  assert.equal(item["gsi1sk"], undefined);
});

test("limit が範囲外なら 400", async () => {
  const deps = createTestDependencies();
  await expectStatus(
    listVideos(
      createTestContext("GET /videos", {
        queryStringParameters: { limit: "999" },
      }),
      deps,
    ),
    400,
  );
});

test("UPLOADING のまま 24 時間を超えたレコードは ERROR として扱う", async () => {
  const deps = createTestDependencies({
    now: () => new Date("2026-08-18T01:00:00.000Z"),
  });
  seedVideo(deps, { updatedAt: "2026-08-17T00:00:00.000Z" });

  const result = await getVideo(
    createTestContext("GET /videos/{id}", {
      pathParameters: { id: VIDEO_ID },
    }),
    deps,
  );

  assert.equal((result.body as VideoDto).status, "ERROR");
  assert.equal(deps.videos.items.get(VIDEO_ID)?.status, "ERROR");
});

test("24 時間以内の UPLOADING はそのまま", async () => {
  const deps = createTestDependencies({
    now: () => new Date("2026-08-17T10:00:00.000Z"),
  });
  seedVideo(deps, { updatedAt: "2026-08-17T00:00:00.000Z" });

  const result = await getVideo(
    createTestContext("GET /videos/{id}", {
      pathParameters: { id: VIDEO_ID },
    }),
    deps,
  );

  assert.equal((result.body as VideoDto).status, "UPLOADING");
});
