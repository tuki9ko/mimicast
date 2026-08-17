import assert from "node:assert/strict";
import { test } from "node:test";

import { AppError } from "../http/errors.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";

const key = {
  id: "01K2H4ZBV3GAC5YKZCGMKAH8YX",
  gsi1pk: "VIDEO",
  gsi1sk: "2026-08-17T00:00:00.000Z",
};

test("カーソルは往復できる", () => {
  assert.deepEqual(decodeCursor(encodeCursor(key)), key);
});

test("カーソルは base64url（URL 安全）である", () => {
  assert.match(encodeCursor(key), /^[A-Za-z0-9_-]+$/);
});

test("余計な属性は落とされる", () => {
  const encoded = encodeCursor({ ...key, secret: "x" });
  assert.deepEqual(decodeCursor(encoded), key);
});

test("壊れたカーソルは 400", () => {
  assert.throws(
    () => decodeCursor("!!!not-base64!!!"),
    (error: unknown) => error instanceof AppError && error.status === 400,
  );
});

test("gsi1pk が異なるカーソルは 400", () => {
  const encoded = Buffer.from(
    JSON.stringify({ ...key, gsi1pk: "OTHER" }),
    "utf8",
  ).toString("base64url");
  assert.throws(
    () => decodeCursor(encoded),
    (error: unknown) => error instanceof AppError && error.status === 400,
  );
});
