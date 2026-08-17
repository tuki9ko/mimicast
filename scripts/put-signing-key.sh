#!/usr/bin/env bash
#
# CloudFront 署名用の秘密鍵を Secrets Manager へ投入する。
# Terraform が作るのは Secret の入れ物のみで、値はこの経路で入れる。
#
# 使い方: ./scripts/put-signing-key.sh [秘密鍵のパス]
#   省略時は infra/terraform/private_key.pem を使う。
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tf_dir="$repo_root/infra/terraform"
key_path="${1:-$tf_dir/private_key.pem}"

if [[ ! -f "$key_path" ]]; then
  echo "秘密鍵が見つかりません: $key_path" >&2
  exit 1
fi

# CloudFront に登録済みの公開鍵と対応していることを確認する。
# ここが食い違うと、発行した URL が理由の分からない 403 になる。
public_key_path="$(dirname "$key_path")/public_key.pem"
if [[ -f "$public_key_path" ]]; then
  derived="$(openssl rsa -in "$key_path" -pubout 2>/dev/null)"
  registered="$(openssl rsa -pubin -in "$public_key_path" -pubout 2>/dev/null)"
  if [[ "$derived" != "$registered" ]]; then
    echo "秘密鍵が $public_key_path と対応していません" >&2
    exit 1
  fi
fi

secret_id="$(terraform -chdir="$tf_dir" output -raw cloudfront_private_key_secret_name)"

# 鍵の内容をコマンドライン引数へ載せないよう file:// で渡す
aws secretsmanager put-secret-value \
  --secret-id "$secret_id" \
  --secret-string "file://$key_path" \
  --query 'VersionId' \
  --output text > /dev/null

echo "投入しました: $secret_id"
echo "Lambda 実行環境は秘密鍵を 15 分キャッシュするため、反映まで最大 15 分かかります。"
