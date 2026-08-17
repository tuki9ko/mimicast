variable "project" {
  description = "リソース名のプレフィックス"
  type        = string
  default     = "mimicast"
}

variable "region" {
  description = "state バケットを作るリージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "env" {
  description = "state キーのプレフィックスに使う環境名。バケットは環境間で共用する"
  type        = string
  default     = "prod"
}

variable "bucket_name" {
  description = <<-EOT
    state バケット名。未指定なら "{project}-tfstate-{account_id}" を使う。
    S3 のバケット名はグローバルに一意である必要があるため、既定でアカウント ID を付ける。
  EOT
  type        = string
  default     = null
}

variable "noncurrent_version_expiration_days" {
  description = "古い state（非現行バージョン）を削除するまでの日数"
  type        = number
  default     = 90
}
