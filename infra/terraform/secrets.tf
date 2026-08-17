#
# Terraform で管理するのは Secret の「入れ物」のみとし、値（秘密鍵）は管理外とする。
# 秘密鍵を Terraform State へ平文で保存してはならない。
#
# 値の投入:
#   aws secretsmanager put-secret-value \
#     --secret-id /mimicast/{env}/cloudfront/private-key \
#     --secret-string file://private_key.pem

resource "aws_secretsmanager_secret" "cloudfront_private_key" {
  name        = "/${var.project}/${var.env}/cloudfront/private-key"
  description = "CloudFront Signed URL 署名用の秘密鍵（値は Terraform 管理外）"

  recovery_window_in_days = 7
}
