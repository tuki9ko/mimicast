import assert from "node:assert/strict";
import { test } from "node:test";

import { buildJobSettings, s3Uri } from "./mediaConvertJob.ts";

const base = {
  inputUri: "s3://media/source/abc/source.mov",
  destinationUri: "s3://media/videos/abc/video",
};

function firstOutput(settings: ReturnType<typeof buildJobSettings>) {
  const output = settings.OutputGroups?.[0]?.Outputs?.[0];
  assert.ok(output);
  return output;
}

test("4K 入力では 1920x1080 が指定される", () => {
  const settings = buildJobSettings({
    ...base,
    sourceWidth: 3840,
    sourceHeight: 2160,
  });
  const video = firstOutput(settings).VideoDescription;
  assert.equal(video?.Width, 1920);
  assert.equal(video?.Height, 1080);
});

test("720p 入力では解像度を指定しない（アップスケールしない）", () => {
  const settings = buildJobSettings({
    ...base,
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  const video = firstOutput(settings).VideoDescription;
  assert.equal(video?.Width, undefined);
  assert.equal(video?.Height, undefined);
  assert.equal(video?.ScalingBehavior, undefined);
});

test("解像度不明なら 1080p へ収める", () => {
  const settings = buildJobSettings(base);
  const video = firstOutput(settings).VideoDescription;
  assert.equal(video?.Width, 1920);
  assert.equal(video?.Height, 1080);
});

test("MP4 の MOOV は Progressive Download 配置になる", () => {
  const container = firstOutput(buildJobSettings(base)).ContainerSettings;
  assert.equal(container?.Container, "MP4");
  assert.equal(container?.Mp4Settings?.MoovPlacement, "PROGRESSIVE_DOWNLOAD");
});

test("フレームレートは入力へ追従する（水増ししない）", () => {
  const h264 =
    firstOutput(buildJobSettings(base)).VideoDescription?.CodecSettings
      ?.H264Settings;
  assert.equal(h264?.FramerateControl, "INITIALIZE_FROM_SOURCE");
  assert.equal(h264?.RateControlMode, "QVBR");
  assert.equal(h264?.MaxBitrate, 12_000_000);
  assert.equal(h264?.QvbrSettings?.QvbrQualityLevel, 8);
});

test("AdaptiveQuantization が AUTO のとき個別指定を含めない", () => {
  // AUTO と Spatial / Temporal / Flicker の併記は CreateJob が 400 で拒否する
  const h264 =
    firstOutput(buildJobSettings(base)).VideoDescription?.CodecSettings
      ?.H264Settings;
  assert.ok(h264);
  assert.equal(h264.AdaptiveQuantization, undefined);
  assert.equal(h264.SpatialAdaptiveQuantization, undefined);
  assert.equal(h264.TemporalAdaptiveQuantization, undefined);
  assert.equal(h264.FlickerAdaptiveQuantization, undefined);
});

test("音声は AAC-LC / 48kHz / ステレオ", () => {
  const audio = firstOutput(buildJobSettings(base)).AudioDescriptions?.[0];
  const aac = audio?.CodecSettings?.AacSettings;
  assert.equal(audio?.CodecSettings?.Codec, "AAC");
  assert.equal(aac?.CodecProfile, "LC");
  assert.equal(aac?.SampleRate, 48_000);
  assert.equal(aac?.CodingMode, "CODING_MODE_2_0");
  assert.equal(aac?.Bitrate, 192_000);
});

test("出力は 1 つだけ（NameModifier を不要にする）", () => {
  const settings = buildJobSettings(base);
  assert.equal(settings.OutputGroups?.length, 1);
  assert.equal(settings.OutputGroups?.[0]?.Outputs?.length, 1);
  assert.equal(firstOutput(settings).NameModifier, undefined);
});

test("Destination は末尾に / を付けない", () => {
  const destination =
    buildJobSettings(base).OutputGroups?.[0]?.OutputGroupSettings
      ?.FileGroupSettings?.Destination;
  assert.equal(destination, "s3://media/videos/abc/video");
  assert.ok(!destination?.endsWith("/"));
});

test("s3Uri はバケットとキーを連結する", () => {
  assert.equal(s3Uri("bucket", "videos/a/video.mp4"), "s3://bucket/videos/a/video.mp4");
});
