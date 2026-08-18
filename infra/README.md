# 🚀 Infraestrutura AWS — Foodtruck Order System

Terraform para provisionar a stack completa do sistema de pedidos na AWS usando a abordagem **EC2 + Docker Compose** (Opção A).

## Índice

- [Visão Geral da Arquitetura](#visão-geral-da-arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Custo Estimado](#custo-estimado)
- [Passo a Passo Completo](#passo-a-passo-completo)
- [Configuração de Domínio e HTTPS](#configuração-de-domínio-e-https)
- [Volume Persistente (Evolution API)](#volume-persistente-evolution-api)
- [Backups Automáticos](#backups-automáticos)
- [Segurança](#segurança)
- [Monitoramento](#monitoramento)
- [Manutenção e Operação](#manutenção-e-operação)
- [Troubleshooting](#troubleshooting)
- [Migração Futura](#migração-futura)

---

## Visão Geral da Arquitetura

```
                    ┌─────────────────────────────┐
                    │        Internet              │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │    Elastic IP (fixo)         │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │    EC2 (t3.small)            │
                    │  ┌───────────────────────┐  │
                    │  │  Nginx (reverse proxy) │  │
                    │  │  + Let's Encrypt SSL   │  │
                    │  └───────────┬───────────┘  │
                    │              │               │
                    │  ┌───────────▼───────────┐  │
                    │  │  Docker Compose        │  │
                    │  │  ├── Backend (Express) │  │
                    │  │  ├── PostgreSQL        │  │
                    │  │  ├── Kong (Gateway)    │  │
                    │  │  ├── GoTrue (Auth)     │  │
                    │  │  ├── Realtime (WS)     │  │
                    │  │  └── Evolution API     │  │
                    │  └───────────────────────┘  │
                    │                             │
                    │  ┌───────────────────────┐  │
                    │  │  EBS Volume (5 GB)     │  │
                    │  │  ├── /postgres         │  │
                    │  │  └── /evolution        │  │
                    │  └───────────────────────┘  │
                    └─────────────────────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │    S3 (backups a cada 6h)    │
                    └─────────────────────────────┘
```

### Recursos criados pelo Terraform

| Recurso | Descrição |
|---|---|
| VPC + Subnet pública | Rede isolada com acesso à internet |
| Security Group | Portas 80, 443, 22 (SSH restrito) |
| EC2 (t3.small) | Servidor principal |
| Elastic IP | IP público fixo |
| EBS Volume (gp3) | Disco separado para dados persistentes |
| S3 Bucket | Armazenamento de backups |
| IAM Role | Permissões EC2 → S3 + SSM |

---

## Pré-requisitos

### Na sua máquina local

1. **AWS CLI** configurado com credenciais:
   ```bash
   # Instalar
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
   unzip awscliv2.zip && sudo ./aws/install

   # Configurar
   aws configure
   # AWS Access Key ID: sua-access-key
   # AWS Secret Access Key: sua-secret-key
   # Default region: sa-east-1
   # Default output: json
   ```

2. **Terraform** (>= 1.5):
   ```bash
   # Ubuntu/Debian
   wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
   echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
   sudo apt update && sudo apt install terraform
   ```

3. **Key Pair na AWS** (para acesso SSH):
   ```bash
   # Criar key pair via CLI
   aws ec2 create-key-pair \
     --key-name order-system-key \
     --query 'KeyMaterial' \
     --output text > ~/.ssh/order-system-key.pem

   chmod 400 ~/.ssh/order-system-key.pem
   ```

### Conta AWS

- Conta AWS ativa com permissões de administrador (ou pelo menos EC2, VPC, S3, IAM)
- Billing alerts configurados (recomendado)

---

## Custo Estimado

| Recurso | Custo mensal (sa-east-1) |
|---|---|
| EC2 t3.small (2vCPU, 2GB) | ~$18 |
| EBS root 20GB gp3 | ~$1.80 |
| EBS data 5GB gp3 | ~$0.45 |
| Elastic IP (em uso) | $0 |
| S3 backups (~1GB) | ~$0.03 |
| Transferência (~10GB) | ~$1 |
| **Total estimado** | **~$21/mês** |

> Para economizar mais: considere Reserved Instances (~40% desconto) ou Savings Plans após validar que a stack funciona bem.

---

## Passo a Passo Completo

### 1. Configurar variáveis

```bash
cd infra/
cp terraform.tfvars.example terraform.tfvars
```

Edite `terraform.tfvars`:
```hcl
aws_region        = "sa-east-1"
environment       = "prod"
instance_type     = "t3.small"
key_pair_name     = "order-system-key"
domain_name       = "meu-foodtruck.com.br"  # ou deixe vazio
ssh_allowed_cidrs = ["177.xxx.xxx.xxx/32"]   # seu IP (curl ifconfig.me)
```

### 2. Inicializar e aplicar Terraform

```bash
terraform init
terraform plan          # Revise o que será criado
terraform apply         # Digite "yes" para confirmar
```

O output mostrará:
```
public_ip    = "54.xxx.xxx.xxx"
ssh_command  = "ssh -i ~/.ssh/order-system-key.pem ec2-user@54.xxx.xxx.xxx"
```

### 3. Conectar na EC2

```bash
ssh -i ~/.ssh/order-system-key.pem ec2-user@<IP_DO_OUTPUT>
```

### 4. Deploy da aplicação

Na EC2:
```bash
# Clonar o repositório
git clone https://github.com/andrecasa/foodtruck-order-system.git /opt/order-system
cd /opt/order-system

# Executar o script de deploy
chmod +x infra/scripts/deploy.sh
bash infra/scripts/deploy.sh
```

### 5. Configurar variáveis de produção

```bash
nano /opt/order-system/.env
```

**Valores importantes para produção:**
```env
# ALTERE OBRIGATORIAMENTE:
JWT_SECRET=gere-uma-chave-forte-com-openssl-rand-base64-32
EVOLUTION_API_KEY=gere-outra-chave-forte
POSTGRES_PASSWORD=senha-forte-banco

# Ajuste as URLs para o IP/domínio público:
API_EXTERNAL_URL=https://seu-dominio.com
SITE_URL=https://seu-dominio.com
EVOLUTION_SERVER_URL=https://seu-dominio.com:8080
```

Gerar secrets seguros:
```bash
# JWT Secret
openssl rand -base64 32

# API Keys
openssl rand -hex 24
```

### 6. Reconstruir com novas variáveis

```bash
cd /opt/order-system
docker compose down
docker compose up -d --build
sleep 15
./scripts/generate-keys.sh
./scripts/seed-admin.sh
```

### 7. Configurar Nginx

```bash
sudo cp /opt/order-system/infra/scripts/nginx.conf /etc/nginx/conf.d/order-system.conf

# Editar com seu domínio
sudo nano /etc/nginx/conf.d/order-system.conf

# Testar e reiniciar
sudo nginx -t
sudo systemctl restart nginx
```

### 8. Build do painel web

```bash
cd /opt/order-system

# Instalar Node.js 20 (se não veio no user-data)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Ativar pnpm
corepack enable

# Instalar e buildar
pnpm install
pnpm --filter @order-system/web build

# Os arquivos estáticos ficam em apps/web/dist/
# O Nginx já está apontando para lá
```

### 9. Ativar HTTPS (após apontar DNS)

```bash
sudo certbot --nginx -d seu-dominio.com
# Siga as instruções interativas
# Certbot configura renovação automática via timer do systemd
```

---

## Configuração de Domínio e HTTPS

### Sem domínio (apenas IP)

Funciona, mas:
- Sem HTTPS (navegadores mostram "não seguro")
- App mobile precisa permitir HTTP (menos seguro)
- Não recomendado para produção real

### Com domínio

1. **Registrar domínio** (Registro.br, GoDaddy, Cloudflare, etc.)
2. **Criar registro DNS tipo A** apontando para o Elastic IP:
   ```
   Tipo: A
   Nome: @ (ou subdomínio como "api")
   Valor: 54.xxx.xxx.xxx (IP do output do Terraform)
   TTL: 300
   ```
3. **Ativar HTTPS** com Certbot (passo 9 acima)
4. **Renovação automática** — Certbot já configura, mas verifique:
   ```bash
   sudo certbot renew --dry-run
   ```

### Configuração para o App Mobile

Após ter o domínio com HTTPS, atualize o `.env` do mobile:
```env
EXPO_PUBLIC_API_URL=https://seu-dominio.com/api
EXPO_PUBLIC_SUPABASE_URL=https://seu-dominio.com
```

---

## Volume Persistente (Evolution API)

### Por que é crítico

A Evolution API armazena as **credenciais da sessão WhatsApp** (chaves Baileys) no filesystem. Sem persistência:
- Container recriado = QR Code necessário novamente
- Bot offline até reconexão manual

### Estrutura no EBS

```
/mnt/app-data/
├── postgres/       # Dados do PostgreSQL
│   ├── base/
│   ├── pg_wal/
│   └── ...
└── evolution/      # Sessão WhatsApp
    └── order-system/
        ├── auth/   # ← Credenciais críticas (noise keys)
        └── store/  # Cache de contatos
```

### Cenários de falha e proteção

| Cenário | Proteção |
|---|---|
| `docker compose down` + `up` | ✅ Volume EBS permanece montado |
| EC2 reiniciada (reboot) | ✅ EBS remonta via fstab |
| EC2 **terminada** | ✅ EBS separado sobrevive (não usa `delete_on_termination`) |
| Disco corrompido | ✅ Backup S3 a cada 6h |
| Migração para outra EC2 | ✅ Desanexar EBS e reanexar na nova instância |

### Restaurar sessão do Evolution API a partir do backup

```bash
# 1. Listar backups disponíveis
aws s3 ls s3://order-system-backups-ACCOUNT_ID/evolution/

# 2. Baixar o mais recente
aws s3 cp s3://order-system-backups-ACCOUNT_ID/evolution/evolution_2026-08-18_1200.tar.gz /tmp/

# 3. Parar Evolution API
docker compose stop evolution-api

# 4. Restaurar
rm -rf /mnt/app-data/evolution/*
tar xzf /tmp/evolution_2026-08-18_1200.tar.gz -C /mnt/app-data/evolution/

# 5. Reiniciar
docker compose start evolution-api
```

---

## Backups Automáticos

### O que é copiado

- **PostgreSQL** — dump completo (`pg_dumpall`) compactado
- **Evolution API** — diretório de sessão compactado

### Frequência e retenção

- Executa a cada **6 horas** via cron
- Retido por **30 dias** no S3 (configurável via `backup_retention_days`)
- S3 Lifecycle deleta automaticamente backups antigos

### Verificar se backups estão funcionando

```bash
# Na EC2:
cat /var/log/order-system-backup.log

# Listar backups no S3:
aws s3 ls s3://order-system-backups-ACCOUNT_ID/postgres/ --recursive
aws s3 ls s3://order-system-backups-ACCOUNT_ID/evolution/ --recursive
```

### Executar backup manual

```bash
sudo /opt/order-system/scripts/backup.sh
```

### Restaurar PostgreSQL a partir do backup

```bash
# 1. Baixar backup
aws s3 cp s3://order-system-backups-ACCOUNT_ID/postgres/postgres_2026-08-18_1200.sql.gz /tmp/

# 2. Descompactar
gunzip /tmp/postgres_2026-08-18_1200.sql.gz

# 3. Parar backend (evitar escritas)
docker compose stop backend

# 4. Restaurar
cat /tmp/postgres_2026-08-18_1200.sql | docker exec -i $(docker ps -qf "name=db") psql -U postgres

# 5. Reiniciar tudo
docker compose up -d
```

---

## Segurança

### Checklist de produção

- [ ] **JWT_SECRET** — Gere com `openssl rand -base64 32` (NUNCA use o default)
- [ ] **POSTGRES_PASSWORD** — Senha forte, diferente do dev
- [ ] **EVOLUTION_API_KEY** — Gere com `openssl rand -hex 24`
- [ ] **SSH restrito** — Configure `ssh_allowed_cidrs` com seu IP
- [ ] **HTTPS ativo** — Certbot com renovação automática
- [ ] **Firewall** — Apenas portas 80, 443, 22 abertas
- [ ] **Disable signup** — `DISABLE_SIGNUP=true` no GoTrue (usuários criados apenas pelo admin)
- [ ] **Secrets fora do git** — `.env` e `terraform.tfvars` no `.gitignore`

### Acesso SSH vs SSM

O Terraform configura AWS SSM automaticamente. Isso permite acesso à EC2 **sem abrir porta 22**:

```bash
# Conectar via SSM (sem SSH key, sem porta 22)
aws ssm start-session --target i-xxxxxxxxx --region sa-east-1
```

Para usar SSM exclusivamente, remova a regra de SSH do security group.

### Rotação de secrets

```bash
# 1. Gerar novo JWT_SECRET
NEW_SECRET=$(openssl rand -base64 32)

# 2. Atualizar .env
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" /opt/order-system/.env

# 3. Regenerar chaves Supabase
cd /opt/order-system && ./scripts/generate-keys.sh

# 4. Reiniciar serviços
docker compose down && docker compose up -d
```

> ⚠️ Rotação de JWT_SECRET invalida todas as sessões ativas. Planeje para horário de baixo uso.

---

## Monitoramento

### CloudWatch (incluso)

A EC2 já envia métricas básicas para o CloudWatch:
- CPU Utilization
- Disk I/O
- Network In/Out

### Alarmes recomendados (criar manualmente no Console)

| Métrica | Threshold | Ação |
|---|---|---|
| CPU > 80% por 5 min | Alto uso sustentado | Avaliar upgrade de instância |
| Disk Used > 85% | Disco quase cheio | Limpar logs/expandir EBS |
| StatusCheckFailed | Instância com problema | Restart automático |

### Monitoramento na EC2

```bash
# Status dos containers
docker compose ps

# Logs em tempo real
docker compose logs -f backend
docker compose logs -f evolution-api

# Uso de disco
df -h /mnt/app-data

# Uso de memória/CPU
htop  # ou: top, free -h

# Health check do backend
curl http://localhost:4000/api/health
```

### Alerta simples via cron (sem CloudWatch)

```bash
# Adicionar ao crontab: verifica backend a cada 5 min
*/5 * * * * curl -sf http://localhost:4000/api/health || echo "Backend DOWN $(date)" >> /var/log/order-system-alerts.log
```

---

## Manutenção e Operação

### Atualizar a aplicação (novo deploy)

```bash
ssh -i ~/.ssh/order-system-key.pem ec2-user@<IP>
cd /opt/order-system
git pull origin main
docker compose up -d --build backend
# Se mudou frontend:
pnpm --filter @order-system/web build
```

### Escalar a instância (mais RAM/CPU)

```bash
# 1. Na sua máquina local, altere variables.tf ou terraform.tfvars:
instance_type = "t3.medium"  # 2 vCPU, 4 GB RAM

# 2. Aplique:
terraform apply
# Isso vai parar e reiniciar a EC2 (downtime de ~2-3 min)

# 3. Reconecte e suba os containers:
ssh ec2-user@<IP>
cd /opt/order-system && docker compose up -d
```

### Expandir disco de dados

```bash
# 1. Altere no terraform.tfvars:
data_volume_size = 10  # de 5 para 10 GB

# 2. Aplique:
terraform apply

# 3. Na EC2, expanda o filesystem:
sudo growpart /dev/xvdf 1  # se tiver partição
sudo resize2fs /dev/xvdf
df -h /mnt/app-data  # confirmar novo tamanho
```

### Reconectar WhatsApp (se desconectou)

```bash
# 1. Verificar status
curl http://localhost:8080/instance/connectionState/order-system \
  -H "apikey: SUA_EVOLUTION_API_KEY"

# 2. Se state=close, gerar novo QR Code:
curl http://localhost:8080/instance/connect/order-system \
  -H "apikey: SUA_EVOLUTION_API_KEY"

# 3. Escanear o QR Code retornado com o WhatsApp do food truck
```

### Limpar espaço em disco

```bash
# Logs antigos do Docker
docker system prune -f

# Imagens não utilizadas
docker image prune -a -f

# Verificar o que está ocupando espaço
du -sh /mnt/app-data/*
du -sh /var/lib/docker/*
```

---

## Troubleshooting

### EC2 não inicia / user-data falhou

```bash
# Ver logs do user-data:
sudo cat /var/log/cloud-init-output.log
```

### Container não sobe

```bash
docker compose logs <serviço>
# Ex: docker compose logs db
# Ex: docker compose logs backend
```

### Disco EBS não montou

```bash
# Verificar se o device existe
lsblk

# Montar manualmente
sudo mount /dev/xvdf /mnt/app-data

# Verificar fstab
cat /etc/fstab
```

### Erro de permissão no PostgreSQL

```bash
# O PostgreSQL precisa que o diretório pertença ao uid 70 (postgres no Alpine)
sudo chown -R 70:70 /mnt/app-data/postgres
docker compose restart db
```

### Backend não conecta no banco

```bash
# Verificar se o banco está healthy
docker compose ps db
docker exec $(docker ps -qf "name=db") pg_isready -U postgres

# Verificar variáveis de ambiente
docker compose exec backend env | grep POSTGRES
```

### Nginx retorna 502 Bad Gateway

```bash
# Backend não está respondendo
curl http://localhost:4000/api/health

# Verificar se containers estão rodando
docker compose ps

# Reiniciar tudo
docker compose down && docker compose up -d
```

---

## Migração Futura

### Para ECS Fargate (quando escalar)

Se o food truck crescer e precisar de auto-scaling:

1. Mover PostgreSQL para **RDS** (managed)
2. Mover cada serviço para uma **ECS Task Definition**
3. Usar **ALB** (Application Load Balancer) no lugar do Nginx
4. Evolution API continua precisando de volume persistente (EFS nesse caso)

### Para múltiplas instâncias (franquia)

Se abrir mais food trucks:
- Cada um como um ambiente separado (terraform workspace)
- Ou multi-tenant com um único backend (mais complexo)

---

## Comandos Rápidos de Referência

```bash
# ─── Terraform ───
terraform init              # Primeira vez
terraform plan              # Ver o que será alterado
terraform apply             # Aplicar mudanças
terraform destroy           # ⚠️ Destruir TUDO
terraform output            # Ver outputs (IP, etc.)

# ─── EC2 (SSH) ───
ssh -i ~/.ssh/order-system-key.pem ec2-user@<IP>

# ─── Docker na EC2 ───
docker compose ps           # Status dos serviços
docker compose logs -f      # Logs em tempo real
docker compose up -d --build backend  # Rebuild backend
docker compose restart      # Reiniciar tudo

# ─── Backup manual ───
sudo /opt/order-system/scripts/backup.sh

# ─── Certificado SSL ───
sudo certbot --nginx -d dominio.com
sudo certbot renew --dry-run
```
