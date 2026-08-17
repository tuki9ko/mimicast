output "state_bucket" {
  description = "Terraform state を置く S3 バケット"
  value       = aws_s3_bucket.state.bucket
}

output "state_key" {
  description = "本体モジュールの state キー"
  value       = "${var.env}/terraform.tfstate"
}

output "hosted_zone_id" {
  description = "本体モジュールが data source で引く Route 53 ホストゾーン"
  value       = aws_route53_zone.main.zone_id
}

output "name_servers" {
  description = "ドメイン側へ登録する NS レコードの値（4 本）"
  value       = aws_route53_zone.main.name_servers
}

output "ns_delegation_setup" {
  description = "ドメイン側で行う委譲設定の内容"
  value       = <<-EOT
    Route 53 のゾーン "${var.dns_zone_name}" を作成した。
    ドメインを管理している側で、以下のネームサーバー 4 本を登録すると委譲が有効になる。

    ${join("\n", [for ns in aws_route53_zone.main.name_servers : "      - ${ns}"])}

    サブドメインを委譲する場合（例: ${var.dns_zone_name}）:
      親ゾーンの DNS に NS レコードを追加する。
        Type: NS
        Name: ${var.dns_zone_name}   （相対名で入力する DNS では先頭のラベルのみ）
        Value: 上記 4 本

    ドメイン全体を Route 53 で引く場合:
      DNS レコードではなく、レジストラのネームサーバー設定を上記 4 本へ変更する。

    いずれの場合も、DNS はレコードをそのまま引く設定にすること
    （プロキシ型 CDN や URL 転送を経由させると配信経路が変わる）。

    確認:
      dig +short NS ${var.dns_zone_name}
  EOT
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
