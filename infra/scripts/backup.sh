#!/bin/bash
# =============================================================================
# Backup automático - PostgreSQL + Evolution API session
# Roda via cron a cada 6 horas
# =============================================================================
set -euo pipefail

TIMESTAMP=$(date +%Y-%m-%d_%H%M)
BACKUP_DIR="/tmp/order-system-backups"
S3_BUCKET=$(aws s3 ls | grep order-system-backups | awk '{print $3}')
DATA_MOUNT="/mnt/app-data"

if [ -z "$S3_BUCKET" ]; then
  echo "[ERROR] Bucket de backup não encontrado"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Iniciando backup..."

# ─────────────────────────────────────────────
# 1. Backup do PostgreSQL (via docker exec)
# ─────────────────────────────────────────────
echo "[$(date)] Fazendo dump do PostgreSQL..."
PG_CONTAINER=$(docker ps -qf "name=db")
if [ -z "$PG_CONTAINER" ]; then
  echo "[ERROR] Container do PostgreSQL não está rodando"
  exit 1
fi

docker exec "$PG_CONTAINER" \
  pg_dumpall -U postgres | gzip > "$BACKUP_DIR/postgres_$TIMESTAMP.sql.gz"

# Verificar se o dump não está vazio (mínimo 100 bytes comprimido)
DUMP_SIZE=$(stat -c%s "$BACKUP_DIR/postgres_$TIMESTAMP.sql.gz" 2>/dev/null || echo 0)
if [ "$DUMP_SIZE" -lt 100 ]; then
  echo "[ERROR] Dump do PostgreSQL parece inválido (${DUMP_SIZE} bytes)"
  exit 1
fi

# ─────────────────────────────────────────────
# 2. Backup da sessão do Evolution API
# ─────────────────────────────────────────────
echo "[$(date)] Copiando dados do Evolution API..."
tar czf "$BACKUP_DIR/evolution_$TIMESTAMP.tar.gz" \
  -C "$DATA_MOUNT/evolution" . 2>/dev/null || true

# ─────────────────────────────────────────────
# 3. Upload para S3
# ─────────────────────────────────────────────
echo "[$(date)] Enviando para S3..."
aws s3 cp "$BACKUP_DIR/postgres_$TIMESTAMP.sql.gz" \
  "s3://$S3_BUCKET/postgres/postgres_$TIMESTAMP.sql.gz"

aws s3 cp "$BACKUP_DIR/evolution_$TIMESTAMP.tar.gz" \
  "s3://$S3_BUCKET/evolution/evolution_$TIMESTAMP.tar.gz"

# ─────────────────────────────────────────────
# 4. Limpeza local
# ─────────────────────────────────────────────
rm -rf "$BACKUP_DIR"

echo "[$(date)] Backup concluído com sucesso!"
