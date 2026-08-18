output "state_bucket" {
  description = "Terraform state を置く S3 バケット"
  value       = aws_s3_bucket.state.bucket
}

output "state_key" {
  description = "本体モジュールの state キー"
  value       = "${var.env}/terraform.tfstate"
}

output "hosted_zone_ids" {
  description = "作成した Route 53 ホストゾーン（ゾーン名 => ID）"
  value       = { for name, zone in aws_route53_zone.main : name => zone.zone_id }
}

output "name_servers" {
  description = "ドメイン側へ登録する NS レコード（ゾーン名 => 4 本）"
  value       = { for name, zone in aws_route53_zone.main : name => zone.name_servers }
}

output "ns_delegation_setup" {
  description = "ドメイン側で行う委譲設定の内容"
  value = <<-EOT
    Route 53 に以下のゾーンを作成した。ドメインを管理している側で
    ネームサーバーを登録すると委譲が有効になる。

    ${join("\n", [
  for name, zone in aws_route53_zone.main :
  join("\n", concat(
    ["    [${name}]"],
    [for ns in zone.name_servers : "      - ${ns}"],
  ))
])}

    ドメイン全体を Route 53 で引く場合:
      レジストラのネームサーバー設定を上記 4 本へ変更する。

    サブドメインだけ委譲する場合:
      親ゾーンの DNS へゾーンごとに NS レコードを追加する。
        Type: NS
        Name: ゾーン名（相対名で入力する DNS では先頭のラベルのみ）
        Value: そのゾーンの 4 本

    いずれの場合も、DNS はレコードをそのまま引く設定にすること
    （プロキシ型 CDN や URL 転送を経由させると配信経路が変わる）。

    確認:
    ${join("\n", [for name, _ in aws_route53_zone.main : "      dig +short NS ${name}"])}
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
