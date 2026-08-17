// Lambda 配布物のビルド。
//
// 出力を Terraform の archive_file がそのまま zip 化できるよう、
// ハンドラごとにディレクトリを分けて index.js を生成する。
//
//   dist/api/index.js    -> API Lambda      (handler: index.handler)
//   dist/event/index.js  -> Event Lambda    (handler: index.handler)
//
// 出力は CJS とする。AWS SDK v3 の内部は CJS のままで require("node:https") を
// 呼ぶため、ESM でバンドルすると Lambda の初期化時に
// Dynamic require of "node:https" is not supported で落ちる。

import { rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
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
    outfile: resolve(root, "dist", target.name, "index.js"),
    bundle: true,
    platform: "node",
    // Lambda ランタイムに同梱される AWS SDK のバージョンへ依存しないよう、
    // すべてバンドルする。
    packages: "bundle",
    format: "cjs",
    target: "node22",
    sourcemap: false,
    minify: false,
    legalComments: "none",
    logLevel: "info",
  });

  // このパッケージ自体は "type": "module" のため、zip 側で CJS であることを
  // 明示する。これがないとローカルでもランタイムでも ESM として解釈される。
  await writeFile(
    resolve(root, "dist", target.name, "package.json"),
    `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
  );
}

// 読み込めること（= Lambda の初期化が通ること）をここで確認する。
// バンドル形式の不整合はデプロイ後の 500 としてしか現れないため。
const require = createRequire(import.meta.url);
for (const target of targets) {
  const loaded = require(resolve(root, "dist", target.name, "index.js"));
  if (typeof loaded.handler !== "function") {
    throw new Error(`${target.name}: handler が export されていない`);
  }
}

console.log("built:", targets.map((t) => `dist/${t.name}/index.js`).join(", "));
