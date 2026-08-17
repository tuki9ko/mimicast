output "api_base_url" {
  description = "フロントエンドの VITE_API_BASE_URL に設定する値"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "cognito_user_pool_id" {
  description = "VITE_COGNITO_USER_POOL_ID"
  value       = aws_cognito_user_pool.admin.id
}

output "cognito_client_id" {
  description = "VITE_COGNITO_CLIENT_ID"
  value       = aws_cognito_user_pool_client.admin.id
}

output "media_bucket" {
  value = aws_s3_bucket.media.bucket
}

output "admin_site_bucket" {
  description = "フロントエンドのビルド成果物をアップロードする先"
  value       = aws_s3_bucket.admin_site.bucket
}

output "video_distribution_id" {
  value = aws_cloudfront_distribution.video.id
}

output "admin_distribution_id" {
  description = "管理画面デプロイ後の Invalidation に使う"
  value       = aws_cloudfront_distribution.admin.id
}

output "cloudfront_key_pair_id" {
  description = "Signed URL の Key-Pair-Id"
  value       = aws_cloudfront_public_key.signing.id
}

output "cloudfront_private_key_secret_name" {
  description = "秘密鍵を投入する Secrets Manager のシークレット名"
  value       = aws_secretsmanager_secret.cloudfront_private_key.name
}

output "mediaconvert_role_arn" {
  value = aws_iam_role.mediaconvert.arn
}

output "admin_url" {
  value = "https://${var.admin_domain}"
}

output "video_url_prefix" {
  value = "https://${var.video_domain}/videos"
}
