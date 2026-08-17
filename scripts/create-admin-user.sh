#!/usr/bin/env bash
#
# 管理者ユーザーを作成する。
# 自己登録は無効なので、必ずこの経路で作る（FR-001）。
#
# 使い方: ./scripts/create-admin-user.sh you@example.com
set -euo pipefail

email="${1:-}"
if [[ -z "$email" ]]; then
  echo "usage: $0 <email>" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tf_dir="$repo_root/infra/terraform"

user_pool_id="$(terraform -chdir="$tf_dir" output -raw cognito_user_pool_id)"

# 仮パスワードはメールで通知される。初回ログイン時に変更を求められる。
aws cognito-idp admin-create-user \
  --user-pool-id "$user_pool_id" \
  --username "$email" \
  --user-attributes "Name=email,Value=$email" "Name=email_verified,Value=true" \
  --desired-delivery-mediums EMAIL

echo "created: $email (user pool: $user_pool_id)"
echo "初回ログイン時に新しいパスワードの設定を求められます。"
