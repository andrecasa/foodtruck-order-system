# =============================================================================
# Security Groups
# =============================================================================

resource "aws_security_group" "app" {
  name        = "order-system-app-sg"
  description = "Security group para a aplicacao do food truck"
  vpc_id      = aws_vpc.main.id

  # HTTP
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH (restrito ao IP do operador — se nenhum CIDR fornecido, SSH fica fechado; use SSM)
  dynamic "ingress" {
    for_each = length(var.ssh_allowed_cidrs) > 0 ? [1] : []
    content {
      description = "SSH restrito"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = var.ssh_allowed_cidrs
    }
  }

  # PostgreSQL (restrito ao IP do operador)
  dynamic "ingress" {
    for_each = length(var.ssh_allowed_cidrs) > 0 ? [1] : []
    content {
      description = "PostgreSQL Restrito"
      from_port   = 5432
      to_port     = 5432
      protocol    = "tcp"
      cidr_blocks = var.ssh_allowed_cidrs
    }
  }

  # Todo tráfego de saída
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "order-system-app-sg" }
}
