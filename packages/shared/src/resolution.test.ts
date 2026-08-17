import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveOutputResolution, toEven } from "./resolution.ts";

test("4K はアスペクト比を維持して 1080p へ縮小される", () => {
  assert.deepEqual(resolveOutputResolution(3840, 2160), {
    width: 1920,
    height: 1080,
  });
});

test("720p はアップスケールしない（解像度を指定しない）", () => {
  assert.equal(resolveOutputResolution(1280, 720), undefined);
});

test("1080p ちょうどは解像度を指定しない", () => {
  assert.equal(resolveOutputResolution(1920, 1080), undefined);
});

test("縦動画は 1080 の高さに収まる", () => {
  const result = resolveOutputResolution(2160, 3840);
  assert.deepEqual(result, { width: 608, height: 1080 });
});

test("超ワイドは 1920 の幅に収まる", () => {
  const result = resolveOutputResolution(5120, 1440);
  assert.deepEqual(result, { width: 1920, height: 540 });
});

test("解像度不明の場合は 1080p へ収める既定動作", () => {
  assert.deepEqual(resolveOutputResolution(undefined, undefined), {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(resolveOutputResolution(3840, undefined), {
    width: 1920,
    height: 1080,
  });
});

test("算出結果は必ず偶数になる", () => {
  const result = resolveOutputResolution(3841, 2161);
  assert.ok(result);
  assert.equal(result.width % 2, 0);
  assert.equal(result.height % 2, 0);
});

test("toEven は奇数を 1 減らす", () => {
  assert.equal(toEven(1081), 1080);
  assert.equal(toEven(1080), 1080);
});
