# =============================================================================
# EC2 - Servidor principal
# =============================================================================

# AMI mais recente do Amazon Linux 2023
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = var.key_pair_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  root_block_device {
    volume_size           = var.root_volume_size
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  user_data = base64encode(templatefile("${path.module}/scripts/user-data.sh", {
    data_device     = "/dev/xvdf"
    data_mount_path = "/mnt/app-data"
    aws_region      = var.aws_region
    environment     = var.environment
  }))

  tags = { Name = "order-system-${var.environment}" }

  lifecycle {
    ignore_changes = [ami, user_data]
  }
}

# IP Elástico (fixo)
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = { Name = "order-system-eip" }
}

# =============================================================================
# EBS Volume - Dados persistentes (PostgreSQL, Evolution API)
# =============================================================================

resource "aws_ebs_volume" "data" {
  availability_zone = aws_instance.app.availability_zone
  size              = var.data_volume_size
  type              = "gp3"
  encrypted         = true

  tags = { Name = "order-system-data" }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.app.id
}
