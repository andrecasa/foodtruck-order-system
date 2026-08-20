# =============================================================================
# S3 - Bucket de backups
# =============================================================================

resource "aws_s3_bucket" "backups" {
  count  = var.enable_backups ? 1 : 0
  bucket = "order-system-backups-${data.aws_caller_identity.current.account_id}"

  tags = { Name = "order-system-backups" }
}

resource "aws_s3_bucket_versioning" "backups" {
  count  = var.enable_backups ? 1 : 0
  bucket = aws_s3_bucket.backups[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  count  = var.enable_backups ? 1 : 0
  bucket = aws_s3_bucket.backups[0].id

  rule {
    id     = "expire-old-backups"
    status = "Enabled"

    filter {}

    expiration {
      days = var.backup_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  count  = var.enable_backups ? 1 : 0
  bucket = aws_s3_bucket.backups[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  count  = var.enable_backups ? 1 : 0
  bucket = aws_s3_bucket.backups[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Data source para obter o account ID
data "aws_caller_identity" "current" {}
