# Lambda 配布物は事前に `npm run build -w @mimicast/backend` で生成する。
#   packages/backend/dist/api/index.mjs
#   packages/backend/dist/event/index.mjs

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${local.backend_dist}/api"
  output_path = "${path.module}/.build/api.zip"
}

data "archive_file" "event" {
  type        = "zip"
  source_dir  = "${local.backend_dist}/event"
  output_path = "${path.module}/.build/event.zip"
}

resource "aws_cloudwatch_log_group" "api_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "event_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-event"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name = "${local.name_prefix}-api"
  role          = aws_iam_role.api_lambda.arn
  handler       = "index.handler"
  runtime       = var.lambda_runtime
  architectures = ["arm64"]
  memory_size   = 512
  timeout       = 30

  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  environment {
    variables = {
      MEDIA_BUCKET = aws_s3_bucket.media.bucket
      TABLE_NAME   = aws_dynamodb_table.videos.name
      CF_DOMAIN    = local.video_domain

      CF_KEY_PAIR_ID = aws_cloudfront_public_key.signing.id
      # 秘密鍵そのものではなく ARN のみを渡す
      CF_PRIVATE_KEY_SECRET_ARN = aws_secretsmanager_secret.cloudfront_private_key.arn

      MEDIACONVERT_ROLE_ARN = aws_iam_role.mediaconvert.arn
      MAX_UPLOAD_BYTES      = tostring(var.max_upload_bytes)
      ALLOWED_ORIGIN        = local.admin_origin
      LOG_LEVEL             = "info"
    }
  }

  depends_on = [
    aws_iam_role_policy.api_lambda,
    aws_cloudwatch_log_group.api_lambda,
  ]
}

resource "aws_lambda_function" "event" {
  function_name = "${local.name_prefix}-event"
  role          = aws_iam_role.event_lambda.arn
  handler       = "index.handler"
  runtime       = var.lambda_runtime
  architectures = ["arm64"]
  memory_size   = 256
  timeout       = 30

  filename         = data.archive_file.event.output_path
  source_code_hash = data.archive_file.event.output_base64sha256

  environment {
    variables = {
      MEDIA_BUCKET = aws_s3_bucket.media.bucket
      TABLE_NAME   = aws_dynamodb_table.videos.name
      LOG_LEVEL    = "info"
    }
  }

  depends_on = [
    aws_iam_role_policy.event_lambda,
    aws_cloudwatch_log_group.event_lambda,
  ]
}
