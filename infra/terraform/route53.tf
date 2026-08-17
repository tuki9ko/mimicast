# 設計 11.3

resource "aws_route53_record" "video_a" {
  zone_id = var.route53_zone_id
  name    = var.video_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.video.domain_name
    zone_id                = aws_cloudfront_distribution.video.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "video_aaaa" {
  zone_id = var.route53_zone_id
  name    = var.video_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.video.domain_name
    zone_id                = aws_cloudfront_distribution.video.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "admin_a" {
  zone_id = var.route53_zone_id
  name    = var.admin_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.admin.domain_name
    zone_id                = aws_cloudfront_distribution.admin.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "admin_aaaa" {
  zone_id = var.route53_zone_id
  name    = var.admin_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.admin.domain_name
    zone_id                = aws_cloudfront_distribution.admin.hosted_zone_id
    evaluate_target_health = false
  }
}
