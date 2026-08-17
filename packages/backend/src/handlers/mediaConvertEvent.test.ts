import assert from "node:assert/strict";
import { test } from "node:test";

import type { VideoRecord } from "../domain/video.ts";
import { FakeMediaStorage, FakeVideoRepository } from "../testing/fakes.ts";
import {
  handleEvent,
  type EventDependencies,
  type MediaConvertStateChangeEvent,
} from "./mediaConvertEvent.ts";
import type { MediaConvertEventDetail } from "../domain/mediaConvertEvent.ts";

const VIDEO_ID = "01K2H4ZBV3GAC5YKZCGMKAH8YX";

function createDeps(): EventDependencies & {
  videos: FakeVideoRepository;
  storage: FakeMediaStorage;
} {
  return {
    videos: new FakeVideoRepository(),
    storage: new FakeMediaStorage(),
    now: () => new Date("2026-08-17T01:00:00.000Z"),
  };
}

function seedTranscoding(videos: FakeVideoRepository): VideoRecord {
  return videos.seed({
    id: VIDEO_ID,
    gsi1pk: "VIDEO",
    gsi1sk: "2026-08-17T00:00:00.000Z",
    title: "夜桜",
    originalFilename: "yozakura.mov",
    status: "TRANSCODING",
    distributionStatus: "DISABLED",
    sourceKey: `source/${VIDEO_ID}/source.mov`,
    sourceContentType: "video/quicktime",
    sourceSize: 100,
    mediaConvertJobId: "job-1",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  });
}

function event(detail: MediaConvertEventDetail): MediaConvertStateChangeEvent {
  return {
    version: "0",
    id: "event-1",
    "detail-type": "MediaConvert Job State Change",
    source: "aws.mediaconvert",
    account: "111111111111",
    time: "2026-08-17T01:00:00Z",
    region: "ap-northeast-1",
    resources: [],
    detail,
  };
}

test("COMPLETE で READY になり出力メタデータが保存される", async () => {
  const deps = createDeps();
  seedTranscoding(deps.videos);
  deps.storage.objectSize = 3_100_000_000;

  await handleEvent(
    event({
      status: "COMPLETE",
      jobId: "job-1",
      userMetadata: { videoId: VIDEO_ID },
      outputGroupDetails: [
        {
          outputDetails: [
            { videoDetails: { widthInPx: 1920, heightInPx: 1080 } },
          ],
        },
      ],
    }),
    deps,
  );

  const stored = deps.videos.items.get(VIDEO_ID);
  assert.equal(stored?.status, "READY");
  assert.equal(stored?.outputKey, `videos/${VIDEO_ID}/video.mp4`);
  assert.equal(stored?.outputSize, 3_100_000_000);
  assert.equal(stored?.width, 1920);
  assert.equal(stored?.height, 1080);
  // 変換完了で自動的に配信 ON にしてはならない
  assert.equal(stored?.distributionStatus, "DISABLED");
});

test("出力オブジェクトが見つからなくても READY にはする", async () => {
  const deps = createDeps();
  seedTranscoding(deps.videos);
  deps.storage.objectSize = undefined;

  await handleEvent(
    event({
      status: "COMPLETE",
      jobId: "job-1",
      userMetadata: { videoId: VIDEO_ID },
    }),
    deps,
  );

  const stored = deps.videos.items.get(VIDEO_ID);
  assert.equal(stored?.status, "READY");
  assert.equal(stored?.outputSize, undefined);
});

test("ERROR で ERROR 状態とエラー内容が保存される", async () => {
  const deps = createDeps();
  seedTranscoding(deps.videos);

  await handleEvent(
    event({
      status: "ERROR",
      jobId: "job-1",
      userMetadata: { videoId: VIDEO_ID },
      errorCode: 1404,
      errorMessage: "Unable to open input file",
    }),
    deps,
  );

  const stored = deps.videos.items.get(VIDEO_ID);
  assert.equal(stored?.status, "ERROR");
  assert.equal(stored?.errorCode, "1404");
  assert.equal(stored?.errorMessage, "Unable to open input file");
});

test("TRANSCODING でないレコードは READY へ戻さない", async () => {
  const deps = createDeps();
  const record = seedTranscoding(deps.videos);
  deps.videos.seed({ ...record, status: "DELETING" });

  await handleEvent(
    event({
      status: "COMPLETE",
      jobId: "job-1",
      userMetadata: { videoId: VIDEO_ID },
    }),
    deps,
  );

  assert.equal(deps.videos.items.get(VIDEO_ID)?.status, "DELETING");
});

test("videoId のないイベントは例外にせず無視する", async () => {
  const deps = createDeps();
  await handleEvent(event({ status: "COMPLETE", jobId: "job-x" }), deps);
  assert.equal(deps.videos.items.size, 0);
});

test("想定外の status は無視する", async () => {
  const deps = createDeps();
  seedTranscoding(deps.videos);

  await handleEvent(
    event({
      status: "PROGRESSING",
      jobId: "job-1",
      userMetadata: { videoId: VIDEO_ID },
    }),
    deps,
  );

  assert.equal(deps.videos.items.get(VIDEO_ID)?.status, "TRANSCODING");
});
