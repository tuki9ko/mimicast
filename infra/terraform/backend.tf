terraform {
  # state は S3 に置く。bucket / key / region はアカウントごとに変わるため、
  # 部分的な backend 設定とし、残りは backend.hcl から渡す。
  #
  #   terraform init -backend-config=backend.hcl
  #
  # backend.hcl の内容は bootstrap モジュールの output から取得できる。
  # backend ブロックでは変数を使えないため、この形にしている。
  backend "s3" {
    encrypt = true

    # S3 ネイティブロック。DynamoDB のロックテーブルは使わない。
    use_lockfile = true
  }
}
