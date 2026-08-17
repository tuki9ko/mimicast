provider "aws" {
  region = var.region

  default_tags {
    tags = local.tags
  }
}

# CloudFront で利用する ACM 証明書は us-east-1 で発行する必要がある。
# CloudFront のメトリクスも us-east-1 に存在するため、該当 Alarm もこちらへ作成する。
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.tags
  }
}
