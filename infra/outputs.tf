# =============================================================================
# Outputs - Informações úteis após deploy
# =============================================================================

output "public_ip" {
  description = "IP público fixo da instância"
  value       = aws_eip.app.public_ip
}

output "ssh_command" {
  description = "Comando para conectar via SSH"
  value       = "ssh -i ~/.ssh/${var.key_pair_name}.pem ec2-user@${aws_eip.app.public_ip}"
}

output "app_url" {
  description = "URL da aplicação (HTTP)"
  value       = "http://${aws_eip.app.public_ip}"
}

output "app_url_domain" {
  description = "URL com domínio (se configurado)"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "Domínio não configurado"
}

output "backup_bucket" {
  description = "Bucket S3 de backups"
  value       = var.enable_backups ? aws_s3_bucket.backups[0].bucket : "Backups desabilitados"
}

output "assets_bucket" {
  description = "Bucket S3 de imagens dos tenants"
  value       = aws_s3_bucket.tenant_assets.bucket
}

output "assets_bucket_url" {
  description = "URL base para acessar imagens dos tenants"
  value       = "https://${aws_s3_bucket.tenant_assets.bucket}.s3.${var.aws_region}.amazonaws.com"
}

output "instance_id" {
  description = "ID da instância EC2"
  value       = aws_instance.app.id
}

output "ssm_connect" {
  description = "Comando para conectar via SSM (sem SSH key)"
  value       = "aws ssm start-session --target ${aws_instance.app.id} --region ${var.aws_region}"
}
