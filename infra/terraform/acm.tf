# CloudFront のカスタムドメインを使うため、証明書は us-east-1 で発行する（NFR-020）。

resource "aws_acm_certificate" "video" {
  provider = aws.us_east_1

  domain_name       = local.video_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "video_cert_validation" {
  for_each = {
    for option in aws_acm_certificate.video.domain_validation_options :
    option.domain_name => {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  }

  zone_id         = local.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.value]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "video" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.video.arn
  validation_record_fqdns = [for record in aws_route53_record.video_cert_validation : record.fqdn]
}

resource "aws_acm_certificate" "admin" {
  provider = aws.us_east_1

  domain_name       = local.admin_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "admin_cert_validation" {
  for_each = {
    for option in aws_acm_certificate.admin.domain_validation_options :
    option.domain_name => {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  }

  zone_id         = local.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.value]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "admin" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.admin.arn
  validation_record_fqdns = [for record in aws_route53_record.admin_cert_validation : record.fqdn]
}
