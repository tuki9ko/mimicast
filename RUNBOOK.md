# 運用手順書

## 1. 署名鍵のローテーション（NFR-005 / 設計 12.4）

CloudFront Key Group は複数の公開鍵を保持できる。これを利用して無停止で入れ替える。

MVP では自動化しない。以下を手順として実行する。

```bash
# 1. 新しい鍵ペアを生成
openssl genrsa -out private_key_new.pem 2048
openssl rsa -pubout -in private_key_new.pem -out public_key_new.pem
```

2. 新しい公開鍵を CloudFront Public Key として登録し、Key Group へ**追加**する。
   `infra/terraform/cloudfront_video.tf` の `aws_cloudfront_public_key` を複製し、
   `aws_cloudfront_key_group.signing.items` に両方の ID を並べて `terraform apply` する。

   ```hcl
   resource "aws_cloudfront_public_key" "signing_next" {
     name        = "${local.name_prefix}-signing-key-2"
     encoded_key = var.cloudfront_public_key_next
   }

   resource "aws_cloudfront_key_group" "signing" {
     items = [
       aws_cloudfront_public_key.signing.id,
       aws_cloudfront_public_key.signing_next.id,
     ]
   }
   ```

3. Secrets Manager の秘密鍵を新しいものへ更新する。
   同時に Lambda の `CF_KEY_PAIR_ID` を新しい公開鍵の ID へ切り替える。

   ```bash
   aws secretsmanager put-secret-value \
     --secret-id /mimicast/prod/cloudfront/private-key \
     --secret-string file://private_key_new.pem
   ```

   Lambda 実行環境は秘密鍵を 15 分キャッシュするため、反映まで最大 15 分かかる。

4. **旧鍵で署名した URL の最大有効期限（24 時間）が経過するまで待つ。**

5. Key Group から旧公開鍵を外し、旧 `aws_cloudfront_public_key` を削除して apply する。

順序を入れ替えて 5 を先に行うと、発行済み URL が即座に無効になる。

---

## 2. 管理者ユーザーの追加

自己登録は無効。

```bash
./scripts/create-admin-user.sh new-admin@example.com
```

削除する場合：

```bash
aws cognito-idp admin-delete-user \
  --user-pool-id "$(terraform -chdir=infra/terraform output -raw cognito_user_pool_id)" \
  --username new-admin@example.com
```

---

## 3. 状態が詰まった動画の扱い

| 症状                                | 原因と対応                                                                 |
| --------------------------------- | --------------------------------------------------------------------- |
| `UPLOADING` のまま止まっている             | ブラウザを閉じた等。24 時間経過後、一覧・詳細の参照時に自動で `ERROR` へ遷移する。待たずに消したい場合は管理画面から削除する。 |
| `UPLOADED` のまま止まっている              | `CreateJob` の直前で失敗した可能性。削除して再アップロードする（MVP では再変換 API を持たない）。          |
| `TRANSCODING` のまま止まっている           | 完了イベントの取りこぼし。DLQ を確認する（下記）。                                           |
| `ERROR`                           | MVP では再変換しない。削除して再アップロードする。                                          |

### 完了イベントを取りこぼした場合

DLQ にメッセージが溜まると `*-event-dlq-messages` アラームが発報する。

```bash
# メッセージを確認
aws sqs receive-message --queue-url "$DLQ_URL" --max-number-of-messages 10

# ジョブの状態を確認
aws mediaconvert get-job --id "$JOB_ID"
```

原因を解消したうえで、Event Lambda を同じイベントで手動実行すれば復旧できる。
イベントの `detail.userMetadata.videoId` が動画レコードを指す。

---

## 4. 既知の制約（MVP 仕様）

意図的に受け入れている制約。バグとして扱わない。

1. **配信 OFF は発行済み URL を失効させない**（FR-060）
   すでに発行した Signed URL は、その URL 自身の有効期限まで有効。
   即時失効は Phase 2（CloudFront Function + KeyValueStore）。

2. **削除してもエッジキャッシュは残りうる**（FR-072）
   配信用オブジェクトには `max-age=31536000, immutable` を付けているため、
   削除後も CloudFront エッジに残る可能性がある。MVP では Invalidation を実行しない。
   削除済み動画へのアクセスは、発行済み URL の期限切れをもって遮断される。

3. **有効期限が切れると再生中でもシークで停止する**（FR-053）
   AVPro はシークのたびに新しい Range Request を出すため。
   管理画面にも同じ注意書きを表示している。

4. **60fps 上限を厳密に保証しない**（FR-022）
   ブラウザからフレームレートを取得できないため `INITIALIZE_FROM_SOURCE` を使う。
   120fps などの元動画は想定範囲外。厳密化が必要になれば Phase 2 で probe を追加する。

5. **出力フレームレートが表示されない場合がある**
   MediaConvert の完了イベントにフレームレートが含まれないことがあるため、
   取得できた場合のみ表示する。

---

## 5. コストの確認

```bash
# 当月の Budgets 状況
aws budgets describe-budgets --account-id "$(aws sts get-caller-identity --query Account --output text)"
```

想定を超える転送が出た場合、`*-video-cf-bytes-downloaded` アラームが発報する
（1 日で想定月間量の 1/10 を超過）。

未完了 Multipart Upload は 7 日で自動破棄されるが、状況を見たい場合：

```bash
aws s3api list-multipart-uploads --bucket "$MEDIA_BUCKET"
```

---

## 6. Terraform state の取り扱い

state は bootstrap モジュールが作った S3 バケットに置く。
ロックは S3 ネイティブロック（`use_lockfile`）で、キーは `<state キー>.tflock`。

```
s3://{project}-tfstate-{account_id}/{env}/terraform.tfstate
```

### 別マシン / CI から操作する

`backend.hcl` は Git 管理外なので、まず再生成する。

```bash
terraform -chdir=infra/terraform/bootstrap output -raw backend_config > infra/terraform/backend.hcl
terraform -chdir=infra/terraform init -backend-config=backend.hcl
```

bootstrap の state はローカルにしかないため、それも手元にない場合は
`backend.hcl` を手書きする（`backend.hcl.example` と同じ 3 行）か、リソースを import する。

```bash
terraform -chdir=infra/terraform/bootstrap import \
  aws_s3_bucket.state "mimicast-tfstate-123456789012"

terraform -chdir=infra/terraform/bootstrap import \
  aws_route53_zone.main "Z0123456789ABCDEFGHIJ"
```

bootstrap が管理するのは state バケットと Route 53 ホストゾーンのみで、
どちらも `prevent_destroy` 付き・既に存在するものなので、state を失っても
サービスは止まらない（再作成されるとゾーンの NS が変わるため import で復帰させる）。

### ロックが残った場合

apply の途中でプロセスが死ぬとロックが残る。エラーに出た ID を使って解除する。

```bash
terraform -chdir=infra/terraform force-unlock <LOCK_ID>
```

他に apply を実行しているプロセスがないことを確認してから行う。

### state を壊した場合

バケットはバージョニング有効なので、直前のバージョンへ戻せる。

```bash
aws s3api list-object-versions \
  --bucket "$STATE_BUCKET" --prefix "prod/terraform.tfstate" \
  --query 'Versions[].[LastModified,VersionId]' --output table

aws s3api get-object \
  --bucket "$STATE_BUCKET" --key "prod/terraform.tfstate" \
  --version-id "$VERSION_ID" restored.tfstate

terraform -chdir=infra/terraform state push restored.tfstate
```

非現行バージョンは 90 日で削除される（bootstrap の
`noncurrent_version_expiration_days`）。

### bootstrap の state を S3 へ移す（任意）

複数人・複数マシンで扱う場合は、bootstrap 自身の state もバケットへ移せる。
`infra/terraform/bootstrap/backend.tf` を作って init し直す。

```hcl
terraform {
  backend "s3" {
    bucket       = "mimicast-tfstate-123456789012"
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

```bash
terraform -chdir=infra/terraform/bootstrap init -migrate-state
```

自分が管理するバケットへ自分の state を置く形になるが、
バケットは `prevent_destroy` で保護されているため実運用上の問題はない。
