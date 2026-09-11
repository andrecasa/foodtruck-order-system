# Implementation Plan — landing-onboarding

## Overview

Implementação incremental da landing page + onboarding self-service. O backend
(`apps/backend`, Express 4 ESM) ganha migration `015`, extensão do
`provisionTenant`, loaders de presets, util de upload S3, validação Zod,
`Signup_Service`, endpoints públicos (`POST /api/signup`,
`GET /api/signup/color-presets`, `GET /api/signup/slug-availability`) e o
`Trial_Guard`. O frontend (`apps/web`, Vite + React 19) passa a servir apenas
rotas públicas via `react-router` (`Landing_Page` + `Signup_Form`), removendo com
segurança as telas autenticadas. Cada tarefa constrói sobre a anterior e termina
integrando o código; a verificação usa `typecheck`/`test`/`lint` (single-run) do
app afetado, sem watchers/servidores.

As tarefas seguem o fluxo `routes → controller → service`, reutilizam os helpers
de `src/http/`, o padrão `ServiceError` + `errorHandler`, imports ESM com sufixo
`.js`, Zod (compartilhado em `@order-system/shared` quando aplicável) e mensagens
em pt-BR. Property tests com fast-check + Vitest ficam em
`src/__tests__/properties/*.property.test.ts` (backend); no `apps/web` usa-se
Testing Library.

## Tasks

- [x] 1. Migration 015: colunas de trial, conversão e contato em `tenants`
  - Criar `apps/backend/migrations/015_add_trial_and_contact.sql` com
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`,
    `subscription_status TEXT NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial','active','canceled'))`,
    `contact_name TEXT` e `contact_phone TEXT`, seguindo o padrão nulável de
    `012_add_order_location.sql` (migração sem downtime), com comentários pt-BR
    citando os requisitos.
  - _Requirements: 11.2, 12.6_

- [x] 2. Constantes e tipos compartilhados em `@order-system/shared`
  - [x] 2.1 Exportar `TRIAL_WARNING_DAYS` e tipos de trial/preset no shared
    - Adicionar constante `TRIAL_WARNING_DAYS = 7` e, se aplicável, o tipo
      `ColorPreset` (`{ id: string; label: string; colors: ThemeConfig['colors'] }`)
      em `packages/shared/src/`, exportando pelo índice do pacote (reuso entre
      backend e `apps/web`).
    - _Requirements: 13.1, 13.2, 6.1, 6.4, 6.5_

  - [x] 2.2 Testes unitários das constantes/tipos compartilhados
    - Validar valor de `TRIAL_WARNING_DAYS` e forma do tipo `ColorPreset` (compilação/uso).
    - _Requirements: 13.1, 6.4_

- [x] 3. Estender `provisionTenant` com `contact`, `trialEndsAt` e `subscriptionStatus`
  - [x] 3.1 Adicionar campos opcionais ao `provisionTenant` (INSERT só na criação)
    - Em `apps/backend/src/services/tenant-provision.service.ts`, estender
      `ProvisionTenantInput` com `contact?: { name: string; phone: string } | null`,
      `trialEndsAt?: Date | string | null` e
      `subscriptionStatus?: 'trial' | 'active' | 'canceled'`, incluindo-os no
      `INSERT INTO tenants` **apenas na criação de tenant novo** (dentro da mesma
      transação); no caminho idempotente (`findExistingByKey`) nada é atualizado,
      preservando `trial_ends_at`/contato existentes. Manter assinaturas públicas
      retrocompatíveis (campos omitidos ⇒ defaults do schema). Imports ESM com `.js`.
    - _Requirements: 10.1, 10.4, 11.1, 11.3_

  - [x] 3.2 Property test — idempotência preserva o trial e o contato
    - **Property 11: Provisionamento é idempotente e preserva o trial**
    - **Validates: Requirements 10.4, 11.3**
    - `src/__tests__/properties/provision-trial-idempotency.property.test.ts` via `ProvisionDeps` mock.

  - [x] 3.3 Property test — atomicidade do provisionamento estendido
    - **Property 8: Extensão e chave da logo derivam do tipo do arquivo** (parte de atomicidade do provisionamento; ver Nota)
    - Reafirmar que uma falha reverte todas as escritas (tenant + trial + contato),
      via `ProvisionDeps` mock, em
      `src/__tests__/properties/provision-atomicity.property.test.ts`.
    - _Requirements: 10.3_

- [x] 4. Loader de Color_Presets e preset de cardápio genérico
  - [x] 4.1 Criar `presets/generic-menu.{json,ts}` (Onboarding_Preset único)
    - `apps/backend/presets/generic-menu.json` + `src/presets/generic-menu.ts`
      (`genericMenuPreset`) no padrão do par `pastel-das-meninas.{json,ts}`,
      aplicado a todos os tenants como `menuPreset`.
    - _Requirements: 6.7_

  - [x] 4.2 Criar loader `services/color-presets.ts` + primeiro preset de cores
    - `apps/backend/src/services/color-presets.ts` lê `presets/colors/*.json`
      (fonte da verdade), valida cada um com Zod exigindo a paleta `colors.*`
      **completa** (todos os tokens de `ThemeConfig`) e **sem** `businessName`, e
      expõe `listColorPresets()` e `getColorPreset(id)`. Criar o primeiro preset
      `presets/colors/classico.json`. Imports ESM com `.js`.
    - _Requirements: 6.1, 6.4, 6.5, 6.8_

  - [x] 4.3 Presets de cores adicionais (opcional além do caminho feliz)
    - Criar `presets/colors/vibrante.json` e `presets/colors/noturno.json` com
      paletas completas e válidas pelo mesmo schema.
    - _Requirements: 6.1, 6.4_

  - [x] 4.4 Property test — todo Color_Preset tem paleta completa e sem businessName
    - **Property 6: Todo Color_Preset expõe paleta de cores completa e sem businessName**
    - **Validates: Requirements 6.1, 6.4, 6.5**
    - `src/__tests__/properties/color-preset-completeness.property.test.ts`.

- [x] 5. Util de upload da logo ao S3 (`s3-logo-upload`)
  - [x] 5.1 Adicionar dependência `@aws-sdk/client-s3` ao `apps/backend`
    - Adicionar `@aws-sdk/client-s3` (versão fixada) em `apps/backend/package.json`.
    - _Requirements: 8.2_

  - [x] 5.2 Implementar `services/s3-logo-upload.ts`
    - Enviar a logo via `PutObjectCommand` autenticado pelo IAM role da EC2 (sem
      credenciais em env), chave `tenant-assets/{slug}/logo.{ext}`, `ContentType`
      correto; ler `ASSETS_S3_BUCKET`/`ASSETS_PUBLIC_BASE_URL` (env ausente ⇒
      `ServiceError` 500 `INTERNAL_ERROR` com `logError`); derivar
      `Logo_Public_Url = {ASSETS_PUBLIC_BASE_URL}/tenant-assets/{slug}/logo.{ext}`;
      falha de upload ⇒ `ServiceError(..., 500, 'UPLOAD_FAILED')`. Injeção de
      dependência do cliente S3 para teste. Imports ESM com `.js`.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 5.3 Property test — derivação da URL pública da logo
    - **Property 10: Derivação da URL pública da logo**
    - **Validates: Requirements 8.3**
    - `src/__tests__/properties/logo-public-url.property.test.ts`.

  - [x] 5.4 Testes example-based do upload (cliente S3 mockado)
    - Chave correta por tipo, falha ⇒ `UPLOAD_FAILED`, env ausente ⇒ 500 sem vazar detalhes.
    - _Requirements: 8.2, 8.4, 8.5_

- [x] 6. Validação Zod do signup e util de slugify (backend)
  - [x] 6.1 Criar `validation/signup.validation.ts` (`signupSchema`)
    - Regras R3–R7: `businessName` (trim, 1–120), `contactName` (não vazio),
      `contactPhone` (E.164 flexível BR `^\+?[1-9]\d{9,14}$` após normalizar),
      `adminEmail` (formato), `password` (min 8, max 72), `slug`
      (`^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$`), `colorPresetId`, e metadados de logo
      (tipo PNG/JPG/JPEG/SVG/WEBP, tamanho ≤ `MAX_LOGO_BYTES = 2*1024*1024`).
      Constantes nomeadas; mensagens pt-BR. Imports ESM com `.js`.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 4.3, 4.4, 4.5, 6.3, 7.3, 7.4, 9.2, 9.3_

  - [x] 6.2 Criar util de slug reservado / normalização de telefone
    - Reutilizar/expor `RESERVED_SLUGS` de `tenant-provision.service.ts` e o
      normalizador de telefone E.164 usado pela validação.
    - _Requirements: 4.5, 3.4_

  - [x] 6.3 Property test — validação de campos rejeita entradas inválidas
    - **Property 1: Validação de campos de cadastro rejeita entradas inválidas**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 9.2, 9.3**
    - `src/__tests__/properties/signup-field-validation.property.test.ts`.

  - [x] 6.4 Property test — validação de formato do slug
    - **Property 4: Validação de formato do slug**
    - **Validates: Requirements 4.3, 4.4, 4.5, 5.3**
    - `src/__tests__/properties/signup-slug-format.property.test.ts`.

  - [x] 6.5 Property test — logo maior que o limite é rejeitada
    - **Property 9: Logo maior que o limite é rejeitada**
    - **Validates: Requirements 7.4**
    - `src/__tests__/properties/signup-logo-size.property.test.ts`.

- [x] 7. Implementar `services/signup.service.ts` (Signup_Service)
  - [x] 7.1 Orquestrar o cadastro (platform-level)
    - Validar env `ASSETS_*` (R8.1/R8.4); resolver `Color_Preset` por id (R6.3 ⇒
      422); normalizar telefone e computar `trialEndsAt = now + 30d` (R11.1);
      upload da logo se houver e derivar `Logo_Public_Url` (R7/R8); montar
      `theme = { colors: preset.colors, businessName }` sobre `NEUTRAL_PLATFORM_THEME`
      via `deepMergeTheme` (R6.6); chamar `provisionTenant` com `provisioningKey=slug`,
      `contact`, `trialEndsAt` (R10.1); mapear `ProvisioningValidationError → 422`
      e `ProvisioningError → 500 PROVISIONING_FAILED` (R10.2/R10.3); e-mail em uso ⇒
      409 `CONFLICT` (R3.7), slug em uso ⇒ 409 `CONFLICT` (R5.4). Reexportar
      `ServiceError`. Imports ESM com `.js`.
    - _Requirements: 3.7, 5.4, 6.3, 6.6, 6.7, 7.5, 8.1, 8.3, 8.4, 8.5, 10.1, 10.2, 10.3, 11.1_

  - [x] 7.2 Property test — e-mail comparado case-insensitive
    - **Property 2: E-mail é comparado de forma case-insensitive**
    - **Validates: Requirements 3.7**
    - `src/__tests__/properties/signup-email-case-insensitive.property.test.ts`.

  - [x] 7.3 Property test — montagem do tema preserva paleta e businessName
    - **Property 5: Montagem do tema preserva a paleta do preset e o businessName**
    - **Validates: Requirements 6.6**
    - `src/__tests__/properties/signup-theme-merge.property.test.ts`.

  - [x] 7.4 Property test — preset de cores inexistente é rejeitado
    - **Property 7: Preset de cores inexistente é rejeitado**
    - **Validates: Requirements 6.3**
    - `src/__tests__/properties/signup-unknown-preset.property.test.ts`.

  - [x] 7.5 Property test — extensão/chave da logo derivam do tipo do arquivo
    - **Property 8: Extensão e chave da logo derivam do tipo do arquivo**
    - **Validates: Requirements 7.3, 7.5, 8.2**
    - `src/__tests__/properties/signup-logo-key.property.test.ts`.

  - [x] 7.6 Property test — cálculo do fim do teste (trial_ends_at = now + 30d)
    - **Property 12: Cálculo do fim do teste**
    - **Validates: Requirements 11.1**
    - `src/__tests__/properties/signup-trial-ends-at.property.test.ts`.

- [x] 8. Checkpoint — garantir que os testes do backend passam
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Endpoint de signup: rate-limit, parser multipart, controller e rotas
  - [x] 9.1 Adicionar parser multipart ao `apps/backend`
    - Adicionar `multer` (ou `busboy`) (versão fixada) em `apps/backend/package.json`,
      configurado para memória, 1 arquivo, limite `MAX_LOGO_BYTES`.
    - _Requirements: 7.1, 7.4, 9.1_

  - [x] 9.2 Criar `middleware/signup-rate-limit.middleware.ts`
    - `signupRateLimiter` via `express-rate-limit` (padrão de `public.routes.ts`),
      `SIGNUP_RATE_LIMIT_WINDOW_MS = 15min`, `SIGNUP_RATE_LIMIT_MAX = 5` por IP,
      resposta 429 pt-BR. Imports ESM com `.js`.
    - _Requirements: 9.4, 9.5_

  - [x] 9.3 Criar `controllers/signup.controller.ts`
    - No POST: mesclar `req.body` (texto) + `req.file` (logo), validar com
      `parseBody(signupSchema, ...)` (422 `VALIDATION_ERROR`), chamar
      `signupService.signup`, responder 201 (novo) / 200 (idempotente); rejeitar
      método/content-type incorretos (R9.7). Nos GETs: `listColorPresets` e
      `checkSlug` (formato R4.3 + disponibilidade/reservado R5.2/R5.3). Sem
      try/catch que engula erros — deixar subir ao `errorHandler`. Imports ESM `.js`.
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 9.2, 9.3, 9.6, 9.7, 10.5_

  - [x] 9.4 Criar `routes/signup.routes.ts` e registrar em `index.ts`
    - Montar `POST /api/signup` (encadeando `signupRateLimiter` + parser multipart +
      `asyncHandler(controller)`), `GET /api/signup/color-presets` e
      `GET /api/signup/slug-availability`, cada handler em `asyncHandler`. Registrar
      `app.use('/api/signup', signupRoutes)` em `index.ts` **sem** auth e **sem**
      `tenantMiddleware`. Imports ESM `.js`.
    - _Requirements: 9.1, 9.4, 6.1, 5.1_

  - [x] 9.5 Testes example-based do endpoint (via invoke-handler)
    - 429 ao exceder rate-limit; 201 novo / 200 idempotente; método/content-type
      incorretos ⇒ rejeição pt-BR; erro inesperado ⇒ 500 `INTERNAL_ERROR` sem vazar.
    - _Requirements: 9.5, 9.6, 9.7, 9.8, 10.5_

- [x] 10. Trial_Guard: predicado puro e extensão dos pontos de acesso
  - [x] 10.1 Criar `services/trial-guard.ts` (`isTrialBlocked`)
    - Função pura `isTrialBlocked({ trialEndsAt, subscriptionStatus, now })` que
      retorna `true` sse e somente se `subscription_status !== 'active'` E
      `trial_ends_at != null` E `trial_ends_at <= now`; expor códigos/mensagens
      pt-BR (`TRIAL_EXPIRED`, `ESTABLISHMENT_UNAVAILABLE`). Imports ESM `.js`.
    - _Requirements: 12.4, 12.5, 12.6_

  - [x] 10.2 Estender `tenant.middleware.ts` e login autenticado
    - Após checar `status === 'ativo'`, aplicar `isTrialBlocked` ⇒ 403
      `TRIAL_EXPIRED` (painel/app); em `auth.controller.login`, resolver o tenant do
      usuário e aplicar o mesmo predicado antes de emitir a sessão ⇒ 403
      `TRIAL_EXPIRED`. Selecionar `trial_ends_at`/`subscription_status` conforme
      necessário. Imports ESM `.js`.
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 10.3 Estender `public-tenant.middleware.ts` (customer-ordering)
    - Ao resolver o tenant por slug, selecionar também
      `trial_ends_at`/`subscription_status` e aplicar `isTrialBlocked` ⇒ 403
      `ESTABLISHMENT_UNAVAILABLE`. Imports ESM `.js`.
    - _Requirements: 12.7, 12.8_

  - [x] 10.4 Property test — bloqueio do Trial_Guard
    - **Property 13: Bloqueio do Trial_Guard**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8**
    - `src/__tests__/properties/trial-guard.property.test.ts`.

- [x] 11. Checkpoint — garantir que typecheck/test/lint do backend passam
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Frontend: introduzir react-router e Web_Router público
  - [x] 12.1 Adicionar `react-router` ao `apps/web`
    - Adicionar `react-router` (versão fixada) em `apps/web/package.json`.
    - _Requirements: 2.1_

  - [x] 12.2 Montar `Web_Router` em `main.tsx`/`App.tsx`
    - Rotas `/` → `Landing_Page`, `/signup` → `Signup_Form`, `*` (catch-all) ⇒
      redireciona para `/`. Substituir o roteamento por estado (`useAuth`).
    - _Requirements: 2.1, 2.3_

  - [x] 12.3 Property test — rota não pública direciona para a Landing_Page
    - **Property 15: Rota não pública direciona para a Landing_Page**
    - **Validates: Requirements 2.3**
    - Testing Library + fast-check (caminhos arbitrários renderizam a landing).

- [x] 13. Frontend: `utils/slugify.ts` e serviço `signup-api`
  - [x] 13.1 Criar `apps/web/src/utils/slugify.ts`
    - Função pura que replica a normalização de R4.1 (remove acentos, minúsculas,
      `[^a-z0-9]→-`, colapsa hífens, apara extremidades). Backend é autoridade final.
    - _Requirements: 4.1_

  - [x] 13.2 Criar `apps/web/src/services/signup-api.ts`
    - Cliente do onboarding: `POST /api/signup` (multipart), `GET color-presets`,
      `GET slug-availability`. Substitui `api-client`/`real-client`.
    - _Requirements: 6.1, 5.1, 9.1_

  - [x] 13.3 Property test — `slugify` sempre produz slug bem-formado ou vazio
    - **Property 3: `slugify` sempre produz um slug bem-formado ou vazio**
    - **Validates: Requirements 4.1**
    - Testing Library/Vitest + fast-check no `apps/web` (mesma propriedade do backend).

- [x] 14. Frontend: `LandingPage` e CTA
  - [x] 14.1 Criar `pages/LandingPage.tsx`
    - Conteúdo de divulgação + CTA que navega para `/signup` via `useNavigate`,
      renderizada sem exigir autenticação. Estilos via tema; `testID`/acessibilidade
      nos elementos interativos.
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 14.2 Testes Testing Library da LandingPage
    - CTA presente e navega para `/signup`; renderiza sem auth.
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 14.3 Refinamentos de UI da landing (opcional)
    - Seções de marketing adicionais/estilização, sem alterar o contrato de navegação.
    - _Requirements: 1.1_

- [x] 15. Frontend: `SignupPage` (Signup_Form)
  - [x] 15.1 Criar `pages/SignupPage.tsx`
    - Campos de R3; seletor de `Color_Preset` (busca `GET color-presets`, seleciona
      exatamente um); upload de 1 logo; sugestão de slug via `slugify` que para de
      re-sugerir após edição manual (R4.2); checagem de disponibilidade via
      `GET slug-availability` (R5.1); envio `multipart/form-data` a `POST /api/signup`.
      Estilos via tema; `testID`/acessibilidade (labels, roles, `role="alert"` em erros).
    - _Requirements: 3.1, 4.1, 4.2, 5.1, 6.2, 7.1_

  - [x] 15.2 Implementar `Trial_Warning` no `apps/web`
    - Exibir aviso com dias restantes se e somente se restarem ≤ `TRIAL_WARNING_DAYS`
      (shared); ocultar caso contrário. `testID`/acessibilidade.
    - _Requirements: 13.1, 13.2_

  - [x] 15.3 Testes Testing Library do Signup_Form
    - Sugere slug e para de re-sugerir após edição manual (R4.2); exige campos;
      seleção de preset; exibe/oculta `Trial_Warning` conforme dias restantes.
    - _Requirements: 3.1, 4.2, 6.2, 13.1, 13.2_

  - [x] 15.4 Property test — visibilidade do Trial_Warning
    - **Property 14: Visibilidade do Trial_Warning**
    - **Validates: Requirements 13.1, 13.2**
    - Testing Library + fast-check (dias restantes arbitrários).

- [x] 16. Frontend: remoção segura das telas/hooks autenticados
  - Remover `pages/LoginPage.tsx`, `pages/QueuePage.tsx`, `hooks/useAuth.tsx`,
    `hooks/useRealtime.ts`, `hooks/index.ts` (ou reescrever), `services/api-client.ts`,
    `services/real-client.ts` e `__tests__/queue-integration.test.tsx`; remover
    `@supabase/supabase-js` do `apps/web/package.json`. Antes de remover, confirmar
    via `grep` que esses módulos só são referenciados por `App.tsx` (reescrito),
    `LoginPage`, `QueuePage` e o teste de fila. Não tocar no Operator_PWA.
  - _Requirements: 2.2, 2.4_

- [x] 17. Checkpoint — garantir que typecheck/test/lint do apps/web passam
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Infra/documentação: `.env.example` e bloco Nginx
  - Documentar `ASSETS_S3_BUCKET`, `ASSETS_PUBLIC_BASE_URL` e `AWS_REGION`
    (default `us-east-1`) em `.env.example`; ajustar o bloco Nginx no
    `infra/README` removendo `server_name web.foodtruck.app.br` e preservando
    `location /tenant-assets/` em `foodtruck.app.br`.
  - _Requirements: 8.1, 14.1, 14.2, 14.3, 14.4, 14.5_

## Notes

- Tarefas marcadas com `*` são opcionais (testes e refinamentos não estritamente
  necessários para o caminho feliz) e podem ser puladas para um MVP mais rápido.
- Cada tarefa referencia requisitos específicos (Rx.y) e, quando aplicável, a
  Correctness Property (Property N) do design que valida.
- Property tests com fast-check + Vitest ficam em
  `src/__tests__/properties/*.property.test.ts` (backend); UI é coberta por
  Testing Library no `apps/web`; upload S3/provisionamento usam mocks (injeção de
  dependência) em vez de I/O real.
- Ao concluir cada tarefa, rodar a verificação do app afetado sem introduzir novos
  erros/warnings: backend `pnpm --filter @order-system/backend typecheck` + `test`
  (Vitest single-run) + `lint`; web `pnpm --filter @order-system/web typecheck` +
  `test` + `lint`; shared `pnpm --filter @order-system/shared build`/`typecheck`.
  Após a tarefa 1, aplicar a migration com `pnpm --filter @order-system/backend migrate`.
- Não há tarefas de deploy nem de execução de servidores/watchers; a verificação é
  sempre single-run.
- A Nota da subtarefa 3.3 reutiliza a numeração de propriedade do design para
  atomicidade do provisionamento; a asserção concreta é "falha reverte todas as
  escritas".

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1", "4.1", "5.1", "9.1", "12.1"] },
    { "id": 1, "tasks": ["2.2", "3.1", "4.2", "5.2", "9.2", "12.2", "13.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "4.3", "4.4", "5.3", "5.4", "6.1", "6.2", "12.3", "13.2"] },
    { "id": 3, "tasks": ["6.3", "6.4", "6.5", "7.1", "13.3", "14.1"] },
    { "id": 4, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.6", "9.3", "14.2", "14.3", "15.1"] },
    { "id": 5, "tasks": ["9.4", "10.1", "15.2"] },
    { "id": 6, "tasks": ["9.5", "10.2", "10.3", "15.3", "15.4"] },
    { "id": 7, "tasks": ["10.4", "16"] },
    { "id": 8, "tasks": ["18"] }
  ]
}
```
