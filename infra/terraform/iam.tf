# すべての IAM Role は最小権限とする（NFR-006 / 制約 11）。

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------------------------------------------------------------------------
# MediaConvert 実行ロール
#   source/*  -> GetObject
#   videos/*  -> PutObject
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "mediaconvert_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["mediaconvert.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "mediaconvert" {
  name               = "${local.name_prefix}-mediaconvert"
  assume_role_policy = data.aws_iam_policy_document.mediaconvert_assume_role.json
}

data "aws_iam_policy_document" "mediaconvert" {
  statement {
    sid       = "ReadSource"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/${local.source_prefix}*"]
  }

  statement {
    sid       = "WriteOutput"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.media.arn}/${local.output_prefix}*"]
  }

  statement {
    sid       = "GetBucketLocation"
    effect    = "Allow"
    actions   = ["s3:GetBucketLocation"]
    resources = [aws_s3_bucket.media.arn]
  }
}

resource "aws_iam_role_policy" "mediaconvert" {
  name   = "media-access"
  role   = aws_iam_role.mediaconvert.id
  policy = data.aws_iam_policy_document.mediaconvert.json
}

# ---------------------------------------------------------------------------
# API Lambda
# ---------------------------------------------------------------------------

resource "aws_iam_role" "api_lambda" {
  name               = "${local.name_prefix}-api-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "api_lambda" {
  statement {
    sid    = "Logs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.api_lambda.arn}:*"]
  }

  statement {
    sid    = "DynamoDB"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.videos.arn,
      "${aws_dynamodb_table.videos.arn}/index/GSI1",
    ]
  }

  # 元動画のアップロード（Presigned Multipart）と削除。
  # 配信用オブジェクトの取得権限は与えない。
  statement {
    sid    = "SourceObjects"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.media.arn}/${local.source_prefix}*"]
  }

  # 動画削除時に配信用オブジェクトも消す
  statement {
    sid       = "DeleteOutputObjects"
    effect    = "Allow"
    actions   = ["s3:DeleteObject"]
    resources = ["${aws_s3_bucket.media.arn}/${local.output_prefix}*"]
  }

  statement {
    sid       = "ListMediaBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${local.source_prefix}*", "${local.output_prefix}*"]
    }
  }

  statement {
    sid    = "MediaConvertJobs"
    effect = "Allow"
    actions = [
      "mediaconvert:CreateJob",
      "mediaconvert:CancelJob",
      "mediaconvert:GetJob",
      "mediaconvert:DescribeEndpoints",
    ]
    resources = [
      "arn:aws:mediaconvert:${var.region}:${local.account_id}:queues/*",
      "arn:aws:mediaconvert:${var.region}:${local.account_id}:jobs/*",
      "arn:aws:mediaconvert:${var.region}:${local.account_id}:presets/*",
    ]
  }

  statement {
    sid       = "PassMediaConvertRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.mediaconvert.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["mediaconvert.amazonaws.com"]
    }
  }

  # CloudFront 署名秘密鍵の取得（対象 Secret へ限定）
  statement {
    sid       = "ReadSigningKey"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.cloudfront_private_key.arn]
  }
}

resource "aws_iam_role_policy" "api_lambda" {
  name   = "api-access"
  role   = aws_iam_role.api_lambda.id
  policy = data.aws_iam_policy_document.api_lambda.json
}

# ---------------------------------------------------------------------------
# Event Lambda
#   DynamoDB UpdateItem と videos/* の HeadObject のみ
# ---------------------------------------------------------------------------

resource "aws_iam_role" "event_lambda" {
  name               = "${local.name_prefix}-event-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "event_lambda" {
  statement {
    sid    = "Logs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.event_lambda.arn}:*"]
  }

  statement {
    sid       = "DynamoDB"
    effect    = "Allow"
    actions   = ["dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.videos.arn]
  }

  # HeadObject には s3:GetObject 権限が必要
  statement {
    sid       = "HeadOutputObject"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/${local.output_prefix}*"]
  }
}

resource "aws_iam_role_policy" "event_lambda" {
  name   = "event-access"
  role   = aws_iam_role.event_lambda.id
  policy = data.aws_iam_policy_document.event_lambda.json
}
