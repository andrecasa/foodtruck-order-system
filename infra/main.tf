# =============================================================================
# Foodtruck Order System - Terraform Infrastructure (AWS EC2 + Docker Compose)
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Descomente para usar S3 como backend remoto (recomendado para time)
  # backend "s3" {
  #   bucket         = "order-system-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "sa-east-1"
  #   dynamodb_table = "terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "order-system"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
