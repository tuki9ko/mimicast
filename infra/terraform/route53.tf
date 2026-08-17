#
# ホストゾーンは bootstrap モジュールが作成する（ドメイン側へ NS を登録して委譲する）。
# ここでは参照のみ。ゾーンが無ければ apply は即座に失敗するため、
# 委譲前に apply して ACM の検証待ちで固まることを避けられる。
data "aws_route53_zone" "main" {
  name         = var.dns_zone_name
  private_zone = false
}

resource "aws_route53_record" "video_a" {
  zone_id = local.zone_id
  name    = local.video_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.video.domain_name
    zone_id                = aws_cloudfront_distribution.video.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "video_aaaa" {
  zone_id = local.zone_id
  name    = local.video_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.video.domain_name
    zone_id                = aws_cloudfront_distribution.video.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "admin_a" {
  zone_id = local.zone_id
  name    = local.admin_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.admin.domain_name
    zone_id                = aws_cloudfront_distribution.admin.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "admin_aaaa" {
  zone_id = local.zone_id
  name    = local.admin_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.admin.domain_name
    zone_id                = aws_cloudfront_distribution.admin.hosted_zone_id
    evaluate_target_health = false
  }
}
