// Lambda 配布物のビルド。
//
// 出力を Terraform の archive_file がそのまま zip 化できるよう、
// ハンドラごとにディレクトリを分けて index.mjs を生成する。
//
//   dist/api/index.mjs    -> API Lambda      (handler: index.handler)
//   dist/event/index.mjs  -> Event Lambda    (handler: index.handler)

import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  { name: "api", entry: "src/handlers/api.ts" },
  { name: "event", entry: "src/handlers/mediaConvertEvent.ts" },
];

await rm(resolve(root, "dist"), { recursive: true, force: true });

for (const target of targets) {
  await build({
    entryPoints: [resolve(root, target.entry)],
    outfile: resolve(root, "dist", target.name, "index.mjs"),
    bundle: true,
    platform: "node",
    // Lambda ランタイムに同梱される AWS SDK のバージョンへ依存しないよう、
    // すべてバンドルする。
    packages: "bundle",
    format: "esm",
    target: "node22",
    sourcemap: false,
    minify: false,
    legalComments: "none",
    logLevel: "info",
  });
}

console.log("built:", targets.map((t) => `dist/${t.name}/index.mjs`).join(", "));
