variable "project" {
  description = "リソース名のプレフィックス"
  type        = string
  default     = "mimicast"
}

variable "env" {
  description = "環境名（prod / stg など）"
  type        = string
}

variable "region" {
  description = "主リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "video_domain" {
  description = "配信用 CloudFront のドメイン（例: video.example.jp）"
  type        = string
}

variable "admin_domain" {
  description = "管理画面用 CloudFront のドメイン（例: admin.example.jp）"
  type        = string
}

variable "route53_zone_id" {
  description = "video / admin のレコードを作成する Route 53 ホストゾーン ID"
  type        = string
}

variable "cloudfront_public_key" {
  description = <<-EOT
    CloudFront Signed URL 用の公開鍵（PEM）。
    鍵ペアは手動で生成し、秘密鍵は Secrets Manager へ CLI で投入する。
    秘密鍵を Terraform へ渡してはならない。
  EOT
  type        = string
}

variable "alert_email" {
  description = "CloudWatch Alarm / Budgets の通知先メールアドレス"
  type        = string
}

variable "max_upload_bytes" {
  description = "アップロードサイズの上限（既定 64 GiB）"
  type        = number
  default     = 68719476736
}

variable "allowed_dev_origins" {
  description = "ローカル開発用に CORS を許可するオリジン（例: [\"http://localhost:5173\"]）"
  type        = list(string)
  default     = []
}

variable "cloudfront_price_class" {
  description = "CloudFront の価格クラス。日本を含む最小構成は PriceClass_200"
  type        = string
  default     = "PriceClass_200"
}

variable "lambda_runtime" {
  description = "Lambda ランタイム"
  type        = string
  default     = "nodejs22.x"
}

variable "log_retention_days" {
  description = "CloudWatch Logs の保持期間"
  type        = number
  default     = 30
}

variable "monthly_budget_usd" {
  description = "AWS Budgets の月額予算（USD）"
  type        = number
  default     = 50
}

variable "expected_monthly_transfer_gb" {
  description = "想定月間 CloudFront 転送量（GB）。転送量アラームのしきい値算出に使う"
  type        = number
  default     = 100
}

variable "incomplete_multipart_upload_days" {
  description = "未完了 Multipart Upload を破棄するまでの日数（NFR-013）"
  type        = number
  default     = 7
}
