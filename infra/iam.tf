# =============================================================================
# IAM - Permissões da EC2
# =============================================================================

resource "aws_iam_role" "ec2_role" {
  name = "order-system-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# Permissão para upload de backups no S3
resource "aws_iam_role_policy" "s3_backup" {
  count = var.enable_backups ? 1 : 0
  name  = "s3-backup-access"
  role  = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          aws_s3_bucket.backups[0].arn,
          "${aws_s3_bucket.backups[0].arn}/*"
        ]
      }
    ]
  })
}

# SSM para acesso sem SSH (opcional, mais seguro)
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "order-system-ec2-profile"
  role = aws_iam_role.ec2_role.name
}
