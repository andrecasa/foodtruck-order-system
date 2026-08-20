# 🚀 Infraestrutura AWS — Foodtruck Order System

Terraform para provisionar a stack completa na AWS usando **EC2 + Docker Compose**.

---

## Índice

1. [O que será criado](#o-que-será-criado)
2. [Custo estimado](#custo-estimado)
3. [Pré-requisitos](#pré-requisitos)
4. [Passo 1 — Instalar ferramentas](#passo-1--instalar-ferramentas)
5. [Passo 2 — Criar credenciais AWS](#passo-2--criar-credenciais-aws)
6. [Passo 3 — Criar Key Pair (acesso SSH)](#passo-3--criar-key-pair-acesso-ssh)
7. [Passo 4 — Configurar variáveis do Terraform](#passo-4--configurar-variáveis-do-terraform)
8. [Passo 5 — Subir a infraestrutura](#passo-5--subir-a-infraestrutura)
9. [Passo 6 — Conectar na EC2](#passo-6--conectar-na-ec2)
10. [Passo 7 — Deploy da aplicação](#passo-7--deploy-da-aplicação)
11. [Passo 8 — Configurar variáveis de produção](#passo-8--configurar-variáveis-de-produção)
12. [Passo 9 — Subir containers em produção](#passo-9--subir-containers-em-produção)
13. [Passo 10 — Configurar Nginx (reverse proxy)](#passo-10--configurar-nginx-reverse-proxy)
14. [Passo 11 — Build do painel web](#passo-11--build-do-painel-web)
15. [Passo 12 — Configurar domínio e HTTPS](#passo-12--configurar-domínio-e-https)
16. [Passo 13 — Conectar WhatsApp](#passo-13--conectar-whatsapp)
17. [Verificar se tudo está funcionando](#verificar-se-tudo-está-funcionando)
18. [Backups automáticos](#backups-automáticos)
19. [Operações do dia a dia](#operações-do-dia-a-dia)
20. [Troubleshooting](#troubleshooting)
21. [Segurança](#segurança)
22. [Migração futura](#migração-futura)

---

## O que será criado

```
                    ┌─────────────────────────────┐
                    │        Internet              │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │    Elastic IP (IP fixo)      │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │    EC2 (t3.small)            │
                    │                             │
                    │  Nginx (reverse proxy)       │
                    │  + Let's Encrypt (HTTPS)     │
                    │                             │
                    │  Docker Compose:             │
                    │  ├── Backend (Express)       │
                    │  ├── PostgreSQL              │
                    │  ├── Kong (API Gateway)      │
                    │  ├── GoTrue (Auth)           │
                    │  ├── Realtime (WebSocket)    │
                    │  └── Evolution API (WhatsApp)│
                    │                             │
                    │  EBS Volume (5 GB)           │
                    │  ├── /postgres               │
                    │  └── /evolution              │
                    └─────────────────────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │    S3 (backups a cada 6h)    │
                    └─────────────────────────────┘
```

| Recurso | Pra que serve |
|---------|---------------|
| VPC + Subnet | Rede isolada na AWS |
| Security Group | Firewall — controla quais portas ficam abertas |
| EC2 t3.small | O servidor onde tudo roda |
| Elastic IP | IP público fixo (não muda ao reiniciar) |
| EBS Volume 5GB | Disco extra para dados do banco e WhatsApp |
| S3 Bucket | Guarda backups do banco e sessão WhatsApp |
| IAM Role | Permissão para a EC2 acessar o S3 e SSM |

---

## Custo estimado

| Recurso | Custo/mês (us-east-1) |
|---------|----------------------|
| EC2 t3.small | ~$15 |
| EBS 30GB (sistema) | ~$2.40 |
| EBS 5GB (dados) | ~$0.40 |
| Elastic IP (em uso) | $0 |
| S3 (~1GB backups) | ~$0.03 |
| Tráfego (~10GB) | ~$0.90 |
| **Total** | **~$19/mês** |

> 💡 Elastic IP só é grátis enquanto está associado a uma instância rodando. Se destruir a EC2 sem remover o EIP, cobra ~$3.60/mês.

---

## Pré-requisitos

- Conta na AWS (pode ser a Free Tier, mas t3.small não é gratuita)
- Computador com Linux ou macOS (WSL no Windows funciona)
- Acesso à internet

---

## Passo 1 — Instalar ferramentas

Você precisa de duas ferramentas na sua máquina: **AWS CLI** e **Terraform**.

### AWS CLI

```bash
# Baixar e instalar
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip awscliv2.zip
sudo ./aws/install
rm -rf aws awscliv2.zip

# Confirmar instalação
aws --version
# Deve mostrar algo como: aws-cli/2.x.x ...
```

### Terraform

```bash
# Ubuntu/Debian
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform

# Confirmar instalação
terraform version
# Deve mostrar algo como: Terraform v1.x.x
```

---

## Passo 2 — Criar credenciais AWS

Você precisa de um "Access Key" para o Terraform poder criar recursos na sua conta.

1. Acesse o **Console AWS** → busque **IAM** → **Users** → **Create user**
2. Nome: `terraform-deploy`
3. Em "Permissions", selecione **Attach policies directly** → marque `AdministratorAccess`
   > ⚠️ Para MVP está ok. Em produção real, crie uma policy mais restrita.
4. Após criar o usuário, vá em **Security credentials** → **Create access key**
5. Escolha "Command Line Interface (CLI)"
6. Copie o **Access Key ID** e **Secret Access Key** (só aparecem uma vez!)

Agora configure no terminal:

```bash
aws configure
```

Responda:
```
AWS Access Key ID: cole-aqui-seu-access-key-id
AWS Secret Access Key: cole-aqui-seu-secret-access-key
Default region name: us-east-1
Default output format: json
```

**Teste rápido** para confirmar que funciona:
```bash
aws sts get-caller-identity
# Deve mostrar o Account ID e o nome do usuário
```

---

## Passo 3 — Criar Key Pair (acesso SSH)

O Key Pair é o "passaporte" para conectar via SSH na EC2.

```bash
aws ec2 create-key-pair \
  --key-name order-system-key \
  --region us-east-1 \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/order-system-key.pem

# Proteger o arquivo (obrigatório, senão SSH recusa)
chmod 400 ~/.ssh/order-system-key.pem
```

**Confirmando que foi criado:**
```bash
aws ec2 describe-key-pairs --key-names order-system-key --region us-east-1
```

> 🔑 Guarde esse arquivo `.pem` com cuidado. Se perder, não tem como recuperar — vai precisar criar outro.

---

## Passo 4 — Configurar variáveis do Terraform

```bash
cd infra/
cp terraform.tfvars.example terraform.tfvars
```

Edite o arquivo `terraform.tfvars`:

```hcl
aws_region        = "us-east-1"
environment       = "prod"
instance_type     = "t3.small"
key_pair_name     = "order-system-key"
domain_name       = "foodtruck.app.br"
ssh_allowed_cidrs = ["SEU_IP_AQUI/32"]
enable_backups    = true
```

**Para descobrir seu IP público:**
```bash
curl -4 ifconfig.me
# Exemplo de resultado: 177.38.42.195
# Use: ssh_allowed_cidrs = ["177.38.42.195/32"]
```

> 💡 O `/32` significa "apenas este IP". Se seu IP for dinâmico (muda quando reinicia o roteador), você vai precisar atualizar esse valor de tempos em tempos — ou usar SSM para acesso sem SSH (explicado na seção Segurança).

> ⚠️ Se deixar `ssh_allowed_cidrs = []` (vazio), a porta SSH fica **fechada**. Você ainda pode acessar via SSM (Systems Manager), que é mais seguro.

---

## Passo 5 — Subir a infraestrutura

```bash
cd infra/

# 1. Inicializar Terraform (baixa os plugins necessários)
terraform init
```

Você verá algo como:
```
Terraform has been successfully initialized!
```

```bash
# 2. Ver o que será criado (revisão — não cria nada ainda)
terraform plan
```

Revise a lista. Deve mostrar algo como `Plan: 12 to add, 0 to change, 0 to destroy.`

```bash
# 3. Criar tudo (vai pedir confirmação)
terraform apply
```

Quando pedir `Enter a value:`, digite `yes` e pressione Enter.

**Aguarde 1-2 minutos.** Ao final, verá os outputs:

```
Outputs:

public_ip     = "3.92.xxx.xxx"
ssh_command   = "ssh -i ~/.ssh/order-system-key.pem ec2-user@3.92.xxx.xxx"
ssm_connect   = "aws ssm start-session --target i-0abc123 --region us-east-1"
instance_id   = "i-0abc123def456"
```

**Anote o `public_ip`** — é o endereço do seu servidor.

> ⚠️ O Elastic IP só é gratuito enquanto associado a uma instância ativa. Se você fizer `terraform destroy` parcialmente e deixar o EIP solto, vai cobrar.

---

## Passo 6 — Conectar na EC2

Espere 2-3 minutos após o `terraform apply` (o user-data precisa terminar de instalar Docker, Nginx, etc).

```bash
ssh -i ~/.ssh/order-system-key.pem ec2-user@3.92.xxx.xxx
```

Se der erro "Permission denied", verifique:
- O arquivo `.pem` existe e tem permissão 400
- O IP está na lista `ssh_allowed_cidrs`
- Espere mais 1-2 minutos (user-data ainda rodando)

**Para verificar se o setup automático finalizou:**
```bash
# Dentro da EC2:
sudo cat /var/log/cloud-init-output.log | tail -5
# Deve terminar com: ">>> User data concluído!"
```

**Verificação rápida:**
```bash
docker --version        # Docker instalado?
docker compose version  # Docker Compose instalado?
lsblk                  # EBS data aparece como xvdf?
df -h /mnt/app-data    # Volume montado?
```

---

## Passo 7 — Deploy da aplicação

Ainda na EC2:

```bash
# Clonar o repositório
git clone https://github.com/andrecasa/foodtruck-order-system.git /opt/order-system
cd /opt/order-system

# Tornar script executável e rodar
chmod +x infra/scripts/deploy.sh
bash infra/scripts/deploy.sh
```

O script vai:
1. Criar o `docker-compose.override.yml` (aponta volumes pro EBS)
2. Subir os containers
3. Aguardar estabilizar
4. Executar seed do admin

> Se falhar no git clone (repo privado), configure um Personal Access Token ou deploy key. Veja: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

---

## Passo 8 — Configurar variáveis de produção

O deploy criou um `.env` a partir do `.env.example`. Agora edite com valores de produção:

```bash
cd /opt/order-system
nano .env
```

**Gere os secrets primeiro:**
```bash
# JWT Secret (copie o resultado)
openssl rand -base64 32

# API Key para Evolution (copie o resultado)
openssl rand -hex 24

# Senha do banco (copie o resultado)
openssl rand -base64 16
```

**Valores para alterar no `.env`:**

```env
# ════ OBRIGATÓRIO ALTERAR ══════════════════════════
JWT_SECRET=COLE_O_RESULTADO_DO_PRIMEIRO_OPENSSL
ANON_KEY=será-gerado-pelo-generate-keys
SERVICE_ROLE_KEY=será-gerado-pelo-generate-keys
POSTGRES_PASSWORD=COLE_O_RESULTADO_DO_TERCEIRO_OPENSSL
EVOLUTION_API_KEY=COLE_O_RESULTADO_DO_SEGUNDO_OPENSSL

# ══════ URLS (use IP ou domínio) ════════════════════
# Se não tem domínio ainda, use o IP:
API_EXTERNAL_URL=http://SEU_IP
SITE_URL=http://SEU_IP
EVOLUTION_SERVER_URL=http://SEU_IP:8080

# Quando tiver domínio + HTTPS, troque para:
# API_EXTERNAL_URL=https://api.foodtruck.app.br
# SITE_URL=https://web.foodtruck.app.br
# EVOLUTION_SERVER_URL=https://api.foodtruck.app.br/evolution
```

Salve com `Ctrl+O`, `Enter`, `Ctrl+X`.

---

## Passo 9 — Subir containers em produção

```bash
cd /opt/order-system

# Parar tudo (se estiver rodando do deploy anterior)
docker compose down

# Subir com as novas variáveis
docker compose up -d --build

# Aguardar estabilizar
sleep 20

# Gerar chaves do Supabase (ANON_KEY e SERVICE_ROLE_KEY)
./scripts/generate-keys.sh

# Reiniciar para pegar as novas chaves
docker compose down
docker compose up -d

# Seed do admin
./scripts/seed-admin.sh
```

**Verificar se tudo subiu:**
```bash
docker compose ps
```

Todos os serviços devem estar com status `Up` ou `healthy`.

---

## Passo 10 — Configurar Nginx (reverse proxy)

O Nginx recebe as requisições da internet e direciona para o container correto.

```bash
# Copiar config
sudo cp /opt/order-system/infra/scripts/nginx.conf /etc/nginx/conf.d/foodtruck.app.br.conf

# Remover config padrão (conflita na porta 80)
sudo rm -f /etc/nginx/conf.d/default.conf

# Testar se a config está correta
sudo nginx -t
# Deve mostrar: "syntax is ok" e "test is successful"

# Reiniciar Nginx
sudo systemctl restart nginx
```

**Testar acesso externo** (na sua máquina local, não na EC2):
```bash
curl -H "Host: api.foodtruck.app.br" http://SEU_IP/api/health
# Deve retornar: {"status":"ok"} ou similar
```

Se retornar "502 Bad Gateway", o backend ainda não está pronto. Espere mais e tente novamente.

---

## Passo 11 — Build do painel web

O painel web é servido como arquivos estáticos pelo Nginx.

```bash
# Instalar Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Ativar pnpm
sudo corepack enable

# Instalar dependências e buildar
cd /opt/order-system
pnpm install
pnpm --filter @order-system/web build
```

O build gera arquivos em `apps/web/dist/`. O Nginx já está configurado para servir dessa pasta.

**Testar:** Abra `http://SEU_IP` no navegador (ou configure `/etc/hosts` com o domínio). Deve carregar o painel.

---

## Passo 12 — Configurar domínio e HTTPS

### 12.1 — Configurar DNS no Registro.br (modo avançado)

1. Acesse https://registro.br → login → "Meus domínios" → `foodtruck.app.br`
2. Clique na aba **DNS**
3. Em "Configurar endereçamento", clique em **"MODO AVANÇADO"**
4. O Registro.br vai iniciar a transição da zona (~2 horas). Aguarde até poder adicionar registros.
5. Quando liberar, adicione os seguintes registros:

```
foodtruck.app.br        A    3.92.247.3
api.foodtruck.app.br    A    3.92.247.3
web.foodtruck.app.br    A    3.92.247.3
```

> ⚠️ No Registro.br modo avançado, não se usa `@`. O domínio raiz é o próprio nome completo.
> Não são aceitos os caracteres "@" e "*".

6. Salve e aguarde propagação (5-15 min após a zona estar ativa)

### 12.2 — Verificar propagação

```bash
dig +short foodtruck.app.br
dig +short api.foodtruck.app.br
dig +short web.foodtruck.app.br
# Todos devem retornar: 3.92.247.3
```

Se não tiver `dig`, use: https://www.whatsmydns.net

### 12.3 — Configurar Nginx com subdomínios

Na EC2, crie a configuração do Nginx:

```bash
sudo bash -c 'cat > /etc/nginx/conf.d/foodtruck.app.br.conf << '\''EOF'\''
# ─────────────────────────────────────────────────────────────
# web.foodtruck.app.br — Painel Web (arquivos estáticos)
# ─────────────────────────────────────────────────────────────
server {
    listen 80;
    server_name web.foodtruck.app.br foodtruck.app.br;

    location / {
        root /opt/order-system/apps/web/dist;
        index index.html;
        try_files $uri $uri/ /index.html;

        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # Headers de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    client_max_body_size 10M;
}

# ─────────────────────────────────────────────────────────────
# api.foodtruck.app.br — Backend API + Auth + Realtime
# ─────────────────────────────────────────────────────────────
server {
    listen 80;
    server_name api.foodtruck.app.br;

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Supabase Auth (Kong gateway)
    location /auth/ {
        proxy_pass http://127.0.0.1:8000/auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Supabase Realtime (WebSocket)
    location /realtime/ {
        proxy_pass http://127.0.0.1:8000/realtime/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Headers de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    client_max_body_size 10M;
}
EOF'
```

Teste e recarregue:

```bash
sudo rm -f /etc/nginx/conf.d/default.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 12.4 — Ativar HTTPS com Certbot

Após os subdomínios estarem propagados (`dig` retornando o IP):

```bash
sudo certbot --nginx -d foodtruck.app.br -d web.foodtruck.app.br -d api.foodtruck.app.br
```

O Certbot vai pedir:
- Seu email (para avisos de expiração)
- Aceitar termos (Y)
- Redirecionar HTTP→HTTPS (escolha **2 - Redirect**)

Teste a renovação automática:

```bash
sudo certbot renew --dry-run
```

### 12.5 — Atualizar URLs da aplicação

```bash
cd /opt/order-system
nano .env
```

Altere para:

```env
API_EXTERNAL_URL=https://api.foodtruck.app.br
SITE_URL=https://web.foodtruck.app.br
EVOLUTION_SERVER_URL=https://api.foodtruck.app.br/evolution
```

Reinicie:

```bash
docker compose down
docker compose up -d
```

### 12.6 — Atualizar o app mobile

No `.env` do projeto mobile (na sua máquina local):

```env
EXPO_PUBLIC_API_URL=https://api.foodtruck.app.br/api
EXPO_PUBLIC_SUPABASE_URL=https://api.foodtruck.app.br
```

### 12.7 — Verificar

```bash
# Backend
curl https://api.foodtruck.app.br/api/health

# Painel web — abrir no navegador:
# https://web.foodtruck.app.br
# https://foodtruck.app.br (mesmo conteúdo)
```

---

## Passo 13 — Conectar WhatsApp

A Evolution API gerencia a conexão com WhatsApp.

```bash
# Verificar status da instância
curl http://localhost:8080/instance/connectionState/order-system \
  -H "apikey: SUA_EVOLUTION_API_KEY"

# Gerar QR Code para conectar
curl http://localhost:8080/instance/connect/order-system \
  -H "apikey: SUA_EVOLUTION_API_KEY"
```

Para escanear o QR Code, acesse a interface web da Evolution API pelo navegador da sua máquina local.

**Como funciona:** você vai criar um "túnel" SSH que faz a porta 8080 do servidor (que está fechada pro mundo) aparecer como uma porta da sua própria máquina. Não precisa instalar nada extra, não precisa de interface gráfica no Linux do servidor, e não precisa abrir portas no firewall.

```bash
# Na sua máquina local (NÃO na EC2) — rode e deixe o terminal aberto:
ssh -i ~/.ssh/order-system-key.pem -L 9090:localhost:8080 ec2-user@3.92.247.3
```

O que esse comando faz:
- `-L 9090:localhost:8080` → "pegue o que está na porta 8080 da EC2 e disponibilize na porta 9090 da minha máquina"
- Usamos 9090 em vez de 8080 para não conflitar caso tenha Evolution API rodando localmente em dev
- Enquanto esse terminal estiver aberto, o túnel funciona
- Quando fechar o terminal (ou Ctrl+C), o acesso se encerra

Agora abra **o navegador da sua máquina local** e acesse:

```
http://localhost:9090/manager
```

Você verá a interface gráfica da Evolution API com o QR Code. Escaneie com o WhatsApp do food truck (WhatsApp > Aparelhos conectados > Conectar aparelho).

Após conectar, pode fechar o terminal do SSH — o túnel encerra e ninguém mais acessa a porta.

> 💡 Resumo: o navegador é da sua máquina, o servidor é o Linux na AWS. O túnel SSH conecta os dois sem expor nada na internet.

> 💡 A sessão fica salva no EBS em `/mnt/app-data/evolution/`. Mesmo reiniciando containers, não precisa escanear novamente.

---

## Verificar se tudo está funcionando

**Na EC2:**

```bash
# 1. Containers rodando
docker compose ps
# Todos devem estar "Up"

# 2. Backend respondendo
curl http://localhost:4000/api/health

# 3. WhatsApp conectado
curl http://localhost:8080/instance/connectionState/order-system \
  -H "apikey: SUA_EVOLUTION_API_KEY"
# state deve ser "open"

# 4. Backup funcionando
sudo /opt/order-system/scripts/backup.sh
# Deve terminar com "Backup concluído com sucesso!"

# 5. Backups chegando no S3
aws s3 ls s3://order-system-backups-$(aws sts get-caller-identity --query Account --output text)/postgres/
```

**Na sua máquina local:**

```bash
# 6. Nginx proxy funcionando (acesso externo)
curl https://api.foodtruck.app.br/api/health

# 7. Painel web carregando
Abra no navegador: https://web.foodtruck.app.br
```

---

## Backups automáticos

### O que é feito

- **PostgreSQL** — dump completo compactado
- **Evolution API** — sessão WhatsApp compactada

### Quando roda

A cada 6 horas automaticamente (via cron). Retenção de 30 dias no S3.

### Verificar logs

```bash
cat /var/log/order-system-backup.log
```

### Executar backup manual

```bash
sudo /opt/order-system/scripts/backup.sh
```

### Restaurar banco de dados

```bash
# 1. Ver backups disponíveis
BUCKET=$(aws s3 ls | grep order-system-backups | awk '{print $3}')
aws s3 ls s3://$BUCKET/postgres/

# 2. Baixar o mais recente
aws s3 cp s3://$BUCKET/postgres/postgres_2026-08-18_1200.sql.gz /tmp/

# 3. Descompactar
gunzip /tmp/postgres_2026-08-18_1200.sql.gz

# 4. Parar backend (evitar escritas durante restore)
docker compose stop backend

# 5. Restaurar
cat /tmp/postgres_2026-08-18_1200.sql | docker exec -i $(docker ps -qf "name=db") psql -U postgres

# 6. Reiniciar
docker compose up -d
```

### Restaurar sessão WhatsApp

```bash
BUCKET=$(aws s3 ls | grep order-system-backups | awk '{print $3}')
aws s3 cp s3://$BUCKET/evolution/evolution_2026-08-18_1200.tar.gz /tmp/

docker compose stop evolution-api
rm -rf /mnt/app-data/evolution/*
tar xzf /tmp/evolution_2026-08-18_1200.tar.gz -C /mnt/app-data/evolution/
docker compose start evolution-api
```

---

## Operações do dia a dia

### Atualizar a aplicação (novo código)

```bash
ssh -i ~/.ssh/order-system-key.pem ec2-user@SEU_IP
cd /opt/order-system
git pull origin main
docker compose up -d --build backend

# Se mudou o frontend:
pnpm --filter @order-system/web build
```

### Reiniciar tudo

```bash
cd /opt/order-system
docker compose down
docker compose up -d
```

### Ver logs de um serviço

```bash
docker compose logs -f backend       # backend em tempo real
docker compose logs -f evolution-api  # whatsapp
docker compose logs db --tail 50     # últimas 50 linhas do banco
```

### Verificar espaço em disco

```bash
df -h                  # visão geral
df -h /mnt/app-data    # volume de dados
du -sh /mnt/app-data/* # o que está ocupando
```

### Limpar espaço

```bash
docker system prune -f         # remove containers/images parados
docker image prune -a -f       # remove imagens não utilizadas
```

### Escalar (mais RAM/CPU)

Na sua máquina local:
```bash
cd infra/
# Edite terraform.tfvars:
# instance_type = "t3.medium"   (4GB RAM em vez de 2GB)

terraform apply
# ⚠️ Isso reinicia a EC2 (~2-3 min de downtime)
```

Após reiniciar, reconecte e suba containers:
```bash
ssh -i ~/.ssh/order-system-key.pem ec2-user@SEU_IP
cd /opt/order-system
docker compose up -d
```

### Expandir disco de dados

Na sua máquina local:
```bash
cd infra/
# Edite terraform.tfvars:
# data_volume_size = 10   (de 5 para 10 GB)

terraform apply
```

Na EC2:
```bash
sudo resize2fs /dev/xvdf
df -h /mnt/app-data   # confirmar novo tamanho
```

---

## Troubleshooting

### Não consigo conectar via SSH

| Causa provável | Solução |
|---|---|
| IP mudou | Execute `curl ifconfig.me` e atualize `ssh_allowed_cidrs` no `terraform.tfvars`, depois `terraform apply` |
| `ssh_allowed_cidrs` está vazio | SSH fica fechado por segurança. Use SSM: `aws ssm start-session --target INSTANCE_ID --region us-east-1` |
| Arquivo .pem errado | Verifique se está usando `~/.ssh/order-system-key.pem` com `chmod 400` |
| EC2 ainda iniciando | Espere 3 minutos após `terraform apply` |

### User-data não completou (Docker não instalado)

```bash
# Ver log completo do setup inicial
sudo cat /var/log/cloud-init-output.log

# Se falhou, pode reexecutar manualmente:
sudo bash /opt/order-system/infra/scripts/user-data.sh
```

### Container não sobe

```bash
# Ver erro específico
docker compose logs NOME_DO_SERVICO
# Exemplos: db, backend, evolution-api, kong, gotrue

# Problema comum: porta já em uso
docker compose down
docker compose up -d
```

### Backend retorna erro de conexão com banco

```bash
# Banco está rodando?
docker compose ps db
docker exec $(docker ps -qf "name=db") pg_isready -U postgres

# Verificar variáveis
docker compose exec backend env | grep POSTGRES
```

### Nginx retorna 502 Bad Gateway

```bash
# Backend está respondendo?
curl http://localhost:4000/api/health

# Se não, ver logs:
docker compose logs backend

# Reiniciar:
docker compose restart backend
```

### EBS não montou ao reiniciar

```bash
lsblk                        # xvdf aparece?
sudo mount /dev/xvdf /mnt/app-data
cat /etc/fstab               # entrada existe?
```

### Erro de permissão no PostgreSQL

```bash
# Postgres precisa ser dono do diretório
sudo chown -R 70:70 /mnt/app-data/postgres
docker compose restart db
```

### WhatsApp desconectou

```bash
# Verificar status
curl http://localhost:8080/instance/connectionState/order-system \
  -H "apikey: SUA_EVOLUTION_API_KEY"

# Se "state": "close", reconectar:
curl http://localhost:8080/instance/connect/order-system \
  -H "apikey: SUA_EVOLUTION_API_KEY"
# Escaneie o QR Code novamente
```

---

## Segurança

### O que já está configurado automaticamente

- **IMDSv2 obrigatório** — protege contra ataques que exploram o metadata endpoint da EC2
- **SSH fechado por padrão** — se `ssh_allowed_cidrs` está vazio, porta 22 fica bloqueada
- **Acesso SSM** — permite conectar na EC2 sem SSH (mais seguro)
- **EBS encriptado** — dados em repouso são criptografados
- **S3 privado** — bucket de backups bloqueado para acesso público
- **Headers de segurança no Nginx** — HSTS, X-Frame-Options, etc.

### Checklist obrigatório antes de usar em produção

- [ ] Gerar `JWT_SECRET` com `openssl rand -base64 32`
- [ ] Gerar `POSTGRES_PASSWORD` forte
- [ ] Gerar `EVOLUTION_API_KEY` com `openssl rand -hex 24`
- [ ] Configurar `ssh_allowed_cidrs` com seu IP (ou usar SSM)
- [ ] Ativar HTTPS com Certbot
- [ ] Confirmar que `.env` e `terraform.tfvars` estão no `.gitignore`
- [ ] Definir `DISABLE_SIGNUP=true` no GoTrue (apenas admin cria usuários)

### Acessar sem SSH (via SSM)

Se preferir nem abrir porta SSH:

```bash
# Na sua máquina local (precisa do AWS CLI)
aws ssm start-session --target i-0abc123def456 --region us-east-1
```

Vantagem: não precisa gerenciar Key Pair nem manter IP atualizado no Security Group.

### Rotacionar credenciais (JWT_SECRET)

Quando quiser invalidar todas as sessões e gerar novas chaves:

```bash
cd /opt/order-system

# Gerar novo secret e regenerar ANON_KEY + SERVICE_ROLE_KEY de uma vez:
./scripts/generate-keys.sh "$(openssl rand -base64 32)"

# Reiniciar para aplicar
docker compose down
docker compose up -d
```

O script `generate-keys.sh` atualiza automaticamente:
- `.env` (JWT_SECRET, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
- `apps/mobile/.env` (EXPO_PUBLIC_SUPABASE_ANON_KEY)
- `kong.yml` (chaves do gateway)

> ⚠️ Após rotacionar, todos os usuários logados serão desconectados. O app mobile precisa ser rebuilado com a nova `ANON_KEY`. Planeje para horário de baixo uso.

---

## Migração futura

Quando o MVP crescer e precisar escalar:

1. **PostgreSQL → RDS** (banco gerenciado, backups automáticos, alta disponibilidade)
2. **Containers → ECS Fargate** (auto-scaling, sem gerenciar servidor)
3. **Nginx → ALB** (Load Balancer gerenciado)
4. **Evolution API** — continua precisando de volume persistente (usar EFS)

Para múltiplos food trucks: terraform workspaces (um ambiente por truck) ou arquitetura multi-tenant.

---

## Comandos de referência rápida

```bash
# ═══ Terraform (na sua máquina) ═══
terraform init              # primeira vez
terraform plan              # ver o que será criado/alterado
terraform apply             # aplicar mudanças
terraform output            # ver IP, comandos, etc
terraform destroy           # ⚠️ DESTRUIR TUDO

# ═══ Conectar na EC2 ═══
ssh -i ~/.ssh/order-system-key.pem ec2-user@IP
# ou via SSM:
aws ssm start-session --target INSTANCE_ID --region us-east-1

# ═══ Docker (na EC2) ═══
docker compose ps                           # status
docker compose logs -f SERVICO              # logs
docker compose up -d --build backend        # rebuild backend
docker compose down && docker compose up -d # reiniciar tudo

# ═══ Backup ═══
sudo /opt/order-system/scripts/backup.sh    # manual
cat /var/log/order-system-backup.log        # ver logs

# ═══ HTTPS ═══
sudo certbot --nginx -d dominio.com.br      # gerar certificado
sudo certbot renew --dry-run                # testar renovação
```
