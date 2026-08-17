# ---------------------------------------------------------------------------
# 管理画面用 CloudFront（設計 11.2）
#
# SPA フォールバック（403/404 -> /index.html 200）はこちらにのみ設定する。
# このディストリビューションから media bucket へは到達できない（Bucket Policy で許可しない）。
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "admin_site" {
  name                              = "${local.name_prefix}-admin-site-oac"
  description                       = "OAC for admin site bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "admin" {
  name    = "${local.name_prefix}-admin-headers"
  comment = "Security headers for admin site"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "same-origin"
      override        = true
    }
  }
}

resource "aws_cloudfront_distribution" "admin" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name_prefix} admin site"
  aliases             = [var.admin_domain]
  price_class         = var.cloudfront_price_class
  http_version        = "http2and3"
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.admin_site.bucket_regional_domain_name
    origin_id                = "admin-site"
    origin_access_control_id = aws_cloudfront_origin_access_control.admin_site.id
  }

  default_cache_behavior {
    target_origin_id       = "admin-site"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # Managed-CachingOptimized
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.admin.id

    # Trusted Key Group は設定しない
  }

  # SPA フォールバック。配信用ディストリビューションには絶対に設定しないこと。
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.admin.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
