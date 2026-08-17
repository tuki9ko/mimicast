# ---------------------------------------------------------------------------
# CloudFront アクセスログ
#
# 配信用ディストリビューションでは cs-uri-query を出力しない。
# Signature / Key-Pair-Id が含まれるため。
# 全フィールドを出力する従来形式の標準アクセスログを有効化してはならない。
#
# CloudFront のログ配信設定は us-east-1 で作成する必要がある。
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_delivery_source" "video" {
  provider = aws.us_east_1

  name         = "${local.name_prefix}-video-access-logs"
  log_type     = "ACCESS_LOGS"
  resource_arn = aws_cloudfront_distribution.video.arn
}

resource "aws_cloudwatch_log_delivery_destination" "s3" {
  provider = aws.us_east_1

  name          = "${local.name_prefix}-log-bucket"
  output_format = "json"

  delivery_destination_configuration {
    destination_resource_arn = aws_s3_bucket.logs.arn
  }
}

resource "aws_cloudwatch_log_delivery" "video" {
  provider = aws.us_east_1

  delivery_source_name     = aws_cloudwatch_log_delivery_source.video.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.s3.arn

  # cs-uri-query / cs(Referer) / cs(Cookie) は出力しない
  record_fields = [
    "timestamp",
    "c-ip",
    "sc-status",
    "cs-method",
    "cs-uri-stem",
    "sc-bytes",
    "time-taken",
    "x-edge-result-type",
  ]

  s3_delivery_configuration {
    suffix_path                 = "/cloudfront/video/{yyyy}/{MM}/{dd}"
    enable_hive_compatible_path = false
  }

  depends_on = [aws_s3_bucket_policy.logs]
}

resource "aws_cloudwatch_log_delivery_source" "admin" {
  provider = aws.us_east_1

  name         = "${local.name_prefix}-admin-access-logs"
  log_type     = "ACCESS_LOGS"
  resource_arn = aws_cloudfront_distribution.admin.arn
}

resource "aws_cloudwatch_log_delivery" "admin" {
  provider = aws.us_east_1

  delivery_source_name     = aws_cloudwatch_log_delivery_source.admin.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.s3.arn

  record_fields = [
    "timestamp",
    "c-ip",
    "sc-status",
    "cs-method",
    "cs-uri-stem",
    "cs-uri-query",
    "sc-bytes",
    "time-taken",
    "x-edge-result-type",
    "cs(User-Agent)",
  ]

  s3_delivery_configuration {
    suffix_path                 = "/cloudfront/admin/{yyyy}/{MM}/{dd}"
    enable_hive_compatible_path = false
  }

  depends_on = [aws_s3_bucket_policy.logs]
}
