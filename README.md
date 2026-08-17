# mimicast

VRChat 向け動画配信管理システム。

4K などの元動画をブラウザからアップロードし、MediaConvert で VRChat 向けの
1080p H.264/AAC MP4 へ変換して Private S3 に置き、管理画面から発行した
**期限付き CloudFront Signed URL** でのみ再生できるようにする。

```
VRChat
   ↓ Signed URL
CloudFront（配信用・署名必須）
   ↓ OAC
Private S3
```

## 構成

| ディレクトリ                | 内容                                                    |
| --------------------- | ----------------------------------------------------- |
| `packages/shared`     | Frontend / Backend 共有の型・定数・バリデーション・出力解像度ロジック          |
| `packages/backend`    | API Lambda と MediaConvert Event Lambda（TypeScript）    |
| `packages/frontend`   | 管理画面 SPA（React + TypeScript + Vite）                   |
| `infra/terraform`     | AWS リソース一式（S3 x3 / CloudFront x2 / Lambda / DynamoDB…） |
| `infra/terraform/bootstrap` | state 用 S3 バケット（初回のみ実行する別モジュール）                |
| `scripts`             | 管理者作成・管理画面デプロイの補助スクリプト                                |
| `docs`                | 要件定義書・設計書（Git 管理外）                                    |

主要な設計判断（CloudFront の 2 ディストリビューション分離、S3 の 2 バケット構成、
Signed URL の Canned Policy 採用など）の理由は `docs/design.md` を参照。

## 前提

- Node.js 22 以上（型ストリップで `.ts` を直接実行するため）
- Terraform 1.9 以上
- AWS CLI
- Route 53 のホストゾーンと、`video.*` / `admin.*` に使えるドメイン

## 開発

```bash
npm install

npm test           # 全ワークスペースのテスト
npm run typecheck  # 全ワークスペースの型チェック
npm run build      # Lambda バンドル + 管理画面ビルド
```

個別に動かす場合：

```bash
npm test -w @mimicast/shared
npm run build -w @mimicast/backend      # dist/api, dist/event を生成
npm run dev -w @mimicast/frontend       # http://localhost:5173
```

フロントエンドのローカル開発には `packages/frontend/.env` が必要（`.env.example` を参照）。
ローカルから API を叩く場合は Terraform 変数 `allowed_dev_origins` に
`http://localhost:5173` を追加して CORS を許可する。

## デプロイ手順

実装順序・依存関係の都合上、この順番で行う。

### 0. state 用の S3 バケットを作る（初回のみ）

本体の state を S3 に置くため、先にバケットだけを別モジュールで作る。
このモジュールの state はローカルに残る（バケットを作る側なので S3 へは置けない）。

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply

# 本体の backend 設定を生成する
terraform output -raw backend_config > ../backend.hcl
```

ロックは S3 ネイティブロック（`use_lockfile`）を使うため、DynamoDB のロックテーブルは作らない。
バケットはバージョニング有効・暗号化・Block Public Access 済み、`prevent_destroy` 付き。

### 1. 署名鍵ペアを作る

```bash
openssl genrsa -out private_key.pem 2048
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

秘密鍵は Git へコミットしない。Terraform へも渡さない（NFR-004）。

### 2. Lambda をビルドする

Terraform が `packages/backend/dist` を zip 化するため、apply の前に必要。

```bash
npm ci
npm run build -w @mimicast/backend
```

### 3. Terraform を適用する

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # 値を埋める（public_key.pem の内容を含む）

# backend は部分設定なので、init のときだけ backend.hcl を渡す
terraform init -backend-config=backend.hcl
terraform apply
```

ACM の DNS 検証が完了するまで数分かかる。

2 回目以降の `init` は `.terraform/` に設定がキャッシュされるため、
`-backend-config` を付け直す必要はない（別マシンや CI では毎回渡す）。

### 4. 秘密鍵を Secrets Manager へ投入する

Terraform が作るのは Secret の入れ物のみ。値は CLI で入れる。

```bash
aws secretsmanager put-secret-value \
  --secret-id "$(terraform -chdir=infra/terraform output -raw cloudfront_private_key_secret_name)" \
  --secret-string "file://private_key.pem"
```

### 5. 管理者ユーザーを作る

自己登録は無効なので、CLI で作成する。

```bash
./scripts/create-admin-user.sh you@example.com
```

初回ログイン時に新しいパスワードの設定を求められる。

### 6. 管理画面をビルドしてデプロイする

`terraform output` の値を `packages/frontend/.env` へ設定してからビルドする。

```bash
./scripts/deploy-admin-site.sh
```

### 7. 通知を有効にする

SNS からメールが届くので、購読を承認する（CloudWatch Alarm 用）。

## 動作確認（受入条件の要点）

- 署名なしで `https://video.example.jp/videos/{id}/video.mp4` を叩くと **403**
  （`index.html` の 200 が返らないこと）
- 管理画面用ドメインでは `/videos/*` が配信されないこと
- S3 の URL へ直接アクセスすると拒否されること
- 配信 ON かつ変換完了（READY）の動画のみ URL を発行できること
- CloudFront アクセスログに `Signature` が含まれないこと

## 運用

鍵のローテーション、状態が詰まった動画の扱い、既知の制約は
[RUNBOOK.md](./RUNBOOK.md) を参照。

## 変えてはいけない設計

- S3 を Public にしない
- 動画本体をアプリケーションサーバー / Lambda 経由で配信・アップロードしない
- CloudFront Signed URL なしで動画を公開しない
- 秘密鍵をフロントエンドへ渡さない / Lambda 環境変数へ直接入れない
- **配信用 CloudFront に Custom Error Response を設定しない**
  （403 が `index.html` の 200 へ化け、アクセス拒否が成立しなくなる）
- 配信用と管理画面用の CloudFront / バケットを統合しない
- 配信用 Cache Policy にクエリ文字列を含めない
