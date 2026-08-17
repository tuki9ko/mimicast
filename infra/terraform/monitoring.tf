# 通知先は SNS -> メール。

resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# CloudFront のメトリクスは us-east-1 にあるため、Alarm もそちらへ作る
resource "aws_sns_topic" "alerts_us_east_1" {
  provider = aws.us_east_1
  name     = "${local.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email_us_east_1" {
  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.alerts_us_east_1.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "api_lambda_errors" {
  alarm_name          = "${local.name_prefix}-api-lambda-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "event_lambda_errors" {
  alarm_name          = "${local.name_prefix}-event-lambda-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.event.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# DLQ にメッセージが入った = 完了イベントを取りこぼしている
resource "aws_cloudwatch_metric_alarm" "event_dlq_messages" {
  alarm_name          = "${local.name_prefix}-event-dlq-messages"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.event_dlq.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "mediaconvert_errors" {
  alarm_name          = "${local.name_prefix}-mediaconvert-job-errors"
  namespace           = "AWS/MediaConvert"
  metric_name         = "JobsErroredCount"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "video_cf_5xx" {
  provider = aws.us_east_1

  alarm_name          = "${local.name_prefix}-video-cf-5xx"
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = aws_cloudfront_distribution.video.id
    Region         = "Global"
  }

  alarm_actions = [aws_sns_topic.alerts_us_east_1.arn]
}

# 想定月間転送量の 1/10 を 1 日で超えたら通知
resource "aws_cloudwatch_metric_alarm" "video_cf_bytes" {
  provider = aws.us_east_1

  alarm_name          = "${local.name_prefix}-video-cf-bytes-downloaded"
  namespace           = "AWS/CloudFront"
  metric_name         = "BytesDownloaded"
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = var.expected_monthly_transfer_gb / 10 * 1024 * 1024 * 1024
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = aws_cloudfront_distribution.video.id
    Region         = "Global"
  }

  alarm_actions = [aws_sns_topic.alerts_us_east_1.arn]
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.alert_email]
    }
  }
}
