#!/bin/bash
# =============================================================================
# User Data - Executa na primeira inicialização da EC2
# =============================================================================
set -euo pipefail

echo ">>> Atualizando sistema..."
dnf update -y

echo ">>> Instalando Docker..."
dnf install -y docker git cronie
systemctl enable docker crond
systemctl start docker crond

echo ">>> Instalando Docker Compose plugin..."
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# O buildx que vem no pacote 'docker' do AL2023 é antigo (0.12.x) e o Compose
# recente exige buildx >= 0.17.0 para 'docker compose --build'. Instalamos um
# buildx atualizado no mesmo diretório de plugins (tem precedência sobre o do
# sistema em /usr/libexec/docker/cli-plugins).
echo ">>> Instalando Docker Buildx (versão compatível com o Compose)..."
BUILDX_VERSION="v0.19.3"
curl -SL "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-amd64" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx

echo ">>> Adicionando ec2-user ao grupo docker..."
usermod -aG docker ec2-user

echo ">>> Instalando AWS CLI v2..."
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install
rm -rf /tmp/aws /tmp/awscliv2.zip

echo ">>> Instalando Nginx (reverse proxy)..."
dnf install -y nginx
systemctl enable nginx

echo ">>> Instalando Certbot (Let's Encrypt)..."
dnf install -y certbot python3-certbot-nginx

echo ">>> Configurando volume EBS para dados..."
DATA_DEVICE="${data_device}"
DATA_MOUNT="${data_mount_path}"

# Aguardar device ficar disponível
for i in $(seq 1 30); do
  if [ -b "$DATA_DEVICE" ]; then break; fi
  sleep 2
done

# Formatar apenas se não tiver filesystem
if ! blkid "$DATA_DEVICE" > /dev/null 2>&1; then
  echo ">>> Formatando volume EBS..."
  mkfs.ext4 "$DATA_DEVICE"
fi

# Criar diretório e montar
mkdir -p "$DATA_MOUNT"
mount "$DATA_DEVICE" "$DATA_MOUNT"

# Adicionar ao fstab para montar automaticamente no boot
if ! grep -q "$DATA_DEVICE" /etc/fstab; then
  echo "$DATA_DEVICE $DATA_MOUNT ext4 defaults,nofail 0 2" >> /etc/fstab
fi

# Criar subdiretórios para os dados
mkdir -p "$DATA_MOUNT/postgres"
mkdir -p "$DATA_MOUNT/evolution"
chown -R 1000:1000 "$DATA_MOUNT"

echo ">>> Criando diretório da aplicação..."
mkdir -p /opt/order-system
chown ec2-user:ec2-user /opt/order-system

echo ">>> Configurando backup automático..."
mkdir -p /etc/cron.d
# O repositório é clonado em /opt/order-system, então o script de backup fica em
# /opt/order-system/infra/scripts/backup.sh (não em /opt/order-system/scripts).
cat > /etc/cron.d/order-system-backup << 'CRON'
# Backup do banco e sessão WhatsApp a cada 6 horas
0 */6 * * * root /opt/order-system/infra/scripts/backup.sh >> /var/log/order-system-backup.log 2>&1
CRON

echo ">>> Configurando logrotate..."
cat > /etc/logrotate.d/order-system << 'LOGROTATE'
/var/log/order-system-backup.log {
  weekly
  rotate 4
  compress
  missingok
  notifempty
}
LOGROTATE

echo ">>> User data concluído!"
