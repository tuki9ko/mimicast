# ---------------------------------------------------------------------------
# 配信用 CloudFront
#
# 最重要制約:
#   - Custom Error Response を設定しない
#     403 が index.html の 200 へ置き換わり、アクセス拒否が成立しなくなるため。
#   - 管理画面用ディストリビューションと統合しない
#   - Cache Policy でクエリ文字列をキャッシュキーへ含めない
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${local.name_prefix}-media-oac"
  description                       = "OAC for media bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Signed URL 検証用の公開鍵。秘密鍵は Secrets Manager にのみ置く。
resource "aws_cloudfront_public_key" "signing" {
  name        = "${local.name_prefix}-signing-key"
  comment     = "mimicast signed URL public key"
  encoded_key = local.cloudfront_public_key

  lifecycle {
    create_before_destroy = true

    # CloudFront は不正な鍵を 400 で返すだけなので、plan の時点で止める
    precondition {
      condition = can(
        regex("^-----BEGIN PUBLIC KEY-----[\\sA-Za-z0-9+/=]+-----END PUBLIC KEY-----$",
        local.cloudfront_public_key)
      )
      error_message = <<-EOT
        cloudfront_public_key に有効な PEM 公開鍵が設定されていない。
        鍵ペアを生成し、cloudfront_public_key_path でファイルを指定するか、
        cloudfront_public_key へ PEM 文字列を設定する。

          openssl genrsa -out private_key.pem 2048
          openssl rsa -pubout -in private_key.pem -out public_key.pem
      EOT
    }
  }
}

# Key Group は複数の公開鍵を保持できる。無停止ローテーションはこれを利用する。
resource "aws_cloudfront_key_group" "signing" {
  name  = "${local.name_prefix}-signing-keys"
  items = [aws_cloudfront_public_key.signing.id]
}

# Signed URL のクエリパラメータ（Expires / Signature / Key-Pair-Id）は
# 署名ごとに異なるため、キャッシュキーへ含めるとキャッシュミスが多発する。
resource "aws_cloudfront_cache_policy" "video" {
  name        = "${local.name_prefix}-video-cache"
  comment     = "No query string in cache key"
  min_ttl     = 1
  default_ttl = 86400
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = false
    enable_accept_encoding_brotli = false

    query_strings_config {
      query_string_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    cookies_config {
      cookie_behavior = "none"
    }
  }
}

# MediaConvert は S3 出力オブジェクトへ Cache-Control を設定できないため、
# 配信用 CloudFront のレスポンスヘッダポリシーで付与する。
resource "aws_cloudfront_response_headers_policy" "video" {
  name    = "${local.name_prefix}-video-headers"
  comment = "Long-term cache headers for video objects"

  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "public,max-age=31536000,immutable"
      override = true
    }
  }

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }

    content_type_options {
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "video" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${local.name_prefix} video delivery"
  aliases         = [local.video_domain]
  price_class     = var.cloudfront_price_class
  http_version    = "http2and3"

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "media"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
    # Origin Path は設定しない（配信パスと S3 キーを 1 対 1 に保つ）
  }

  # /videos/* 以外は S3 の Bucket Policy が許可していないため到達できない
  default_cache_behavior {
    target_origin_id       = "media"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = false

    cache_policy_id            = aws_cloudfront_cache_policy.video.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.video.id

    # 署名なしアクセスを拒否する
    trusted_key_groups = [aws_cloudfront_key_group.signing.id]
  }

  ordered_cache_behavior {
    path_pattern           = "/videos/*"
    target_origin_id       = "media"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = false

    cache_policy_id            = aws_cloudfront_cache_policy.video.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.video.id

    trusted_key_groups = [aws_cloudfront_key_group.signing.id]
  }

  # custom_error_response は設定しない（最重要制約）

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.video.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
