# Implementation Plan: Esqueceu sua senha? (forgot-password)

## Overview

Este plano converte o design em uma sequência incremental de tarefas de codificação, começando pela base de dados e validação, subindo pelas camadas de repositório, serviços (e-mail e reset de senha), controller, rate limit e rotas do backend, e finalmente as telas e o cliente de API do mobile. Cada etapa se apoia nas anteriores e termina com a integração das partes (rotas e navegação), sem deixar código órfão.

A stack é TypeScript em ambos os lados (backend Express/ESM e mobile Expo/React Native), conforme o codebase existente. Os testes de propriedade usam `fast-check` + `vitest` (mínimo de 100 iterações), seguindo o padrão de `apps/backend/src/__tests__/properties/`. Cada uma das 20 propriedades de corretude do design é implementada por um único teste, mapeado conforme a tabela propriedade→arquivo do design.

## Tasks

- [x] 1. Criar a migração da tabela `password_reset_codes`
  - Criar `apps/backend/migrations/011_create_password_reset_codes.sql` seguindo o padrão SQL numerado das migrações existentes
  - Definir colunas `id`, `user_id`, `tenant_id`, `code_hash`, `expires_at`, `used_at`, `attempts` (default 0), `created_at`
  - Adicionar FK composta `(user_id, tenant_id)` → `users(id, tenant_id) ON DELETE CASCADE` (reaproveita `users_id_tenant_unique` da migração 002)
  - Adicionar índice parcial de código ativo `(user_id, tenant_id, created_at) WHERE used_at IS NULL` e índice por `expires_at`
  - _Requirements: 3.2, 3.3, 3.4, 3.6, 3.7, 8.1, 8.2, 8.5_

- [x] 2. Criar o módulo de validação Zod
  - [x] 2.1 Implementar `apps/backend/src/validation/password-reset.validation.ts`
    - Definir `forgotPasswordSchema` (email `max(254)` + `email()`, mensagens pt-BR) espelhando `user.validation.ts`
    - Definir `resetPasswordSchema` (email; `code` com regex `^\d{6}$` e mensagem "Código inválido"; `newPassword` com `min(8)`/`max(72)` e mensagem "A senha deve ter entre 8 e 72 caracteres")
    - _Requirements: 2.3, 7.1, 7.2, 7.3_

  - [x] 2.2 Escrever teste de propriedade para validação de e-mail
    - **Property 2: E-mails inválidos são rejeitados sem gerar código**
    - Arquivo: `apps/backend/src/__tests__/properties/forgot-password-email-validation.property.test.ts`
    - Gerar strings inválidas (vazias, sem `@`, > 254 chars) e verificar rejeição com mensagem pt-BR
    - **Validates: Requirements 2.3**

  - [x] 2.3 Escrever teste de propriedade para política de comprimento de senha
    - **Property 16: Política de comprimento de senha**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-password-policy.property.test.ts`
    - Gerar senhas fora de 8–72 (incluindo vazia) e verificar recusa com a mensagem pt-BR de comprimento
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 3. Implementar o repositório de acesso direto ao pool
  - [x] 3.1 Criar `apps/backend/src/db/password-reset-repository.ts`
    - Definir interfaces `ActiveUser`, `PasswordResetCodeRow` e `PasswordResetRepository`
    - Implementar acesso direto ao `pool` de `config/database.ts` com SQL sempre parametrizado (`$1`, ...)
    - Implementar `findUsersByEmail` (cross-tenant por `LOWER(email)`), `invalidateActiveCodes(userId, tenantId)`, `insertCode(...)`, `findActiveCodeForEmail(email)` (JOIN users; ativo = `used_at IS NULL AND expires_at > NOW() AND attempts < 5`, mais recente por `created_at`), `registerFailedAttempt(codeId)` (incrementa attempts; invalida ao atingir 5), `markUsed(codeId)`, `invalidateCode(codeId)`
    - _Requirements: 2.5, 2.6, 3.5, 3.6, 8.3, 8.5_

  - [x] 3.2 Escrever teste de propriedade para "um código ativo por usuário/tenant"
    - **Property 5: No máximo um código ativo por usuário/tenant**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-single-active-code.property.test.ts`
    - Após gerar novo código, verificar que anteriores válidos do mesmo `(user_id, tenant_id)` ficam invalidados
    - **Validates: Requirements 3.5**

  - [x] 3.3 Escrever teste de propriedade para limite de tentativas
    - **Property 6: Limite de tentativas invalida o código**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-attempts-limit.property.test.ts`
    - Ao atingir 5 tentativas incorretas, o código é invalidado e tentativas seguintes recusadas (pt-BR)
    - **Validates: Requirements 3.6, 6.4**

  - [x] 3.4 Escrever teste de propriedade para escopo de tenant
    - **Property 18: Escopo de tenant do código**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-tenant-scope.property.test.ts`
    - Código só vale para o `(user_id, tenant_id)` emissor; e-mail em múltiplos tenants gera/valida códigos independentes
    - **Validates: Requirements 3.2, 8.1, 8.3, 8.5**

- [x] 4. Implementar o serviço de e-mail (abstração + retry assíncrono)
  - [x] 4.1 Criar `apps/backend/src/services/email/email.service.ts`
    - Definir interfaces `EmailMessage`, `EmailProvider` e `EmailService`
    - Implementar `sendVerificationCode` como fire-and-forget: até 3 tentativas, intervalo mínimo de 2s, parando na primeira aceita; em falha total chama `onAllAttemptsFailed` e registra log interno sem expor a causa; nunca lança para o chamador
    - Incluir no corpo o código e a instrução de expiração em 15 minutos
    - Prover `NoopEmailProvider`/`LoggingEmailProvider` e seleção de provedor por env (`EMAIL_PROVIDER`)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 4.2 Escrever teste de propriedade para conteúdo do e-mail
    - **Property 19: Mensagem de e-mail contém código e expiração**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-email-content.property.test.ts`
    - Corpo da mensagem contém o código e a instrução de expiração em 15 minutos
    - **Validates: Requirements 9.1**

  - [x] 4.3 Escrever teste de propriedade para política de retry
    - **Property 20: Política de retry de envio**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-email-retry.property.test.ts`
    - Usar `vi.useFakeTimers`; máx. 3 tentativas, ≥ 2s entre elas, parando na primeira aceita
    - **Validates: Requirements 9.2**

- [x] 5. Implementar o serviço de recuperação de senha
  - [x] 5.1 Criar `apps/backend/src/services/password-reset.service.ts` com geração de código e `requestCode`
    - Definir `ServiceError(message, statusCode, code)` com mensagens pt-BR
    - Implementar `generateCode()` via `crypto.randomInt(0, 1_000_000)` + `padStart(6,'0')` e `hashCode(code)` (ex.: sha256 hex)
    - Implementar `requestCode(email)`: valida formato (Zod) → busca usuários → para cada usuário `ativo`, invalida códigos anteriores, gera+hasheia+persiste e dispara envio assíncrono; retorna sempre `void`; `onAllAttemptsFailed` invalida o código via `invalidateCode`
    - _Requirements: 2.2, 2.4, 2.5, 2.6, 2.7, 3.1, 3.3, 3.4, 3.5, 9.4_

  - [x] 5.2 Escrever teste de propriedade para geração de código
    - **Property 4: Geração de código bem-formado**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-code-generation.property.test.ts`
    - Código casa `^[0-9]{6}$`; valor persistido é hash (nunca texto puro); `expires_at` = `created_at` + 15 min
    - **Validates: Requirements 2.4, 3.1, 3.3, 3.4**

  - [x] 5.3 Escrever teste de propriedade para solicitação sem usuário ativo
    - **Property 3: Solicitação sem usuário ativo não gera código**
    - Arquivo: `apps/backend/src/__tests__/properties/forgot-password-no-active-user.property.test.ts`
    - E-mail inexistente ou apenas `inativo` não persiste código
    - **Validates: Requirements 2.5, 2.6**

  - [x] 5.4 Escrever teste de propriedade para falha total de e-mail
    - **Property 8: Falha total de e-mail invalida o código gerado**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-email-failure.property.test.ts`
    - Falha nas 3 tentativas → código invalidado; resposta ao cliente permanece a Mensagem_Neutra
    - **Validates: Requirements 2.7, 9.3**

  - [x] 5.5 Implementar `confirmReset` no serviço de recuperação de senha
    - Validar schema → localizar código candidato por e-mail → conferir `hashCode(code) === row.code_hash` e coerência de `tenant_id`
    - Em falha, `registerFailedAttempt`; ao atingir 5, invalidar; recusar com `ServiceError 400 INVALID_CODE` ("Código inválido ou expirado")
    - Em sucesso: `supabaseAdmin.auth.admin.updateUserById(user_id, { password })` → só então `markUsed` → `signOut(user_id, 'global')`; se Supabase falhar, `ServiceError 500` sem marcar usado
    - _Requirements: 5.2, 5.3, 5.4, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 8.1, 8.2, 8.4_

  - [x] 5.6 Escrever teste de propriedade para redefinição bem-sucedida e isolada
    - **Property 13: Redefinição bem-sucedida é correta e isolada**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-success.property.test.ts`
    - Código válido + senha válida atualiza apenas o usuário associado, sem afetar outros (mock de `supabaseAdmin`)
    - **Validates: Requirements 5.2, 6.5, 8.2**

  - [x] 5.7 Escrever teste de propriedade para códigos inválidos
    - **Property 14: Códigos inválidos não alteram a senha**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-invalid-code.property.test.ts`
    - Código incorreto/expirado/usado ou par e-mail+código sem usuário → recusa pt-BR sem alterar senha
    - **Validates: Requirements 5.7, 6.1, 6.2, 8.4**

  - [x] 5.8 Escrever teste de propriedade para uso único
    - **Property 7: Código é de uso único**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-single-use.property.test.ts`
    - Código usado com sucesso é marcado como utilizado e qualquer reuso é recusado
    - **Validates: Requirements 3.7, 5.3, 6.3**

  - [x] 5.9 Escrever teste de propriedade para falha do Supabase
    - **Property 15: Falha do Supabase preserva o código não utilizado**
    - Arquivo: `apps/backend/src/__tests__/properties/password-reset-supabase-failure.property.test.ts`
    - Falha em `updateUserById` → erro pt-BR e código permanece não marcado como usado
    - **Validates: Requirements 5.8**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implementar o middleware de rate limit dedicado
  - [x] 7.1 Criar `apps/backend/src/middleware/forgot-password-rate-limit.middleware.ts`
    - Seguir o padrão in-memory `Map` de `rate-limit.middleware.ts`, com dois buckets independentes: por IP e por e-mail (normalizado com `LOWER`)
    - Janela de 15 min, limite de 5 por dimensão; remover timestamps fora da janela (reset natural); solicitação recusada NÃO grava timestamp nem altera códigos
    - Em estouro, responder com a mesma Mensagem_Neutra e status 200, registrando o motivo (`rate_limited`) apenas em log interno
    - Exportar `ipBuckets`/`emailBuckets` para permitir testes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 2.8_

  - [x] 7.2 Escrever teste de propriedade para rate limit (IP, e-mail, reset e estado)
    - **Property 9: Rate limit por e-mail; Property 10: Rate limit por IP; Property 11: Reset da janela; Property 12: Recusa por rate limit não altera estado**
    - Arquivo: `apps/backend/src/__tests__/properties/forgot-password-rate-limit.property.test.ts`
    - Usar `vi.useFakeTimers` para janela; verificar bloqueio ao atingir 5 por e-mail e por IP, reinício após 15 min e preservação de códigos/solicitações em recusas
    - **Validates: Requirements 2.8, 4.1, 4.2, 4.3, 4.5**

- [x] 8. Implementar o controller de recuperação de senha
  - [x] 8.1 Criar `apps/backend/src/controllers/password-reset.controller.ts`
    - Definir `NEUTRAL_MESSAGE` ("Se o e-mail estiver cadastrado, enviamos instruções para redefinir a senha.")
    - `forgotPassword`: validar `forgotPasswordSchema` (400 `VALIDATION_ERROR` se inválido); caso válido, chamar `requestCode` em try/catch amplo e SEMPRE responder 200 com `NEUTRAL_MESSAGE`
    - `resetPassword`: validar `resetPasswordSchema` (400 `VALIDATION_ERROR`); chamar `confirmReset`; sucesso → 200 "Senha redefinida com sucesso."; `ServiceError` → mapear `statusCode`/`code`/`message`
    - _Requirements: 2.2, 5.7, 5.8, 6.1, 6.2, 6.3, 8.4, 9.3, 9.5_

  - [x] 8.2 Escrever teste de propriedade para resposta indistinguível (não enumeração)
    - **Property 1: Resposta de solicitação indistinguível (não enumeração)**
    - Arquivo: `apps/backend/src/__tests__/properties/forgot-password-neutral-response.property.test.ts`
    - Para qualquer e-mail válido, conteúdo/formato/status idênticos entre ativo, inativo, inexistente, rate-limited e falha de e-mail (mocks de repo/email/rate limit)
    - **Validates: Requirements 2.2, 2.5, 2.6, 4.4, 9.3, 9.5**

- [x] 9. Registrar as rotas públicas no backend
  - [x] 9.1 Estender `apps/backend/src/routes/auth.routes.ts`
    - Registrar `POST /forgot-password` com `forgotPasswordRateLimit` + `forgotPassword`
    - Registrar `POST /reset-password` público com `resetPassword`
    - Importar controllers e middleware com sufixo `.js` (ESM), como as demais rotas
    - _Requirements: 2.1, 4.1, 4.2, 5.2_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Estender o cliente de API do mobile
  - [x] 11.1 Adicionar métodos ao contrato em `apps/mobile/src/services/types.ts`
    - Declarar `requestPasswordReset(email: string): Promise<void>` e `confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void>` na interface `ApiClient`
    - _Requirements: 2.1, 5.2_

  - [x] 11.2 Implementar os métodos em `apps/mobile/src/services/real-client.ts`
    - `requestPasswordReset`: `fetch` direto (não `authFetch`) para `POST /api/auth/forgot-password`, tratando falha de rede (status 0) como no `login`; resposta sempre neutra
    - `confirmPasswordReset`: `fetch` direto para `POST /api/auth/reset-password`; em `!ok`, lançar `NetworkError` com `body.message` (pt-BR)
    - _Requirements: 2.2, 5.2, 5.7_

- [x] 12. Implementar a validação client-side de senha (mobile)
  - [x] 12.1 Criar util de validação de senha em `apps/mobile/src/services/password-reset-validation.ts`
    - Função pura que recebe (novaSenha, confirmação) e retorna se o envio é permitido: bloqueia quando as senhas diferem ou o comprimento está fora de 8–72
    - _Requirements: 5.6, 7.4_

  - [x] 12.2 Escrever teste de propriedade para validação client-side
    - **Property 17: Validação client-side de senha**
    - Arquivo: `apps/mobile/src/services/__tests__/password-reset-validation.property.test.ts` (fast-check)
    - Senhas divergentes ou fora de 8–72 bloqueiam o envio
    - **Validates: Requirements 5.6, 7.4**

- [x] 13. Implementar a tela de solicitação de código (mobile)
  - [x] 13.1 Criar `apps/mobile/src/screens/RequestCodeScreen.tsx`
    - Campo de e-mail + botão "Enviar código"; ao enviar, chamar `requestPasswordReset`, exibir a Mensagem_Neutra e navegar para a tela de redefinição
    - _Requirements: 2.1, 2.2_

  - [x] 13.2 Escrever teste de exemplo/interação da RequestCodeScreen
    - Render dos campos (R2.1); acionamento chama `requestPasswordReset` (mock) e navega
    - _Requirements: 2.1, 2.2_

- [x] 14. Implementar a tela de redefinição de senha (mobile)
  - [x] 14.1 Criar `apps/mobile/src/screens/ResetPasswordScreen.tsx`
    - Campos código, nova senha e confirmação; usar o util de validação client-side antes de enviar; chamar `confirmPasswordReset`; em sucesso exibir confirmação e navegar para `/login`; em erro exibir mensagem pt-BR
    - _Requirements: 5.1, 5.5, 5.6, 7.4_

  - [x] 14.2 Escrever teste de exemplo/interação da ResetPasswordScreen
    - Render dos campos (R5.1); bloqueio de envio quando validação falha; confirmação + navegação para login no sucesso (R5.5)
    - _Requirements: 5.1, 5.5, 5.6, 7.4_

- [x] 15. Registrar rotas mobile e ponto de entrada no login
  - [x] 15.1 Criar as rotas `apps/mobile/app/forgot-password.tsx` e `apps/mobile/app/reset-password.tsx`
    - Renderizar `RequestCodeScreen` e `ResetPasswordScreen`, fora do grupo `(tabs)`/autenticado, como `login.tsx`
    - _Requirements: 1.3_

  - [x] 15.2 Adicionar o controle "Esqueceu sua senha?" em `apps/mobile/src/screens/LoginScreen.tsx`
    - Controle acionável visível sem rolagem, abaixo do botão Entrar; `onPress` navega para `/forgot-password` via `router.push`; em falha de navegação, permanecer na tela e exibir mensagem de erro
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 15.3 Escrever teste de exemplo/interação do ponto de entrada no login
    - Presença do controle (R1.1); navegação ao acionar (R1.2); permanência + erro em falha de navegação (R1.4); rota pública acessível (R1.3)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas com `*` são de teste (propriedade/exemplo/integração) e podem ser puladas para um MVP mais rápido; as demais são implementação obrigatória.
- Cada task referencia critérios de aceitação específicos e/ou propriedades de corretude para rastreabilidade.
- Testes de propriedade usam `fast-check` + `vitest` com mínimo de 100 iterações e comentário no formato **Feature: forgot-password, Property {n}: ...**; `supabaseAdmin`, `EmailProvider` e timers são mockados (`vi.useFakeTimers`) para retry e janelas de rate limit.
- Cobertura das 20 propriedades: 1 (8.2), 2 (2.2), 3 (5.3), 4 (5.2), 5 (3.2), 6 (3.3), 7 (5.8), 8 (5.4), 9–12 (7.2), 13 (5.6), 14 (5.7), 15 (5.9), 16 (2.3), 17 (12.2), 18 (3.4), 19 (4.2), 20 (4.3).
- Cobertura dos 9 requisitos: R1 (tasks 15), R2 (2.1, 3.1, 4.1, 5.1, 8.1, 9.1, 11), R3 (1, 3.1, 5.1), R4 (7), R5 (5.5, 8.1, 11.2, 12, 14), R6 (3.1, 5.5), R7 (2.1, 5.5, 12), R8 (1, 3.1, 5.5), R9 (4.1, 5.1, 8.1).
- O acesso direto ao `pool` no `password-reset-repository` é a exceção arquitetural documentada no design (fluxo público, sem tenant resolvido); todo SQL é parametrizado.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1", "4.1", "7.1", "11.1", "12.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "3.1", "4.2", "4.3", "7.2", "11.2", "12.2"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4", "5.1", "13.1", "14.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "5.4", "5.5", "8.1", "13.2", "14.2"] },
    { "id": 4, "tasks": ["5.6", "5.7", "5.8", "5.9", "8.2", "9.1", "15.1", "15.2"] },
    { "id": 5, "tasks": ["15.3"] }
  ]
}
```
