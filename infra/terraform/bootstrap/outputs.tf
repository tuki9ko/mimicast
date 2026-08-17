output "state_bucket" {
  description = "Terraform state を置く S3 バケット"
  value       = aws_s3_bucket.state.bucket
}

output "state_key" {
  description = "本体モジュールの state キー"
  value       = "${var.env}/terraform.tfstate"
}

output "backend_config" {
  description = <<-EOT
    infra/terraform/backend.hcl へ書き込む内容。
      terraform -chdir=infra/terraform/bootstrap output -raw backend_config > infra/terraform/backend.hcl
  EOT
  value       = <<-EOT
    bucket = "${aws_s3_bucket.state.bucket}"
    key    = "${var.env}/terraform.tfstate"
    region = "${var.region}"
  EOT
}
