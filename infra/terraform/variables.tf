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
  description = "配信用のドメイン（例: video.example.jp）"
  type        = string
}

variable "admin_domain" {
  description = "管理画面用のドメイン（例: admin.example.jp）"
  type        = string
}

variable "video_zone_name" {
  description = <<-EOT
    video_domain のレコードを作成する Route 53 ホストゾーン名。
    省略時は video_domain 自体をゾーン名として扱う（そのドメインを丸ごと委譲した構成）。
    親ゾーンへまとめて作る場合は "example.jp" のように指定する。
  EOT
  type        = string
  default     = null
}

variable "admin_zone_name" {
  description = <<-EOT
    admin_domain のレコードを作成する Route 53 ホストゾーン名。
    省略時は admin_domain 自体をゾーン名として扱う。
  EOT
  type        = string
  default     = null
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

variable "cognito_mfa_configuration" {
  description = <<-EOT
    Cognito の MFA 設定。既定は必須（TOTP）。
    "ON" 必須 / "OPTIONAL" 任意 / "OFF" 無効
    MFA フローで詰まった場合の退避用に変数化している。
  EOT
  type        = string
  default     = "ON"

  validation {
    condition     = contains(["ON", "OPTIONAL", "OFF"], var.cognito_mfa_configuration)
    error_message = "cognito_mfa_configuration は ON / OPTIONAL / OFF のいずれか。"
  }
}

variable "api_throttling_rate_limit" {
  description = "API のスロットリング（秒あたりのリクエスト数）。管理者 1 名なら小さくてよい"
  type        = number
  default     = 5
}

variable "api_throttling_burst_limit" {
  description = "API のスロットリング（バースト）"
  type        = number
  default     = 10
}

variable "alert_email" {
  description = "CloudWatch Alarm / Budgets の通知先メールアドレス"
  type        = string
}

variable "bucket_suffix" {
  description = <<-EOT
    S3 バケット名へ付ける接尾辞。
    バケット名はグローバルに一意である必要があるため、既定ではアカウント ID を使う。
    タイムスタンプなど任意の文字列でもよい。
  EOT
  type        = string
  default     = null

  validation {
    condition     = var.bucket_suffix == null || can(regex("^[a-z0-9-]*$", var.bucket_suffix))
    error_message = "bucket_suffix は英小文字・数字・ハイフンのみ。"
  }
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
