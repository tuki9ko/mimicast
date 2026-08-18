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

  video_domain = var.video_domain
  admin_domain = var.admin_domain

  # レコードを置くゾーン。ドメインごとに別のゾーンでも、共通の親ゾーンでもよい。
  video_zone_id = data.aws_route53_zone.video.zone_id
  admin_zone_id = data.aws_route53_zone.admin.zone_id

  admin_origin = "https://${local.admin_domain}"

  # media bucket の CORS で許可するオリジン。"*" は使用しない。
  cors_allowed_origins = concat([local.admin_origin], var.allowed_dev_origins)

  # S3 キーのプレフィックス。配信パスと 1 対 1 で対応する。
  source_prefix = "source/"
  output_prefix = "videos/"

  # バックエンドのビルド成果物
  backend_dist = "${path.module}/../../packages/backend/dist"

  # 管理画面の CSP。
  #
  # 通信先を明示的に列挙する。これを落とすと以下が壊れるため注意する。
  #   connect-src の API   -> 管理 API 呼び出し
  #   connect-src の Cognito -> ログイン
  #   connect-src の S3    -> ブラウザから直接送る Multipart Upload
  #   media-src の blob:   -> 元動画の解像度取得（createObjectURL した video 要素）
  #
  # style-src に 'unsafe-inline' が必要なのは、React が style 属性を直接付けるため
  # （進捗バーの幅など）。script-src は 'self' のみで絞る。
  admin_csp = join("; ", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "media-src 'self' blob:",
    join(" ", [
      "connect-src 'self'",
      aws_apigatewayv2_api.api.api_endpoint,
      "https://cognito-idp.${var.region}.amazonaws.com",
      "https://${aws_s3_bucket.media.bucket_regional_domain_name}",
    ]),
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ])

  # 公開鍵はファイル指定を優先する。貼り付けミス（インデントや改行）を避けられる。
  #
  # 値は加工せずそのまま渡す。trimspace などで整形すると、末尾の改行の有無だけで
  # CloudFront Public Key の差分（= 置き換え）が発生する。
  cloudfront_public_key = (
    var.cloudfront_public_key_path != null
    ? file("${path.module}/${var.cloudfront_public_key_path}")
    : coalesce(var.cloudfront_public_key, "")
  )
}
