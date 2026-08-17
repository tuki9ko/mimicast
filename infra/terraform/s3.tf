# ---------------------------------------------------------------------------
# media bucket（元動画・変換済み動画）
#
# 設計 4 章。動画用と管理画面静的ファイル用でバケットを分離する（制約 15）。
# CORS 設定はバケット単位でしか行えないため、統合してはならない。
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "media" {
  bucket = local.media_bucket_name
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# ブラウザからの Multipart Upload 用（NFR-012）。
# ExposeHeaders の ETag は必須。これがないと CompleteMultipartUpload に必要な
# ETag をブラウザから読み取れず、アップロードが完了しない（制約 27）。
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_origins = local.cors_allowed_origins
    allowed_methods = ["PUT", "POST", "DELETE", "GET", "HEAD"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# 未完了 Multipart Upload はストレージ課金が継続するため必ず回収する（NFR-013）
resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "abort-incomplete-multipart-upload"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = var.incomplete_multipart_upload_days
    }
  }
}

# 許可するのは以下の 3 つのみ（設計 4.3）。
#   1. 配信用 CloudFront の OAC による videos/* への GetObject
#   2. MediaConvert 実行ロールによる source/* への GetObject
#   3. MediaConvert 実行ロールによる videos/* への PutObject
# 管理画面用 CloudFront からのアクセスは許可しない。
data "aws_iam_policy_document" "media_bucket" {
  statement {
    sid     = "AllowVideoDistributionOAC"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.media.arn}/${local.output_prefix}*",
    ]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.video.arn]
    }
  }

  statement {
    sid     = "AllowMediaConvertRead"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.media.arn}/${local.source_prefix}*",
    ]

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.mediaconvert.arn]
    }
  }

  statement {
    sid     = "AllowMediaConvertWrite"
    effect  = "Allow"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.media.arn}/${local.output_prefix}*",
    ]

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.mediaconvert.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.media]
}

# ---------------------------------------------------------------------------
# admin-site bucket（管理画面の静的ファイル）
#
# CORS は設定しない（設計 4.8）。
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "admin_site" {
  bucket = local.admin_site_bucket_name
}

resource "aws_s3_bucket_public_access_block" "admin_site" {
  bucket = aws_s3_bucket.admin_site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "admin_site" {
  bucket = aws_s3_bucket.admin_site.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "admin_site" {
  bucket = aws_s3_bucket.admin_site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

data "aws_iam_policy_document" "admin_site_bucket" {
  statement {
    sid       = "AllowAdminDistributionOAC"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.admin_site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.admin.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.admin_site.arn, "${aws_s3_bucket.admin_site.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "admin_site" {
  bucket = aws_s3_bucket.admin_site.id
  policy = data.aws_iam_policy_document.admin_site_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.admin_site]
}

# ---------------------------------------------------------------------------
# logs bucket（CloudFront アクセスログの配信先）
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "logs" {
  bucket = local.logs_bucket_name
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "expire-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = 90
    }
  }
}

data "aws_iam_policy_document" "logs_bucket" {
  statement {
    sid       = "AllowLogDelivery"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.logs.arn, "${aws_s3_bucket.logs.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = data.aws_iam_policy_document.logs_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.logs]
}
