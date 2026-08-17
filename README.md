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
| `infra/terraform/bootstrap` | state 用 S3 バケットと Route 53 ホストゾーン（初回のみ実行）          |
| `scripts`             | 管理者作成・管理画面デプロイの補助スクリプト                                |
| `docs`                | 要件定義書・設計書（Git 管理外）                                    |

主要な設計判断（CloudFront の 2 ディストリビューション分離、S3 の 2 バケット構成、
Signed URL の Canned Policy 採用など）の理由は `docs/design.md` を参照。

## 前提

- Node.js 22 以上（型ストリップで `.ts` を直接実行するため）
- Terraform 1.10 以上（S3 backend のネイティブロックを使うため）
- AWS CLI
- ドメイン 1 つ（各自で用意する。レジストラは問わない。DNS は Route 53 で引き、
  ゾーンへの委譲だけドメイン側で設定する。詳細はデプロイ手順 0.5）

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

### 0. state バケットと DNS ゾーンを作る（初回のみ）

本体より先に作る必要があるものをまとめた別モジュール。

- **state バケット** — 本体の backend が使う（バケットを作る側なので、このモジュールの state はローカルに残る）
- **Route 53 ホストゾーン** — ドメイン側へ NS を登録する手作業が挟まるため本体から分離している

```bash
cd infra/terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars   # dns_zone_name を埋める
terraform init
terraform apply

# 本体の backend 設定を生成する
terraform output -raw backend_config > ../backend.hcl

# ドメイン側へ登録する NS レコードを表示する
terraform output -raw ns_delegation_setup
```

state のロックは S3 ネイティブロック（`use_lockfile`）を使うため、DynamoDB のロックテーブルは作らない。
バケットはバージョニング有効・暗号化・Block Public Access 済み、`prevent_destroy` 付き。

### 0.5. ドメイン側で委譲を設定する

ドメインは各自で用意する（レジストラは問わない）。本システムが DNS に求めるのは
「Route 53 のゾーンへ委譲されていること」だけで、DNS の管理画面での作業は
**NS レコード 4 本の登録のみ**。ステップ 0 の `ns_delegation_setup` に出た値を使う。

**サブドメインを委譲する場合**（`dns_zone_name = "vrc.example.jp"` など）

親ゾーンの DNS に NS レコードを追加する。既存のレコードには影響しない。

| Type | Name | Value |
| ---- | ---- | ----- |
| NS | `vrc`（相対名で入力する DNS の場合。FQDN 形式なら `vrc.example.jp`） | `ns-xxx.awsdns-xx.com` を 4 本ぶん |

**ドメイン全体を Route 53 で引く場合**（`dns_zone_name = "example.jp"` など）

DNS レコードではなく、レジストラのネームサーバー設定を同じ 4 本へ変更する。
この場合、メールなど既存のレコードも Route 53 側へ移す必要がある。

> **重要**: DNS はレコードをそのまま引く設定にする。
> プロキシ型 CDN や URL 転送を経由させると CloudFront の前段にもう 1 段挟まり、
> Signed URL を前提とした配信経路（`VRChat → CloudFront → S3`）が崩れる。
> 委譲方式なら NS レコードにプロキシ設定は付かないため、自動的に満たされる。

委譲が効いたことを確認してから次へ進む。

```bash
dig +short NS vrc.example.jp        # Route 53 の NS が 4 本返ればよい
```

ここが未完了のまま本体を apply すると、`data "aws_route53_zone"` の解決に失敗するか、
ACM の DNS 検証で待ち続けることになる。

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

- 署名なしで `https://video.vrc.example.jp/videos/{id}/video.mp4` を叩くと **403**
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
