# =============================================================================
# Variáveis de configuração
# =============================================================================

variable "aws_region" {
  description = "Região AWS (sa-east-1 = São Paulo)"
  type        = string
  default     = "sa-east-1"
}

variable "environment" {
  description = "Ambiente (prod, staging)"
  type        = string
  default     = "prod"
}

variable "instance_type" {
  description = "Tipo da instância EC2"
  type        = string
  default     = "t3.small"
}

variable "key_pair_name" {
  description = "Nome do Key Pair AWS para acesso SSH"
  type        = string
}

variable "domain_name" {
  description = "Domínio principal (ex: meu-foodtruck.com.br). Deixe vazio se não tiver domínio."
  type        = string
  default     = ""
}

variable "ssh_allowed_cidrs" {
  description = "CIDRs permitidos para acesso SSH (ex: [\"SEU_IP/32\"])"
  type        = list(string)
  default     = []
}

variable "root_volume_size" {
  description = "Tamanho do disco raiz da EC2 (GB)"
  type        = number
  default     = 20
}

variable "data_volume_size" {
  description = "Tamanho do volume EBS para dados persistentes (GB)"
  type        = number
  default     = 5
}

variable "backup_retention_days" {
  description = "Dias de retenção dos backups no S3"
  type        = number
  default     = 30
}

variable "enable_backups" {
  description = "Habilitar backup automático para S3"
  type        = bool
  default     = true
}
