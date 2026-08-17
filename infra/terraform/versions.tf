terraform {
  # S3 backend のネイティブロック（use_lockfile）を使うため 1.10 以上を要求する
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.6"
    }
  }
}
