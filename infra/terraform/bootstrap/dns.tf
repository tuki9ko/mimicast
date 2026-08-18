# ---------------------------------------------------------------------------
# Route 53 ホストゾーン
#
# ドメインは利用者が各自で用意する（レジストラは問わない）。
# ここでは Route 53 側のゾーンだけを作り、出力された NS レコードを
# ドメインを管理している側へ登録してもらう。
#
# 作るゾーンは構成によって変わる。
#
#   ドメイン全体を Route 53 で引く
#     dns_zone_names = ["example.jp"]
#     レジストラのネームサーバー設定を 4 本へ変更する
#
#   配信用と管理画面用だけを委譲する
#     dns_zone_names = ["video.example.jp", "admin.example.jp"]
#     親ゾーンの DNS へ NS レコードをゾーンごとに 4 本追加する
#     レジストラがネームサーバーの変更を許さない場合（Cloudflare Registrar など）や、
#     ドメインを他の用途でも使っている場合はこちら
#
# 本体（infra/terraform）は data source でゾーンを引くため、
# 委譲が済む前に apply すると ACM の DNS 検証で止まる。先にこちらを済ませる。
# ---------------------------------------------------------------------------

resource "aws_route53_zone" "main" {
  for_each = toset(var.dns_zone_names)

  name    = each.value
  comment = "${var.project} (delegated)"

  # 作り直すと NS が変わり、ドメイン側の再登録が必要になるため保護する
  lifecycle {
    prevent_destroy = true
  }
}
