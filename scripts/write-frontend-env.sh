#!/usr/bin/env bash
#
# terraform output から packages/frontend/.env を生成する。
# 秘密情報は含まれない（ここに書いた値はビルド成果物へ埋め込まれる）。
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tf_dir="$repo_root/infra/terraform"
env_file="$repo_root/packages/frontend/.env"

out() { terraform -chdir="$tf_dir" output -raw "$1"; }

api_base_url="$(out api_base_url)"
user_pool_id="$(out cognito_user_pool_id)"
client_id="$(out cognito_client_id)"

# Cognito の User Pool ID は "{region}_{suffix}" 形式なのでリージョンを取り出せる
region="${user_pool_id%%_*}"

cat > "$env_file" <<EOF
# scripts/write-frontend-env.sh が生成したファイル。直接編集しない。
VITE_API_BASE_URL=${api_base_url%/}
VITE_COGNITO_REGION=${region}
VITE_COGNITO_USER_POOL_ID=${user_pool_id}
VITE_COGNITO_CLIENT_ID=${client_id}
EOF

echo "wrote $env_file"
cat "$env_file"
