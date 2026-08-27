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

# =============================================================================
# S3 - Bucket de imagens dos tenants (logos, cardápio, etc.)
# =============================================================================

resource "aws_s3_bucket" "tenant_assets" {
  bucket = "order-system-assets-${data.aws_caller_identity.current.account_id}"

  tags = { Name = "order-system-tenant-assets" }
}

resource "aws_s3_bucket_versioning" "tenant_assets" {
  bucket = aws_s3_bucket.tenant_assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tenant_assets" {
  bucket = aws_s3_bucket.tenant_assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "tenant_assets" {
  bucket = aws_s3_bucket.tenant_assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_public_access_block" "tenant_assets" {
  bucket = aws_s3_bucket.tenant_assets.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "tenant_assets_public_read" {
  bucket     = aws_s3_bucket.tenant_assets.id
  depends_on = [aws_s3_bucket_public_access_block.tenant_assets]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.tenant_assets.arn}/*"
      }
    ]
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "tenant_assets" {
  bucket = aws_s3_bucket.tenant_assets.id

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Data source para obter o account ID
data "aws_caller_identity" "current" {}
