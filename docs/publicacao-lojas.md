# Guia de Publicação nas Lojas — Food Truck App

**Versão:** 0.4.0  
**Package Android:** `br.app.foodtruck.mobile`  
**Bundle ID iOS:** `br.app.foodtruck.mobile`  
**EAS Project ID:** _(a ser gerado com `eas init`)_

---

## Fase 1 — Google Play Store (Android)

### 1.1 Pré-requisitos

- [ ] Conta de desenvolvedor Google Play criada ([console.play.google.com](https://play.google.com/console)) — taxa única de US$ 25
- [ ] EAS CLI instalado e autenticado (`npm install -g eas-cli && eas login`)
- [ ] Variáveis de ambiente de produção configuradas no `eas.json` (profile `production`)
- [ ] Ícone (`icon.png` 1024x1024) e Splash Screen prontos em `apps/mobile/assets/`
- [ ] Adaptive Icon (`adaptive-icon.png` 1024x1024 foreground) pronto

### 1.2 Preparar Assets para a Loja

| Asset | Requisito | Localização |
|-------|-----------|-------------|
| Ícone do app | 512x512 PNG, 32-bit, sem transparência | Upload no Play Console |
| Feature Graphic | 1024x500 PNG ou JPG | Upload no Play Console |
| Screenshots | Mín. 2, entre 320px e 3840px (lado maior) | Upload no Play Console |
| Descrição curta | Máx. 80 caracteres | Play Console > Ficha da loja |
| Descrição completa | Máx. 4000 caracteres | Play Console > Ficha da loja |

### 1.3 Gerar Build de Produção

```bash
# Na raiz do monorepo
cd apps/mobile

# Build AAB (Android App Bundle) para produção
eas build --platform android --profile production
```

O comando gera um `.aab` assinado automaticamente pela EAS. O versionamento é incrementado automaticamente (`"autoIncrement": true` no `eas.json`).

### 1.4 Criar App no Google Play Console

1. Acessar [Google Play Console](https://play.google.com/console)
2. **Criar app** → Preencher:
   - Nome: `Food Truck App`
   - Idioma padrão: Português (Brasil)
   - Tipo: App
   - Gratuito ou Pago: Gratuito
3. Aceitar declarações de políticas

### 1.5 Configurar Ficha da Loja

#### Nome do App

> `Food Truck App — Pedidos e Fila`

Alternativas:
- `Food Truck App — Gestão de Pedidos`
- `Pedidos Food Truck — Fila e Cardápio`

> O nome pode ter até 30 caracteres no Google Play. Escolha o que melhor comunica o valor.

#### Descrição Curta (máx. 80 caracteres)

> Opção 1 (recomendada):

```
Gerencie pedidos, fila e cardápio do seu food truck em tempo real.
```

> Opção 2:

```
Controle de pedidos, pagamentos e fila para food trucks.
```

> Opção 3 (foco WhatsApp):

```
Pedidos presenciais e via WhatsApp para seu food truck.
```

#### Descrição Completa (máx. 4000 caracteres)

```
O Food Truck App é a solução completa para operadores de food trucks gerenciarem pedidos, fila de preparo, cardápio e pagamentos — tudo em tempo real, na palma da mão.

PARA QUEM É?
Operadores e donos de food trucks, trailers, quiosques e pequenos restaurantes que precisam organizar o fluxo de pedidos e comunicação com a equipe de cozinha.

PRINCIPAIS FUNCIONALIDADES:

📋 Gestão de Pedidos
• Crie pedidos presenciais com poucos toques
• Receba pedidos automaticamente via WhatsApp (bot integrado)
• Acompanhe cada pedido do início à entrega
• Edite itens enquanto o pedido está aguardando

🔄 Fila em Tempo Real
• Visualize todos os pedidos organizados por status
• Avance o status com um toque: Aguardando → Preparando → Pronto → Entregue
• Filtre por status para focar no que importa
• Atualizações instantâneas em todos os dispositivos conectados

🍔 Cardápio Digital
• Cadastre e organize itens por categoria
• Defina preços, ative ou desative itens rapidamente
• O cardápio alimenta automaticamente o bot do WhatsApp

💰 Pagamentos
• Registre pagamentos por PIX, Cartão ou Dinheiro
• Acompanhe o resumo financeiro do dia
• Visualize totais por forma de pagamento

🤖 Bot WhatsApp (Integrado)
• Seus clientes fazem pedidos diretamente pelo WhatsApp
• Cardápio exibido automaticamente com preços
• Carrinho interativo com confirmação de pedido
• Pedidos do WhatsApp caem direto na fila de preparo

👨‍🍳 Painel do Preparador (Web)
• Tela dedicada para a equipe de cozinha (funciona em tablet/PC)
• Fila atualizada em tempo real via WebSocket
• Interface limpa e focada no avanço de status

📊 Resumo do Dia
• Totais de vendas e quantidade de pedidos
• Breakdown por forma de pagamento
• Visão consolidada para fechamento de caixa

🎨 Sua Marca, Seu App
• Visual personalizável (cores, logo, nome do negócio)
• Cada food truck tem seu próprio espaço isolado e seguro

SEGURANÇA:
• Autenticação segura com sessão protegida
• Dados 100% isolados entre clientes
• Comunicação criptografada

IDEAL PARA:
• Food trucks e trailers
• Hamburguerias e pastelarias
• Açaiterias e creperias
• Quiosques e barracas de feira
• Qualquer operação de alimentação que precise organizar pedidos

Simplifique sua operação. Menos papel, menos confusão, mais pedidos entregues no tempo certo.
```

#### Feature Graphic (Sugestão de conteúdo)

Imagem 1024x500 com:
- Fundo na cor primária do app ou gradient suave
- Mockup do celular mostrando a tela de fila
- Texto: "Pedidos organizados, do WhatsApp à entrega"
- Logo do app

#### Screenshots (Sugestões de telas para capturar)

| # | Tela | Texto overlay sugerido |
|---|------|----------------------|
| 1 | Fila de Pedidos (com cards coloridos) | "Fila em tempo real" |
| 2 | Criação de Pedido (seleção de itens) | "Crie pedidos em segundos" |
| 3 | Tela de Pagamento | "Registre pagamentos rápido" |
| 4 | Cardápio (listagem com categorias) | "Cardápio digital completo" |
| 5 | Resumo do Dia (totais) | "Fechamento de caixa fácil" |
| 6 | Conversa WhatsApp (bot em ação) | "Pedidos via WhatsApp" |
| 7 | Gestão de Usuários | "Equipe sob controle" |
| 8 | Painel Web (tablet mockup) | "Preparador em tempo real" |

> Mínimo obrigatório: 2 screenshots. Recomendado: 4–8 para melhor conversão.

#### Categorização

- **Categoria principal:** Alimentação e Bebida
- **Categoria secundária:** Produtividade (se disponível)
- **Tags sugeridas:** food truck, pedidos, gestão, fila, cardápio, delivery, WhatsApp, restaurante

#### Ícone (Diretrizes)

- 512x512 PNG, 32-bit
- Sem transparência, sem cantos arredondados (o Google aplica a máscara)
- Sugestão: ícone simples com referência a food/pedido (sacola, ticket, caminhão estilizado)
- Cores alinhadas com a identidade do app

### 1.6 Configurar Conteúdo do App

No menu **Política** → **Conteúdo do app**, preencher todos os formulários obrigatórios:

- [ ] Política de privacidade (URL pública obrigatória)
- [ ] Classificação de conteúdo (questionário)
- [ ] Público-alvo e conteúdo (faixa etária 18+, app B2B)
- [ ] Acesso ao app (fornecer credenciais de teste para revisão)
- [ ] Declaração de anúncios (sem anúncios)
- [ ] Permissões e APIs que acessam dados do usuário
- [ ] Segurança de dados (declarar coleta: email, dados de pedido)

#### Formulário de Segurança de Dados (respostas sugeridas)

O Google Play exige uma declaração detalhada sobre coleta e uso de dados. Use estas respostas:

| Pergunta | Resposta |
|----------|---------|
| O app coleta ou compartilha dados de usuários? | **Sim** |
| Todos os dados coletados são criptografados em trânsito? | **Sim** (HTTPS/TLS) |
| Você oferece um meio para exclusão de dados? | **Sim** (contato via email na política de privacidade) |

**Tipos de dados coletados:**

| Categoria | Tipo | Coletado | Compartilhado | Finalidade |
|-----------|------|----------|---------------|-----------|
| Informações pessoais | Endereço de e-mail | Sim | Não | Funcionalidade do app, Gerenciamento de conta |
| Informações pessoais | Nome | Sim | Não | Funcionalidade do app |
| Informações financeiras | Histórico de compras | Sim | Não | Funcionalidade do app |
| Atividade do app | Interações no app | Sim | Não | Funcionalidade do app |

**O que NÃO coletamos (responder "Não" para):**
- Localização
- Fotos e vídeos
- Áudio
- Arquivos e documentos
- Calendário
- Contatos
- Mensagens (SMS/MMS)
- Identificadores do dispositivo
- Dados de saúde e fitness

#### Notas de Versão (primeira publicação)

```
Versão inicial do Food Truck App! 🚚

Gerencie pedidos do seu food truck de forma rápida e organizada:
• Crie pedidos presenciais com poucos toques
• Receba pedidos via WhatsApp automaticamente
• Acompanhe a fila de preparo em tempo real
• Cadastre e organize seu cardápio
• Registre pagamentos (PIX, Cartão, Dinheiro)
• Visualize o resumo financeiro do dia
• Gerencie sua equipe com controle de acesso
```

#### Credenciais de Teste (para revisão do Google)

Na seção "Acesso ao app", informar:

```
Email: [EMAIL_DEMO]
Senha: [SENHA_DEMO]

Instruções: Após login, o app exibe a fila de pedidos. Use a aba "Novo Pedido" para criar pedidos, avance status na fila e registre pagamentos. O cardápio pode ser gerenciado na aba "Cardápio".
```

### 1.7 Fazer Upload e Publicar

1. **Testes** → **Teste interno** (recomendado para primeiro upload):
   - Criar faixa de teste interno
   - Fazer upload do `.aab` gerado pela EAS
   - Adicionar testadores por email
   - Publicar faixa de teste
2. Validar o app no teste interno
3. **Produção** → **Criar nova versão**:
   - Upload do `.aab` (ou promover da faixa de teste)
   - Preencher notas de versão (pt-BR)
   - **Enviar para revisão**

Alternativamente, usar EAS Submit:

```bash
eas submit --platform android --profile production
```

> A primeira submissão requer upload manual. Após isso, `eas submit` funciona para atualizações.

### 1.8 Submissão via EAS Submit (atualizações futuras)

Para automatizar submissões futuras, configure a Service Account:

1. No Google Cloud Console, criar uma **Service Account** com acesso ao Play Console
2. Baixar o JSON da chave
3. Configurar no EAS:

```bash
eas credentials --platform android
# Ou adicionar no eas.json:
```

```json
{
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./path-to-service-account.json",
        "track": "production"
      }
    }
  }
}
```

4. Para próximas versões:

```bash
eas build --platform android --profile production --auto-submit
```

### 1.9 Checklist Pré-Publicação (Android)

- [ ] App testado em dispositivo físico
- [ ] Política de privacidade publicada em URL pública
- [ ] Screenshots atualizadas refletindo a versão atual
- [ ] Variáveis de ambiente de produção corretas (API URL, Supabase)
- [ ] Deep links configurados (scheme: `order-system`)
- [ ] ProGuard/R8 não está quebrando o bundle
- [ ] Performance aceitável em dispositivos de entrada (2GB RAM)
- [ ] Crashlytics ou similar configurado para monitoramento pós-launch
- [ ] Formulário de segurança de dados preenchido no Play Console

### 1.10 Tempo Estimado de Revisão

- Primeira submissão: **3 a 7 dias úteis**
- Atualizações subsequentes: **1 a 3 dias úteis**

---

## Fase 2 — Apple App Store (iOS)

### 2.1 Pré-requisitos

- [ ] Conta Apple Developer ativa ([developer.apple.com](https://developer.apple.com)) — US$ 99/ano
- [ ] Mac com Xcode instalado (necessário para screenshots no Simulator, opcional se usar EAS)
- [ ] EAS CLI instalado e autenticado
- [ ] Apple ID configurado na EAS (`eas credentials --platform ios`)
- [ ] Bundle Identifier registrado: `app.foodtruck.mobile`

### 2.2 Configurar Credenciais iOS na EAS

```bash
# Configura certificates e provisioning profiles automaticamente
eas credentials --platform ios
```

A EAS gerencia automaticamente:
- Distribution Certificate
- Provisioning Profile
- Push Notification Certificate (se necessário)

### 2.3 Preparar Assets para a App Store

| Asset | Requisito |
|-------|-----------|
| Ícone | 1024x1024 PNG, sem alpha, sem camadas |
| Screenshots iPhone 6.7" | 1290x2796 ou 1284x2778 (obrigatório) |
| Screenshots iPhone 6.5" | 1242x2688 ou 1284x2778 (obrigatório) |
| Screenshots iPad 12.9" | 2048x2732 (obrigatório se `supportsTablet: true`) |
| Descrição | Máx. 4000 caracteres |
| Texto promocional | Máx. 170 caracteres |
| Palavras-chave | Máx. 100 caracteres, separadas por vírgula |
| URL de suporte | Obrigatória |
| URL da política de privacidade | Obrigatória |

> **Atenção:** Como `supportsTablet: true` está configurado no `app.json`, screenshots de iPad são obrigatórias. Caso não queira suportar iPad inicialmente, altere para `false`.

### 2.4 Gerar Build de Produção (iOS)

```bash
cd apps/mobile

# Build IPA para produção
eas build --platform ios --profile production
```

A EAS gera um `.ipa` assinado com os certificates gerenciados.

### 2.5 Criar App no App Store Connect

1. Acessar [App Store Connect](https://appstoreconnect.apple.com)
2. **Meus Apps** → **+** → **Novo App**
   - Plataformas: iOS
   - Nome: `Food Truck App`
   - Idioma principal: Português (Brasil)
   - Bundle ID: `app.foodtruck.mobile`
   - SKU: `foodtruck-mobile-001`
3. Preencher informações gerais

### 2.6 Configurar Informações do App

#### Aba "Informações do App"
- Categoria primária: Alimentação e Bebida
- Categoria secundária: Produtividade
- Classificação etária: 4+ (sem conteúdo objetionável)
- Licença (EULA): Padrão Apple ou personalizada

#### Textos da Ficha (App Store)

**Subtítulo** (máx. 30 caracteres):

```
Pedidos e fila em tempo real
```

**Texto Promocional** (máx. 170 caracteres — pode ser atualizado sem nova versão):

```
Gerencie pedidos presenciais e via WhatsApp, acompanhe a fila de preparo em tempo real e controle pagamentos. Ideal para food trucks e trailers.
```

**Descrição** (máx. 4000 caracteres):

> Usar a mesma descrição completa da seção 1.5 (Google Play). A Apple aceita o mesmo texto.

**Palavras-chave** (máx. 100 caracteres, separadas por vírgula):

```
food truck,pedidos,fila,cardápio,whatsapp,delivery,pagamento,cozinha,preparo
```

> Não repita palavras do nome do app (Apple já indexa automaticamente).

**URL de Suporte:**

```
https://[SEU_DOMINIO]/suporte
```

**URL de Marketing (opcional):**

```
https://[SEU_DOMINIO]
```

**Notas da Primeira Versão:**

```
Versão inicial do Food Truck App.

• Criação e gestão de pedidos presenciais
• Bot WhatsApp integrado para receber pedidos
• Fila de preparo em tempo real
• Cardápio digital com categorias
• Registro de pagamentos (PIX, Cartão, Dinheiro)
• Resumo financeiro do dia
• Gestão de equipe (usuários e permissões)
• Visual personalizável por food truck
```

#### Informações de Revisão (Review Notes)

```
Este é um app B2B para operadores de food trucks. Requer login para acesso.

Credenciais de teste:
Email: [EMAIL_DEMO]
Senha: [SENHA_DEMO]

Após login, o app exibe a fila de pedidos do food truck. É possível:
1. Criar um novo pedido (aba "Novo Pedido")
2. Visualizar e avançar status na fila
3. Registrar pagamentos
4. Gerenciar cardápio (aba "Cardápio")

O bot WhatsApp funciona apenas com número conectado e não pode ser demonstrado em ambiente de revisão, mas os pedidos originados por WhatsApp aparecem normalmente na fila.
```

#### Aba "Privacidade do App"
Preencher App Privacy Details:
- **Dados coletados:** Email, nome do cliente, dados de pedido
- **Uso dos dados:** Funcionalidade do app
- **Dados vinculados ao usuário:** Email (autenticação)
- **Dados não vinculados:** Nenhum

#### Aba "Preço e Disponibilidade"
- Preço: Gratuito
- Disponibilidade: Brasil (adicionar outros países conforme necessário)

### 2.7 Preparar Versão para Revisão

1. **App Store** → **iOS App** → **+ Versão** (ou editar versão pendente)
2. Preencher:
   - Novidades desta versão (notas de atualização)
   - Screenshots para cada tamanho de tela
   - Descrição e texto promocional
3. **Build:** selecionar o build enviado pela EAS
4. **Informações de Revisão:**
   - Notas para o revisor: explicar que é app B2B para food trucks
   - Credenciais de login para teste (email/senha demo)
   - Informações de contato para revisão

### 2.8 Submeter para Revisão

#### Opção A — Via App Store Connect (manual)
1. Verificar que todos os campos estão preenchidos (indicador verde)
2. Clicar em **"Adicionar para revisão"**
3. Confirmar submissão

#### Opção B — Via EAS Submit (automatizado)
```bash
eas submit --platform ios --profile production
```

Ou build + submit em um comando:
```bash
eas build --platform ios --profile production --auto-submit
```

### 2.9 Guidelines Comuns de Rejeição (e como evitar)

| Motivo de Rejeição | Como Evitar |
|-------------------|-------------|
| **4.2 — Minimum Functionality** | Garantir que o app tem funcionalidade suficiente para aprovação standalone. Incluir walkthrough/onboarding. |
| **2.1 — App Completeness** | Não submeter com telas placeholder ou funcionalidades quebradas |
| **5.1.1 — Data Collection** | Privacy labels devem refletir exatamente os dados coletados |
| **2.3.3 — Screenshots** | Screenshots devem refletir a experiência real do app |
| **Login obrigatório** | Fornecer conta demo nas notas de revisão |

### 2.10 Checklist Pré-Publicação (iOS)

- [ ] App testado em dispositivo iOS físico (ou Simulator para screenshots)
- [ ] Screenshots geradas para todos os tamanhos obrigatórios
- [ ] Política de privacidade em URL pública
- [ ] App Privacy labels preenchidos no App Store Connect
- [ ] Conta demo funcional para revisão
- [ ] `supportsTablet` revisado (se true, app deve funcionar bem em iPad)
- [ ] Nenhum uso de APIs privadas
- [ ] Sem referências a plataformas concorrentes (Android, etc.)
- [ ] App não crasha no launch (testar cold start)
- [ ] Permissões justificadas (nenhuma permissão desnecessária)
- [ ] URL de suporte funcional

### 2.11 Tempo Estimado de Revisão

- Primeira submissão: **1 a 3 dias úteis** (Apple é mais rápida que Google)
- Rejeição: corrigir e resubmeter (volta para fila, +1-2 dias)
- Atualizações: **< 24 horas** após aprovação inicial

---

## Fluxo Resumido (Ambas as Plataformas)

```
┌─────────────────────────────────────────────────────────┐
│                    PREPARAÇÃO                             │
├─────────────────────────────────────────────────────────┤
│ 1. Contas de desenvolvedor ativas                        │
│ 2. Assets gráficos prontos (ícone, screenshots)          │
│ 3. Política de privacidade publicada                     │
│ 4. Variáveis de ambiente de produção configuradas        │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      BUILD                               │
├─────────────────────────────────────────────────────────┤
│ eas build --platform all --profile production            │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐   ┌──────────────────────┐
│   GOOGLE PLAY (AAB)  │   │   APP STORE (IPA)    │
├──────────────────────┤   ├──────────────────────┤
│ 1. Upload AAB        │   │ 1. Upload IPA        │
│ 2. Ficha da loja     │   │ 2. Metadata          │
│ 3. Segurança dados   │   │ 3. Privacy labels    │
│ 4. Teste interno     │   │ 4. Revisão Apple     │
│ 5. Enviar revisão    │   │ 5. Publicar          │
│ 6. Publicar          │   │                      │
└──────────────────────┘   └──────────────────────┘
```

---

## Comandos Rápidos (Referência)

```bash
# Build Android produção
eas build --platform android --profile production

# Build iOS produção
eas build --platform ios --profile production

# Build ambas plataformas
eas build --platform all --profile production

# Submit Android
eas submit --platform android --profile production

# Submit iOS
eas submit --platform ios --profile production

# Build + Submit automático
eas build --platform all --profile production --auto-submit

# Verificar status dos builds
eas build:list

# Verificar credenciais
eas credentials --platform ios
eas credentials --platform android
```

---

## Atualizações OTA (Over-the-Air)

Para atualizações que não alteram código nativo (apenas JS/assets), use EAS Update:

```bash
# Publicar update para produção
eas update --branch production --message "fix: corrige cálculo do total"

# Verificar updates publicados
eas update:list
```

Isso permite corrigir bugs e publicar melhorias sem passar pela revisão da loja.

---

## Referências

- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [Expo EAS Submit](https://docs.expo.dev/submit/introduction/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
