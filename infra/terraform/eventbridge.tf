# 設計 10 章 / NFR-024。
#
# Lambda 側の処理失敗で MediaConvert の完了イベントが失われると、
# 動画が TRANSCODING のまま復旧できなくなるため DLQ を必須とする。

resource "aws_sqs_queue" "event_dlq" {
  name                      = "${local.name_prefix}-mediaconvert-dlq"
  message_retention_seconds = 1209600 # 14 days
  sqs_managed_sse_enabled   = true
}

resource "aws_cloudwatch_event_rule" "mediaconvert" {
  name        = "${local.name_prefix}-mediaconvert-state-change"
  description = "MediaConvert ジョブの完了・失敗を Event Lambda へ渡す"

  event_pattern = jsonencode({
    source        = ["aws.mediaconvert"]
    "detail-type" = ["MediaConvert Job State Change"]
    detail = {
      status = ["COMPLETE", "ERROR"]
    }
  })
}

resource "aws_cloudwatch_event_target" "event_lambda" {
  rule = aws_cloudwatch_event_rule.mediaconvert.name
  arn  = aws_lambda_function.event.arn

  retry_policy {
    maximum_retry_attempts       = 2
    maximum_event_age_in_seconds = 3600
  }

  dead_letter_config {
    arn = aws_sqs_queue.event_dlq.arn
  }
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowInvokeFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.event.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.mediaconvert.arn
}

data "aws_iam_policy_document" "event_dlq" {
  statement {
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.event_dlq.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.mediaconvert.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "event_dlq" {
  queue_url = aws_sqs_queue.event_dlq.id
  policy    = data.aws_iam_policy_document.event_dlq.json
}
