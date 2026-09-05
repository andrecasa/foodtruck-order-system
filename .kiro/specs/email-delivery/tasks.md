# Implementation Plan: Entrega de e-mail via SMTP (email-delivery)

## Overview

Este plano converte o design em uma sequência incremental de tarefas de codificação, começando pela dependência (`nodemailer`), subindo pelo carregador de configuração fail-fast (`loadSmtpConfig`), a extensão retrocompatível da `EmailMessage`, o template HTML + renderizador multipart, o `SmtpEmailProvider`, a integração no `resolveEmailProvider` e a documentação do `.env.example`. Cada etapa se apoia nas anteriores e termina com a fiação das partes (seleção de provedor), sem deixar código órfão.

A stack é TypeScript no backend (Express/ESM, imports com sufixo `.js`), conforme o codebase existente. Os testes de propriedade usam `fast-check` + `vitest` (mínimo de 100 iterações), seguindo o padrão de `apps/backend/src/__tests__/properties/`, e os testes de exemplo/unitários ficam em `apps/backend/src/__tests__/unit/`. Cada uma das 8 propriedades de corretude do design é implementada por um único teste, mapeado conforme a tabela propriedade→arquivo do design. O transport do `nodemailer` é mockado nos testes para não abrir conexões reais.

## Tasks

- [x] 1. Adicionar a dependência `nodemailer`
  - Adicionar `nodemailer` às `dependencies` e `@types/nodemailer` às `devDependencies` de `apps/backend/package.json`
  - Usar versões FIXADAS (exatas, sem `^`/`~`), coerente com a convenção do repo (ex.: `express`, `pg`, `zod` estão pinados)
  - Instalar as dependências para materializar o lockfile/`node_modules`
  - _Requirements: 3.1, 7.1_

- [x] 2. Implementar o carregador de configuração SMTP (fail-fast)
  - [x] 2.1 Criar `apps/backend/src/services/email/smtp-config.ts`
    - Declarar a classe `ServiceError extends Error` local (`message`, `statusCode`, `code`), seguindo a convenção dos demais serviços do backend (sem módulo compartilhado)
    - Definir a interface `SmtpConfig` (`host`, `port` 1..65535, `user`, `pass`, `from`, `secure`)
    - Implementar `loadSmtpConfig(env = process.env): SmtpConfig` com validação fail-fast: obrigatórias `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` não podem ser ausentes, vazias ou só espaços; `SMTP_PORT` inteiro em 1..65535; `SMTP_SECURE` parse tolerante (`true`/`1`→true, `false`/`0`/ausente→false, demais valores rejeitados)
    - Lançar `ServiceError` com `code` `SMTP_CONFIG_ERROR` e mensagens em pt-BR citando o nome da variável (nunca o valor)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Escrever teste de propriedade para configuração incompleta
    - **Property 1: Configuração incompleta sempre falha (fail-fast)**
    - Arquivo: `apps/backend/src/__tests__/properties/smtp-config-fail-fast.property.test.ts`
    - Gerar ambientes com pelo menos uma obrigatória ausente/vazia/só espaços e verificar `throw` de `ServiceError` pt-BR (nunca retorna `SmtpConfig`)
    - **Validates: Requirements 2.3**

  - [x] 2.3 Escrever teste de propriedade para porta inválida
    - **Property 2: Porta inválida sempre falha**
    - Arquivo: `apps/backend/src/__tests__/properties/smtp-config-port-validation.property.test.ts`
    - Gerar `SMTP_PORT` não numérico, ≤ 0, > 65535 ou fracionário (demais variáveis válidas) e verificar `throw` de `ServiceError` pt-BR
    - **Validates: Requirements 2.5**

  - [x] 2.4 Escrever teste de propriedade para parse fiel de configuração válida
    - **Property 3: Configuração válida faz parse fiel**
    - Arquivo: `apps/backend/src/__tests__/properties/smtp-config-valid-parse.property.test.ts`
    - Gerar obrigatórias preenchidas + `SMTP_PORT` na faixa e verificar que `SmtpConfig` reflete os valores, `port` numérico e `secure` conforme `SMTP_SECURE` (default `false`)
    - **Validates: Requirements 2.1, 2.2, 2.4**

- [x] 3. Estender a `EmailMessage` com o campo opcional `html`
  - Adicionar `html?: string` à interface `EmailMessage` em `apps/backend/src/services/email/email.service.ts`
  - Extensão retrocompatível: `NoopEmailProvider`/`LoggingEmailProvider` e mensagens somente-texto continuam válidos sem alteração
  - _Requirements: 5.3, 3.5, 3.6_

- [x] 4. Implementar o template HTML e o renderizador multipart
  - [x] 4.1 Criar o template `apps/backend/src/services/email/templates/verification-code.html`
    - Layout genérico da plataforma (sem branding por tenant) com os placeholders `{{code}}` e `{{expiresInMinutes}}`
    - _Requirements: 4.4, 4.5_

  - [x] 4.2 Criar o renderizador `apps/backend/src/services/email/templates/verification-email.ts`
    - Exportar `VERIFICATION_EXPIRES_IN_MINUTES = 15`, `escapeHtml(value)` (escapa `&`, `<`, `>`, `"`, `'`) e `applyPlaceholders(template, values)` que escapa TODO valor substituído
    - Ler o template `.html` uma vez na carga do módulo (via `readFileSync` + `fileURLToPath(new URL(...))`)
    - Implementar `renderVerificationEmail(code): { text, html }`: `text` via `buildVerificationBody(code)` (fallback SEMPRE presente); `html` do template com `{{code}}`→código e `{{expiresInMinutes}}`→`15`
    - _Requirements: 4.4, 4.5, 4.6, 6.6_

  - [x] 4.3 Escrever teste de propriedade para conteúdo renderizado (texto e HTML)
    - **Property 6: E-mail renderizado contém o código e a expiração em texto e HTML**
    - Arquivo: `apps/backend/src/__tests__/properties/verification-email-render.property.test.ts`
    - Para qualquer código de 6 dígitos, `text` e `html` contêm o código e o número `15`
    - **Validates: Requirements 4.4, 4.5**

  - [x] 4.4 Escrever teste de propriedade para fallback de texto
    - **Property 7: Fallback em texto sempre presente**
    - Arquivo: `apps/backend/src/__tests__/properties/verification-email-text-fallback.property.test.ts`
    - Para qualquer código válido, `renderVerificationEmail(code).text` é não vazio e igual a `buildVerificationBody(code)`
    - **Validates: Requirements 4.4**

  - [x] 4.5 Escrever teste de propriedade para escaping de placeholders
    - **Property 8: Substituição de placeholders escapa valores**
    - Arquivo: `apps/backend/src/__tests__/properties/verification-email-escaping.property.test.ts`
    - Para qualquer valor com caracteres especiais de HTML, o HTML renderizado contém as entidades escapadas e não os caracteres brutos oriundos do valor
    - **Validates: Requirements 6.6**

- [x] 5. Enriquecer a montagem da mensagem de verificação
  - [x] 5.1 Atualizar `buildVerificationMessage` em `apps/backend/src/services/email/email.service.ts`
    - Usar `renderVerificationEmail(code)` para preencher `body` (texto) e `html` (HTML renderizado), mantendo `to` e `subject` (`VERIFICATION_SUBJECT`)
    - _Requirements: 4.4, 4.5_

  - [x] 5.2 Escrever teste de exemplo para a montagem da mensagem
    - Arquivo: `apps/backend/src/__tests__/unit/verification-message.test.ts`
    - `buildVerificationMessage(to, code)` retorna `body` (texto via `buildVerificationBody`) e `html` (renderizado), ambos contendo o código
    - _Requirements: 4.4, 4.5_

- [x] 6. Implementar o `SmtpEmailProvider`
  - [x] 6.1 Criar `apps/backend/src/services/email/smtp-email.provider.ts`
    - Classe `SmtpEmailProvider implements EmailProvider`; construtor cria o transport via `nodemailer.createTransport` a partir da `SmtpConfig` (`host`, `port`, `secure`, `auth`) e guarda `from`
    - `send(message)`: uma tentativa via `transport.sendMail` mapeando `from`→`SMTP_FROM`, `to`/`subject` intactos, `text`←`body` sempre, e `html` incluído SOMENTE quando `message.html` presente e não vazio (multipart); em erro, chama `logSmtpError` e relança (propaga para o retry existente)
    - Implementar o helper `logSmtpError` com diagnóstico mínimo (host + código/resposta SMTP quando houver), honrando `NODE_ENV=production` (sem body/html/código) e NUNCA logando `SMTP_PASS` nem credenciais
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.2 Escrever teste de propriedade para preservação do payload
    - **Property 4: Payload preserva conteúdo da mensagem**
    - Arquivo: `apps/backend/src/__tests__/properties/smtp-provider-payload.property.test.ts`
    - Com transport mockado: `to`/`subject`/`text` idênticos à mensagem, `from` = `SMTP_FROM`, e `html` presente no payload se e somente se `message.html` presente (valor idêntico)
    - **Validates: Requirements 3.4, 3.5, 3.6, 4.2**

  - [x] 6.3 Escrever teste de propriedade para propagação de falha do transport
    - **Property 5: Falha do transport propaga**
    - Arquivo: `apps/backend/src/__tests__/properties/smtp-provider-error-propagation.property.test.ts`
    - Para qualquer erro rejeitado por `transport.sendMail`, `send` rejeita (não resolve silenciosamente)
    - **Validates: Requirements 3.3**

  - [x] 6.4 Escrever teste de exemplo para envio via transport mockado
    - Arquivo: `apps/backend/src/__tests__/unit/smtp-provider-send.test.ts`
    - transport resolve → `send` resolve (R3.1, R3.2); transport rejeita → `send` rejeita (R3.3) sem vazar `SMTP_PASS`/body/html/código nos logs (R6.1–R6.3, R6.5); `html` presente → payload multipart; `html` ausente → payload somente-texto (sem chave `html`); `secure: true` repassado a `createTransport`
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 2.4, 6.1, 6.2, 6.3, 6.5_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integrar o caso `smtp` na seleção de provedor
  - [x] 8.1 Adicionar `case 'smtp'` em `resolveEmailProvider` (`apps/backend/src/services/email/email.service.ts`)
    - `case 'smtp'` → `new SmtpEmailProvider(loadSmtpConfig())` (fail-fast na inicialização se a config for inválida); manter `logging`/`noop`/vazio/default EXATAMENTE como estão
    - Importar `SmtpEmailProvider` e `loadSmtpConfig` com sufixo `.js` (ESM)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.3, 5.1, 5.2, 5.3_

  - [x] 8.2 Escrever teste de exemplo para resolução de provedor
    - Arquivo: `apps/backend/src/__tests__/unit/smtp-provider-resolution.test.ts`
    - `smtp` (e `SMTP` maiúsculo, case-insensitive) com config válida → `SmtpEmailProvider` (R1.1); `smtp` com config inválida → lança (fail-fast) (R2.3); `noop`/ausente/vazio → `NoopEmailProvider` (R1.2, R5.2); `logging` → `LoggingEmailProvider` (R1.3, R5.1); valor desconhecido → `NoopEmailProvider` + `console.warn` (R1.4)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.3, 5.1, 5.2_

- [x] 9. Documentar as variáveis de ambiente no `.env.example`
  - Acrescentar ao `.env.example` da raiz o bloco `EMAIL_PROVIDER` + `SMTP_*` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`) com placeholders seguros
    - Incluir o exemplo de referência para Gmail (`smtp.gmail.com`, `587`, `SMTP_SECURE=false`, `SMTP_PASS` com Senha de App) usando APENAS placeholders (sem credenciais reais)
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Rodar o typecheck do backend (`npm run typecheck` em `apps/backend`) e a suíte completa (`npm test` em `apps/backend`)
  - Confirmar que a suíte existente da feature forgot-password continua passando (não regressão — R9), sem alterar o comportamento observável de `NoopEmailProvider`/`LoggingEmailProvider`/`RetryingEmailService`
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. (MANUAL / OPCIONAL — NÃO EXECUTAR COMO CÓDIGO) Validação de entrega real (R7)
  - Passo de validação MANUAL, fora da suíte automatizada e NÃO implementável por um agente de código (depende de credenciais e de um servidor SMTP externo real)
  - Definir `EMAIL_PROVIDER=smtp` e as variáveis `SMTP_*` apontando para um provedor real (ex.: Gmail com Senha de App) no `.env` local
  - Disparar um fluxo de forgot-password e confirmar o recebimento do código na caixa de entrada, sem alteração de código
  - _Requirements: 7.1, 7.2, 7.3_

## Notes

- Tasks marcadas com `*` são de teste (propriedade/exemplo) e podem ser puladas para um MVP mais rápido; as demais (sem `*`) são implementação obrigatória.
- A task 11 é MANUAL/OPCIONAL e NÃO deve ser executada como código: é um passo operacional de validação de entrega real (R7) que exige credenciais e um servidor SMTP externo.
- Cada task referencia critérios de aceitação específicos e/ou propriedades de corretude para rastreabilidade.
- Testes de propriedade usam `fast-check` + `vitest` com mínimo de 100 iterações e comentário no formato **Feature: email-delivery, Property {n}: ...**; o transport do `nodemailer` é mockado (`vi.mock('nodemailer')` ou injeção) para não abrir conexões reais.
- Cobertura das 8 propriedades: 1 (2.2), 2 (2.3), 3 (2.4), 4 (6.2), 5 (6.3), 6 (4.3), 7 (4.4), 8 (4.5).
- Cobertura dos 9 requisitos: R1 (8.1), R2 (2.1), R3 (6.1), R4 (4.1, 4.2, 5.1), R5 (3, 8.1), R6 (4.2, 6.1), R7 (11 — manual), R8 (9), R9 (10 — checkpoint).
- A `ServiceError` do módulo de e-mail é local por decisão de projeto (não há módulo compartilhado de erros no backend); uma spec futura centralizará esse padrão.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1", "4.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "3", "4.2"] },
    { "id": 2, "tasks": ["4.3", "4.4", "4.5", "5.1", "6.1"] },
    { "id": 3, "tasks": ["5.2", "6.2", "6.3", "6.4", "9"] },
    { "id": 4, "tasks": ["8.1"] },
    { "id": 5, "tasks": ["8.2"] }
  ]
}
```
