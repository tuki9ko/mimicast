data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project}-${var.env}"

  tags = {
    Project     = var.project
    Environment = var.env
    ManagedBy   = "terraform"
  }

  account_id = data.aws_caller_identity.current.account_id

  media_bucket_name      = "${local.name_prefix}-media"
  admin_site_bucket_name = "${local.name_prefix}-admin-site"
  logs_bucket_name       = "${local.name_prefix}-logs"

  # ドメインはゾーン名から組み立てる（ゾーンとレコードの食い違いを防ぐ）
  video_domain = "${var.video_subdomain}.${var.dns_zone_name}"
  admin_domain = "${var.admin_subdomain}.${var.dns_zone_name}"

  zone_id = data.aws_route53_zone.main.zone_id

  admin_origin = "https://${local.admin_domain}"

  # media bucket の CORS で許可するオリジン。"*" は使用しない。
  cors_allowed_origins = concat([local.admin_origin], var.allowed_dev_origins)

  # S3 キーのプレフィックス。配信パスと 1 対 1 で対応する。
  source_prefix = "source/"
  output_prefix = "videos/"

  # バックエンドのビルド成果物
  backend_dist = "${path.module}/../../packages/backend/dist"

  # 公開鍵はファイル指定を優先する。貼り付けミス（インデントや改行）を避けられる。
  cloudfront_public_key = trimspace(
    var.cloudfront_public_key_path != null
    ? file("${path.module}/${var.cloudfront_public_key_path}")
    : coalesce(var.cloudfront_public_key, "")
  )
}
