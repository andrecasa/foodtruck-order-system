# Requirements Document

## Introduction

Esta feature (`landing-onboarding`) cria uma **landing page de divulgação** e um
**fluxo de onboarding self-service** para novos tenants do `order-system`. Um
cliente potencial acessa a página pública, conhece o produto e se cadastra para
um **teste gratuito de 30 dias** informando: nome da empresa, e-mail/senha,
logomarca (upload) e um **preset de cores** para a identidade visual. O
cardápio inicial é um preset **genérico único**, aplicado automaticamente a
todos os novos tenants (não escolhido pelo cliente); as cores da identidade
visual são definidas pelo preset de cores escolhido no cadastro.

A landing page e o formulário de cadastro ficam **dentro do app web existente**
(`apps/web`, Vite). É introduzido roteamento (`react-router`), e o `apps/web`
passa a servir **apenas rotas públicas** (landing + onboarding). As telas
`LoginPage`/`QueuePage` são **descontinuadas nesta entrega**, pois a
funcionalidade equivalente (login + fila/painel do operador) já existe no PWA
operador em `order.foodtruck.app.br` (que **não é alterado** por esta feature).
Como o painel autenticado deixa de existir no `apps/web`, o subdomínio
`web.foodtruck.app.br` será removido do Nginx, passando a landing a ser servida
por `foodtruck.app.br` (que mantém o proxy `/tenant-assets/`).

No backend, a feature expõe um **endpoint HTTP público de signup**
(platform-level) que valida a entrada com Zod, aplica rate-limit, faz o upload
da logomarca para o bucket S3 já provisionado e reaproveita o serviço
transacional/idempotente `provisionTenant` (em
`apps/backend/src/services/tenant-provision.service.ts`) para criar o tenant. Um
endpoint adicional lista os presets disponíveis para a UI. Uma nova migration
(`015_*`) adiciona `trial_ends_at` à tabela `tenants` para registrar, expirar,
bloquear o acesso e avisar sobre o teste gratuito.

## Glossary

- **Landing_Page**: Página pública de marketing servida pelo `apps/web`, com
  conteúdo de divulgação do produto e um CTA (call-to-action) que leva ao
  formulário de cadastro.
- **Signup_Form**: Formulário público, no `apps/web`, para cadastro
  self-service de um novo tenant (nome da empresa, nome do responsável,
  telefone/WhatsApp de contato, e-mail/senha do administrador, slug, logomarca
  e preset de cores).
- **Web_Router**: Roteamento por URL introduzido no `apps/web` com `react-router`
  (nova dependência a ser adicionada ao `apps/web/package.json`), substituindo o
  roteamento por estado atual baseado em `useAuth()` no `App.tsx`. Organiza apenas
  as rotas públicas (`Landing_Page`, `Signup_Form`) como navegação interna no mesmo
  domínio, já que as telas autenticadas (`LoginPage`, `QueuePage`) são descontinuadas
  nesta entrega; qualquer rota não pública é direcionada para a `Landing_Page`.
  Detalhes de implementação e a remoção segura dos hooks de autenticação órfãos
  (`AuthProvider`/`useAuth`) ficam para o design.
- **Operator_PWA**: PWA do operador (app Expo/React Native Web) já existente,
  servido em `order.foodtruck.app.br`, que provê login e a fila/painel do
  operador. Assume a funcionalidade das descontinuadas `LoginPage`/`QueuePage`
  do `apps/web`. Não é alterado por esta feature.
- **Signup_Endpoint**: Endpoint HTTP público platform-level
  (`POST /api/signup`) que recebe o cadastro, valida com Zod, aplica rate-limit,
  faz o upload da logomarca e chama `Provisioning_Service`.
- **Presets_Endpoint**: Endpoint HTTP público (`GET /api/signup/color-presets`)
  que lista os presets de CORES (Color_Preset) disponíveis para o `Signup_Form`.
- **Signup_Service**: Serviço platform-level de backend que orquestra o
  cadastro (validação, upload de logo, derivação da `logoUrl`, chamada ao
  `Provisioning_Service`, cálculo do `trial_ends_at`).
- **Provisioning_Service**: Serviço existente `provisionTenant`
  (`tenant-provision.service.ts`): cria tenant + branding/tema + menu (preset) +
  admin (Supabase Auth + `users`) + instância Evolution/WhatsApp, de forma
  transacional, atômica e idempotente por `provisioning_key`.
- **Provisioning_Key**: Valor duplo já existente em `tenants.provisioning_key`:
  chave de idempotência do provisionamento e slug público do tenant.
- **Slug**: Identificador público URL-friendly do tenant, igual à
  `Provisioning_Key`. Formato exigido pelo backend: 3–60 caracteres, apenas
  minúsculas, dígitos e hífen, sem começar/terminar com hífen, e não pode ser
  reservado.
- **Reserved_Slugs**: Conjunto de slugs proibidos definido em
  `tenant-provision.service.ts`: `api`, `admin`, `health`, `webhook`, `static`,
  `assets`, `public`, `login`, `queue`.
- **Slug_Availability_Endpoint**: Endpoint HTTP público que informa se um slug
  candidato tem formato válido e está disponível (não usado por outro tenant e
  não reservado).
- **Onboarding_Preset**: Formato de preset de cardápio já existente
  (`OnboardingPreset`): lista de categorias, cada uma com nome, `sortOrder`
  opcional e itens (`name`, `priceCents`). Nesta feature, é usado um **único**
  Onboarding_Preset **genérico** — armazenado em `apps/backend/presets/`
  (arquivo próprio; nome definido no design) — aplicado a todos os novos tenants
  como `menuPreset`, não escolhido pelo cliente.
- **Color_Preset**: Paleta de cores completa exposta pelo backend a partir de
  arquivos em `apps/backend/presets/` (mesmo padrão do preset de cardápio
  existente), com identificador, rótulo exibível e o objeto `colors` completo
  (todos os tokens de `colors.*` de `ThemeConfig`). Um Color_Preset NÃO inclui
  `businessName`. O preset escolhido é convertido em um `Partial<ThemeConfig>`
  cujo `colors` é a paleta do preset; o `Signup_Service` acrescenta o
  `businessName` do cadastro antes de repassar como `theme` do tenant, aplicado
  sobre o `NEUTRAL_PLATFORM_THEME` via `deepMergeTheme`.
- **Logo_Upload**: Arquivo de logomarca enviado pelo cliente no `Signup_Form`.
- **Assets_Bucket**: Bucket S3 privado já provisionado (`order-system-assets`,
  região `us-east-1`), cujo nome é lido da variável de ambiente
  `ASSETS_S3_BUCKET`.
- **Assets_Public_Base_Url**: URL base pública do domínio que serve os assets
  via proxy Nginx em `/tenant-assets/`, lida da variável de ambiente
  `ASSETS_PUBLIC_BASE_URL`.
- **Logo_Object_Key**: Chave do objeto no `Assets_Bucket`, no formato
  `tenant-assets/{slug}/logo.{ext}`.
- **Logo_Public_Url**: URL pública da logomarca, no formato
  `{ASSETS_PUBLIC_BASE_URL}/tenant-assets/{slug}/logo.{ext}`, repassada como
  `logoUrl` ao `Provisioning_Service`.
- **Trial_Period**: Período de teste gratuito de 30 dias corridos a partir da
  data de cadastro do tenant.
- **Trial_Ends_At**: Coluna nova `tenants.trial_ends_at` (TIMESTAMPTZ) que
  registra o instante de expiração do `Trial_Period`.
- **Trial_Guard**: Verificação de backend que bloqueia o acesso do tenant
  quando o `Trial_Period` expirou e não houve conversão. Atua tanto no fluxo
  autenticado (estendendo o `tenant.middleware`, que hoje bloqueia por
  `status !== 'ativo'`) quanto no fluxo público de customer-ordering por slug
  (estendendo o `public-tenant.middleware`, que hoje resolve o tenant por
  `provisioning_key` com `status = 'ativo'`). O bloqueio se baseia em
  `trial_ends_at` e no indicador de conversão (Tenant_Convertido), não no enum
  `status`: um tenant em teste permanece com `status = 'ativo'`, preservando a
  semântica de `status`.
- **Tenant_Convertido**: Tenant que passou de teste gratuito para assinante
  pago, representado por uma coluna específica em `tenants` (nome definido no
  design), distinta e ortogonal ao `status` (`ativo`/`inativo`). Um tenant em
  teste permanece com `status = 'ativo'`.
- **Contato_Comercial**: Dados de contato do tenant coletados no cadastro para
  follow-up comercial e posterior contrato — nome do responsável e
  telefone/WhatsApp de contato — registrados em colunas próprias de `tenants`
  (nome/tipo definidos no design), distintos dos dados do administrador
  (Supabase Auth).
- **Trial_Warning**: Aviso exibido ao usuário quando o `Trial_Period` está
  próximo do fim.
- **Error_Envelope**: Envelope de resposta de erro padrão do projeto
  `{ statusCode, error, message }`, produzido pelo `errorHandler` central.
- **Rate_Limiter**: Middleware `express-rate-limit` aplicado localmente às rotas
  de signup para limitar requisições por IP.

## Requirements

### Requirement 1: Landing page de divulgação

**User Story:** Como visitante interessado no produto, quero ver uma página de
divulgação com um chamado para ação, para entender o produto e iniciar um teste
gratuito.

#### Acceptance Criteria

1. WHEN um visitante acessa a rota pública raiz do `apps/web`, THE Landing_Page
   SHALL exibir o conteúdo de divulgação do produto e um CTA para iniciar o
   teste gratuito.
2. WHEN o visitante aciona o CTA de teste gratuito na Landing_Page, THE
   Web_Router SHALL navegar para a rota do Signup_Form.
3. THE Landing_Page SHALL ser renderizada sem exigir autenticação.

### Requirement 2: Descontinuação do painel no apps/web e roteamento público

**User Story:** Como operador da plataforma, quero que o `apps/web` sirva apenas a landing e o onboarding, com o painel autenticado permanecendo no PWA operador já existente, para evitar funcionalidade duplicada.

#### Acceptance Criteria

1. THE Web_Router SHALL servir no `apps/web` apenas as rotas públicas (Landing_Page e Signup_Form), sem expor rotas autenticadas.
2. THE apps/web SHALL descontinuar as telas `LoginPage` e `QueuePage`, cuja funcionalidade equivalente já é provida pelo Operator_PWA em `order.foodtruck.app.br`.
3. WHEN um usuário acessa no `apps/web` qualquer rota que não seja pública (incluindo as rotas anteriormente atendidas por `LoginPage`/`QueuePage` e rotas inexistentes), THE Web_Router SHALL direcioná-lo para a Landing_Page.
4. THE feature SHALL NOT modificar o Operator_PWA (`order.foodtruck.app.br`).

Consideração para o design (registrar, não implementar agora): a remoção de `LoginPage`/`QueuePage` e dos hooks de autenticação do apps/web (ex.: AuthProvider/useAuth) deve ser tratada com segurança, garantindo que nenhum outro ponto do apps/web dependa desse código removido. Nenhuma alteração no Operator_PWA.

### Requirement 3: Cadastro de dados da empresa, contato e administrador

**User Story:** Como novo cliente, quero informar o nome da minha empresa, um
contato comercial e as credenciais do administrador, para criar minha conta de
teste e permitir o acompanhamento comercial.

#### Acceptance Criteria

1. THE Signup_Form SHALL solicitar como campos obrigatórios o nome da empresa,
   o nome do responsável (Contato_Comercial), o telefone/WhatsApp de contato, o
   e-mail do administrador e a senha do administrador.
2. IF o nome da empresa estiver vazio (após remoção de espaços em branco nas
   extremidades) ou exceder 120 caracteres, THEN THE Signup_Service SHALL
   rejeitar o cadastro com o Error_Envelope, código `VALIDATION_ERROR` e status
   422, com mensagem em pt-BR, sem criar tenant ou administrador.
3. IF o nome do responsável estiver vazio (após remoção de espaços em branco nas
   extremidades), THEN THE Signup_Service SHALL rejeitar o cadastro com o
   Error_Envelope, código `VALIDATION_ERROR` e status 422, com mensagem em
   pt-BR, sem criar tenant ou administrador.
4. IF o telefone/WhatsApp de contato estiver vazio ou não corresponder a um
   formato de telefone válido, THEN THE Signup_Service SHALL rejeitar o cadastro
   com o Error_Envelope, código `VALIDATION_ERROR` e status 422, com mensagem em
   pt-BR, sem criar tenant ou administrador.
5. IF o e-mail do administrador tiver formato inválido, THEN THE Signup_Service
   SHALL rejeitar o cadastro com o Error_Envelope, código `VALIDATION_ERROR` e
   status 422, com mensagem em pt-BR, sem criar tenant ou administrador.
6. IF a senha do administrador não atender ao comprimento mínimo definido
   (valor em aberto, a definir), THEN THE Signup_Service SHALL rejeitar o
   cadastro com o Error_Envelope, código `VALIDATION_ERROR` e status 422, com
   mensagem em pt-BR, sem criar tenant ou administrador.
7. IF o e-mail informado já estiver cadastrado (comparação case-insensitive),
   THEN THE Signup_Service SHALL rejeitar o cadastro com o Error_Envelope,
   código `CONFLICT` e status 409, com mensagem em pt-BR indicando que o e-mail
   já está em uso, sem criar tenant ou administrador.
8. WHEN o nome da empresa, o nome do responsável, o telefone/WhatsApp de
   contato, o e-mail e a senha do administrador forem informados e válidos e o
   e-mail não estiver em uso, THE Signup_Service SHALL criar o administrador via
   Supabase Auth e o registro correspondente na tabela users, registrar o
   Contato_Comercial no tenant, e responder confirmando a criação da conta.

### Requirement 4: Sugestão, edição e validação de formato do slug

**User Story:** Como novo cliente, quero um slug sugerido a partir do nome da
empresa que eu possa editar, para ter um endereço público adequado ao meu
negócio.

#### Acceptance Criteria

1. WHEN o cliente informa o nome da empresa no Signup_Form, THE Signup_Form
   SHALL gerar automaticamente um Slug sugerido derivado do nome removendo
   acentos, convertendo maiúsculas em minúsculas, substituindo espaços e
   caracteres fora de [a-z0-9] por hífen, colapsando hífens consecutivos em um
   único hífen e removendo hífens das extremidades, e SHALL preencher o campo de
   Slug com esse valor mantendo-o editável pelo cliente.
2. WHEN o cliente altera o nome da empresa no Signup_Form e ainda não editou
   manualmente o campo de Slug, THE Signup_Form SHALL substituir o Slug sugerido
   pelo novo valor derivado do nome atualizado; WHILE o cliente já tiver editado
   manualmente o campo de Slug, THE Signup_Form SHALL preservar o valor
   informado pelo cliente sem re-sugerir a partir do nome.
3. THE Signup_Service SHALL validar o formato do Slug exigindo de 3 a 60
   caracteres compostos apenas por letras minúsculas (a-z), dígitos (0-9) e
   hífen, sem iniciar nem terminar com hífen, correspondendo ao padrão
   ^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$.
4. IF o Slug informado tiver formato inválido, incluindo os casos de string
   vazia, comprimento menor que 3 ou maior que 60 caracteres, caracteres fora de
   [a-z0-9-], ou hífen no início/fim, THEN THE Signup_Service SHALL rejeitar o
   cadastro com o Error_Envelope e mensagem em pt-BR descrevendo o formato
   exigido, preservando os demais dados informados sem persistir o cadastro.
5. IF o Slug informado pertencer aos Reserved_Slugs, THEN THE Signup_Service
   SHALL rejeitar o cadastro com o Error_Envelope e mensagem em pt-BR indicando
   que o valor é reservado, preservando os demais dados informados sem persistir
   o cadastro.

### Requirement 5: Checagem de disponibilidade e unicidade do slug

**User Story:** Como novo cliente, quero saber se o slug escolhido está
disponível antes de enviar o cadastro, para corrigi-lo antes de concluir.

#### Acceptance Criteria

1. WHEN o cliente confirma ou edita um Slug candidato no Signup_Form, THE
   Slug_Availability_Endpoint SHALL responder se o Slug tem formato válido e
   está disponível.
2. WHERE o Slug candidato já está em uso por outro tenant, THE
   Slug_Availability_Endpoint SHALL informar que o Slug está indisponível.
3. WHERE o Slug candidato pertence aos Reserved_Slugs, THE
   Slug_Availability_Endpoint SHALL informar que o Slug está indisponível.
4. IF o Slug informado no cadastro já estiver em uso por outro tenant, THEN THE
   Signup_Service SHALL rejeitar o cadastro com o Error_Envelope e mensagem em
   pt-BR indicando que o Slug já está em uso.

### Requirement 6: Seleção de preset de cores

**User Story:** Como novo cliente, quero escolher um preset de cores adequado ao
meu negócio, para que meu tenant já comece com uma identidade visual coerente.

#### Acceptance Criteria

1. WHEN o Signup_Form é carregado, THE Presets_Endpoint SHALL retornar a lista
   dos Color_Presets disponíveis, cada um com um identificador, um rótulo
   exibível e a paleta de cores completa correspondente.
2. THE Signup_Form SHALL exibir os Color_Presets retornados e permitir que o
   cliente selecione exatamente um.
3. IF o Color_Preset selecionado no cadastro não corresponder a um preset
   disponível, THEN THE Signup_Service SHALL rejeitar o cadastro com o
   Error_Envelope, código `VALIDATION_ERROR` e status 422, com mensagem em
   pt-BR.
4. THE cada Color_Preset SHALL definir a paleta completa de `colors.*` (todos os
   tokens de cor de `ThemeConfig`), sem depender do NEUTRAL_PLATFORM_THEME para
   preencher tokens de cor omitidos.
5. THE Color_Preset SHALL NOT incluir o `businessName`.
6. WHEN o cadastro é enviado, THE Signup_Service SHALL montar o `theme` do
   tenant combinando o `colors` completo do Color_Preset selecionado com o
   `businessName` informado no cadastro, e repassá-lo como `theme`
   (`Partial<ThemeConfig>`) ao Provisioning_Service.
7. THE Signup_Service SHALL utilizar um Onboarding_Preset genérico único como
   `menuPreset` no provisionamento, sem que o cliente escolha o cardápio.
8. THE Presets_Endpoint SHALL obter os Color_Presets a partir de arquivos em
   `apps/backend/presets/`, sendo o backend a fonte da verdade dos presets
   disponíveis.

### Requirement 7: Upload da logomarca

**User Story:** Como novo cliente, quero enviar a logomarca da minha empresa,
para que ela apareça na identidade visual do meu tenant.

#### Acceptance Criteria

1. WHERE o cadastro inclui uma logomarca, THE Signup_Form SHALL permitir anexar
   exatamente um arquivo de Logo_Upload ao cadastro.
2. WHERE o cadastro não inclui uma logomarca, THE Signup_Service SHALL concluir
   o cadastro sem associar nenhuma Logo_Object_Key ao tenant.
3. IF o tipo do Logo_Upload não for PNG, JPG, JPEG, SVG ou WEBP, THEN THE
   Signup_Service SHALL rejeitar o cadastro com o Error_Envelope e mensagem em
   pt-BR indicando os tipos aceitos (PNG, JPG, JPEG, SVG, WEBP), sem persistir a
   logomarca nem criar o tenant.
4. IF o tamanho do Logo_Upload exceder o limite máximo definido (valor em
   aberto, a definir), THEN THE Signup_Service SHALL rejeitar o cadastro com o
   Error_Envelope e mensagem em pt-BR indicando o tamanho máximo permitido, sem
   persistir a logomarca nem criar o tenant.
5. WHEN um Logo_Upload válido é enviado no cadastro, THE Signup_Service SHALL
   armazenar o arquivo em uma Logo_Object_Key cuja extensão é derivada do tipo
   do arquivo (png, jpg, jpeg, svg ou webp) e associá-la ao tenant criado.

### Requirement 8: Envio da logomarca ao S3 e derivação da URL pública

**User Story:** Como operador da plataforma, quero que a logomarca seja
armazenada no bucket S3 e servida pelo domínio público, para que a identidade
visual do tenant fique disponível sem expor a URL crua do S3.

#### Acceptance Criteria

1. THE Signup_Service SHALL ler o nome do Assets_Bucket da variável de ambiente
   `ASSETS_S3_BUCKET` e a URL base pública da variável de ambiente
   `ASSETS_PUBLIC_BASE_URL`.
2. WHEN um Logo_Upload válido é recebido, THE Signup_Service SHALL enviar o
   arquivo ao Assets_Bucket usando `@aws-sdk/client-s3` autenticado pelo IAM
   role da instância EC2, com a chave Logo_Object_Key no formato
   `tenant-assets/{slug}/logo.{ext}`.
3. WHEN o upload ao Assets_Bucket é concluído, THE Signup_Service SHALL derivar
   a Logo_Public_Url no formato
   `{ASSETS_PUBLIC_BASE_URL}/tenant-assets/{slug}/logo.{ext}` e repassá-la como
   `logoUrl` ao Provisioning_Service.
4. IF a variável `ASSETS_S3_BUCKET` ou `ASSETS_PUBLIC_BASE_URL` estiver ausente,
   THEN THE Signup_Service SHALL rejeitar o cadastro com o Error_Envelope,
   código `INTERNAL_ERROR` e status 500, registrando o erro via `logError` sem
   vazar detalhes internos.
5. IF o upload ao Assets_Bucket falhar, THEN THE Signup_Service SHALL rejeitar o
   cadastro com o Error_Envelope e mensagem em pt-BR, sem chamar o
   Provisioning_Service.

### Requirement 9: Endpoint público de signup

**User Story:** Como novo cliente, quero enviar meu cadastro por um endpoint
público, para provisionar meu tenant de teste de forma self-service.

#### Acceptance Criteria

1. THE Signup_Endpoint SHALL ser exposto como a rota HTTP pública platform-level
   `POST /api/signup`, aceitando o corpo no formato `multipart/form-data`
   (campos de cadastro mais o arquivo Logo_Upload), sem exigir autenticação e
   sem escopo de tenant.
2. WHEN uma requisição de cadastro é recebida, THE Signup_Endpoint SHALL validar
   o corpo com um schema Zod antes de qualquer efeito colateral, incluindo antes
   de qualquer upload ao Assets_Bucket ou chamada ao Provisioning_Service.
3. IF o corpo da requisição de cadastro falhar na validação Zod, THEN THE
   Signup_Endpoint SHALL responder com o Error_Envelope, código
   `VALIDATION_ERROR` e status 422, com mensagem em pt-BR, sem produzir qualquer
   efeito colateral.
4. THE Signup_Endpoint SHALL aplicar o Rate_Limiter por IP de origem às
   requisições de cadastro, usando uma janela de tempo e um número máximo de
   requisições por janela definidos (valores em aberto, a definir).
5. IF um IP de origem exceder o número máximo de requisições permitido pelo
   Rate_Limiter na janela vigente, THEN THE Signup_Endpoint SHALL responder com
   status 429 e mensagem em pt-BR, sem produzir qualquer efeito colateral e sem
   chamar o Provisioning_Service.
6. WHEN o cadastro é processado sem erros, THE Signup_Endpoint SHALL responder
   com status 201 e um corpo contendo o identificador do tenant, o Slug e o
   Trial_Ends_At.
7. IF a requisição usar um método HTTP diferente de POST ou um `Content-Type`
   diferente de `multipart/form-data`, THEN THE Signup_Endpoint SHALL rejeitar a
   requisição com o Error_Envelope e mensagem em pt-BR, sem produzir qualquer
   efeito colateral.
8. IF ocorrer um erro inesperado durante o cadastro, THEN THE Signup_Endpoint
   SHALL delegar ao `errorHandler` central, respondendo com o Error_Envelope,
   código `INTERNAL_ERROR` e status 500, sem vazar detalhes internos.

### Requirement 10: Provisionamento reaproveitando o serviço existente

**User Story:** Como operador da plataforma, quero que o cadastro reutilize o
provisionamento transacional existente, para preservar atomicidade e
idempotência.

#### Acceptance Criteria

1. WHEN o cadastro passa na validação, THE Signup_Service SHALL chamar o
   Provisioning_Service `provisionTenant` com o Slug como `provisioningKey`, o
   nome da empresa, a Logo_Public_Url como `logoUrl`, o `theme`
   (`Partial<ThemeConfig>`) composto pelo `colors` completo do Color_Preset
   selecionado e pelo `businessName` do cadastro, o Onboarding_Preset genérico
   único como `menuPreset` e os dados do administrador, e SHALL registrar o
   Contato_Comercial (nome do responsável e telefone/WhatsApp) no tenant
   provisionado.
2. IF o Provisioning_Service lançar `ProvisioningValidationError`, THEN THE
   Signup_Service SHALL mapear o erro para o Error_Envelope com status 422 e
   mensagem em pt-BR listando os campos inválidos.
3. IF o Provisioning_Service lançar `ProvisioningError` e reverter as
   alterações, THEN THE Signup_Service SHALL mapear o erro para o Error_Envelope
   com mensagem em pt-BR indicando falha no provisionamento, sem vazar detalhes
   internos.
4. WHEN o mesmo cadastro é reenviado com um Slug já provisionado, THE
   Provisioning_Service SHALL retornar o tenant existente sem criar duplicata
   (idempotência por `provisioning_key`).
5. WHEN o Provisioning_Service retorna um resultado idempotente, THE
   Signup_Endpoint SHALL responder com status 200 e o identificador do tenant
   existente.

### Requirement 11: Registro do período de teste

**User Story:** Como operador da plataforma, quero registrar a data de
expiração do teste gratuito, para controlar o acesso durante e após o período de
teste.

#### Acceptance Criteria

1. THE Signup_Service SHALL registrar o Trial_Ends_At de um novo tenant como a
   data de cadastro acrescida de 30 dias corridos.
2. THE nova migration `015_*` SHALL adicionar à tabela `tenants` a coluna
   `trial_ends_at` (TIMESTAMPTZ), a coluna de indicador de conversão
   (Tenant_Convertido) e as colunas do Contato_Comercial (nome do responsável e
   telefone/WhatsApp de contato), com nomes e tipos exatos a definir no design.
3. WHEN um tenant é provisionado idempotentemente (Slug já existente), THE
   Signup_Service SHALL preservar o Trial_Ends_At já registrado, sem
   reiniciá-lo.

### Requirement 12: Bloqueio de acesso após o fim do teste

**User Story:** Como operador da plataforma, quero bloquear o acesso de tenants
com teste expirado e sem conversão, para que apenas assinantes ativos usem o
sistema.

#### Acceptance Criteria

1. WHILE o Trial_Period de um tenant estiver expirado e o tenant não estiver
   convertido, THE Trial_Guard SHALL negar o login dos usuários do tenant
   respondendo com o Error_Envelope, status 403 e mensagem em pt-BR indicando
   que o período de teste expirou.
2. WHILE o Trial_Period de um tenant estiver expirado e o tenant não estiver
   convertido, THE Trial_Guard SHALL negar toda requisição autenticada ao painel
   do tenant respondendo com o Error_Envelope, status 403 e mensagem em pt-BR
   indicando que o período de teste expirou.
3. WHILE o Trial_Period de um tenant estiver expirado e o tenant não estiver
   convertido, THE Trial_Guard SHALL negar toda requisição autenticada ao app do
   tenant respondendo com o Error_Envelope, status 403 e mensagem em pt-BR
   indicando que o período de teste expirou.
4. WHILE o Trial_Period de um tenant estiver vigente OU o tenant estiver
   convertido, THE Trial_Guard SHALL permitir o login e o uso do painel e do app
   do tenant.
5. THE Trial_Guard SHALL considerar o Trial_Period de um tenant como expirado
   quando, e somente quando, o instante de fim do teste (trial_ends_at) for
   anterior ou igual ao instante atual; enquanto o instante de fim do teste for
   posterior ao instante atual, o Trial_Period é considerado vigente.
6. THE Trial_Guard SHALL representar a conversão de um tenant por meio de uma
   coluna específica em `tenants`, ortogonal ao `status`; um tenant em teste
   permanece com `status = 'ativo'` e é considerado convertido quando, e somente
   quando, essa coluna indicar assinatura paga ativa.
7. WHILE o Trial_Period de um tenant estiver expirado e o tenant não estiver
   convertido, THE Trial_Guard SHALL negar as requisições públicas de pedido do
   cliente final (customer-ordering por slug) respondendo com o Error_Envelope,
   status 403 e mensagem em pt-BR indicando que o estabelecimento está
   indisponível.
8. WHILE o Trial_Period de um tenant estiver vigente OU o tenant estiver
   convertido, THE Trial_Guard SHALL permitir as requisições públicas de pedido
   do cliente final (customer-ordering por slug).

### Requirement 13: Avisos de expiração do teste

**User Story:** Como usuário de um tenant em teste, quero ser avisado quando o
teste estiver perto de acabar, para decidir sobre a conversão a tempo.

#### Acceptance Criteria

1. WHILE o Trial_Period de um tenant estiver vigente e faltando um número de
   dias igual ou menor que o limite de aviso definido para expirar, THE
   Trial_Warning SHALL ser exibido ao usuário informando os dias restantes.
2. WHILE o Trial_Period de um tenant estiver vigente e faltando mais dias que o
   limite de aviso definido, THE Trial_Warning SHALL permanecer oculto.

### Requirement 14: Dependências de infraestrutura

**User Story:** Como operador da plataforma, quero que as dependências de
infraestrutura e a configuração de domínio (Nginx) da landing estejam
documentadas, para que a feature funcione no ambiente provisionado.

#### Acceptance Criteria

1. THE Signup_Service SHALL depender do Assets_Bucket S3 (`order-system-assets`,
   `us-east-1`, privado) já provisionado.
2. THE Signup_Service SHALL depender do IAM role da instância EC2 com acesso de
   escrita ao Assets_Bucket, sem credenciais armazenadas em variáveis de
   ambiente.
3. THE Assets_Public_Base_Url SHALL depender do proxy Nginx que serve
   `/tenant-assets/` a partir do Assets_Bucket.
4. THE feature SHALL remover o `server_name web.foodtruck.app.br` do bloco Nginx
   que serve o `apps/web`, mantendo `foodtruck.app.br` como o domínio que serve
   a Landing_Page.
5. THE bloco Nginx de `foodtruck.app.br` SHALL preservar o proxy
   `location /tenant-assets/` para o Assets_Bucket, do qual a Logo_Public_Url
   depende.
