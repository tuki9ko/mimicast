#!/usr/bin/env bash
#
# 管理画面をビルドして admin-site バケットへ配置し、キャッシュを無効化する。
#
# packages/frontend/.env に API / Cognito の値が設定されていることが前提。
# 値は `terraform output` で取得できる。
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tf_dir="$repo_root/infra/terraform"

if [[ ! -f "$repo_root/packages/frontend/.env" ]]; then
  echo "packages/frontend/.env がありません。先に ./scripts/write-frontend-env.sh を実行してください" >&2
  exit 1
fi

bucket="$(terraform -chdir="$tf_dir" output -raw admin_site_bucket)"
distribution_id="$(terraform -chdir="$tf_dir" output -raw admin_distribution_id)"

npm run build -w @mimicast/frontend

dist="$repo_root/packages/frontend/dist"

# ファイル名にハッシュが入る assets は長期キャッシュ、index.html は都度取得させる
aws s3 sync "$dist/assets" "s3://$bucket/assets" \
  --delete \
  --cache-control "public,max-age=31536000,immutable"

aws s3 sync "$dist" "s3://$bucket" \
  --exclude "assets/*" \
  --delete \
  --cache-control "no-cache"

# 管理画面側は Invalidation を行う（配信用ディストリビューションでは行わない）
aws cloudfront create-invalidation \
  --distribution-id "$distribution_id" \
  --paths "/index.html" "/"

echo "deployed to s3://$bucket (distribution: $distribution_id)"
