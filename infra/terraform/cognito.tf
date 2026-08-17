# 設計 17 章。
# 自己登録は無効。管理者ユーザーは AWS コンソールまたは CLI で作成する。

resource "aws_cognito_user_pool" "admin" {
  name = "${local.name_prefix}-admin"

  # 自己登録を禁止する（FR-001）
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # user_pool_add_ons {
  #   advanced_security_mode = "AUDIT"
  # }
}

resource "aws_cognito_user_pool_client" "admin" {
  name         = "${local.name_prefix}-admin-web"
  user_pool_id = aws_cognito_user_pool.admin.id

  # パブリッククライアント（SPA）なのでシークレットは持たせない
  generate_secret = false

  # SRP のみ許可する。パスワードを直接送る USER_PASSWORD_AUTH は有効化しない。
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  id_token_validity      = 1
  access_token_validity  = 1
  refresh_token_validity = 30

  token_validity_units {
    id_token      = "hours"
    access_token  = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}
