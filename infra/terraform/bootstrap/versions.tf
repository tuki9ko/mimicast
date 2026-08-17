terraform {
  # S3 ネイティブロック（use_lockfile）を使うため 1.10 以上を要求する
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # このモジュールの state はローカルに置く（バケットを作る側なので S3 へは置けない）。
  # 作成後に S3 へ移したい場合は README の手順を参照。
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.tags
  }
}
