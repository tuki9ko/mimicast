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

variable "dns_zone_name" {
  description = <<-EOT
    レコードを作成する Route 53 ホストゾーン名（例: vrc.example.jp）。
    ゾーンは bootstrap モジュールが作成し、ここでは data source で参照する。
    委譲（ドメイン側への NS 登録）が済んでいない状態で apply すると、
    ACM の DNS 検証で待ち続けることになる。
  EOT
  type        = string
}

variable "video_subdomain" {
  description = "配信用ドメインのラベル。既定では video.{dns_zone_name} になる"
  type        = string
  default     = "video"
}

variable "admin_subdomain" {
  description = "管理画面用ドメインのラベル。既定では admin.{dns_zone_name} になる"
  type        = string
  default     = "admin"
}

variable "cloudfront_public_key_path" {
  description = <<-EOT
    CloudFront Signed URL 用の公開鍵 PEM のパス（このディレクトリからの相対パス）。
    例: "../../public_key.pem"
    cloudfront_public_key とどちらか一方を指定する。
  EOT
  type        = string
  default     = null
}

variable "cloudfront_public_key" {
  description = <<-EOT
    CloudFront Signed URL 用の公開鍵（PEM 文字列）。
    ファイルから読ませる場合は cloudfront_public_key_path を使う。
    鍵ペアは手動で生成し、秘密鍵は Secrets Manager へ CLI で投入する。
    秘密鍵を Terraform へ渡してはならない。
  EOT
  type        = string
  default     = null
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
  description = "未完了 Multipart Upload を破棄するまでの日数"
  type        = number
  default     = 7
}
