# Padrões do Projeto — order-system

Contexto e convenções reais deste monorepo. Use-os como referência para manter
consistência ao escrever ou alterar código. Estas orientações complementam
`clean-code.md` e `code-review-checklist.md`.

## Visão geral

- **Monorepo pnpm workspaces** (`pnpm-workspace.yaml`: `packages/*` e `apps/*`).
  `packageManager: pnpm@9`, Node >= 20.
- Apps: `apps/backend` (API), `apps/mobile` (Expo/React Native) e `apps/web`
  (Vite). Pacote compartilhado `packages/shared` (`@order-system/shared`),
  referenciado via `workspace:*`.
- **TypeScript estrito** em todos: base em `tsconfig.base.json` com `strict`,
  `noUncheckedIndexedAccess`, `target ES2022`, `module ESNext`,
  `moduleResolution: bundler`. Evite `any`; trate acessos a índice que podem ser
  `undefined`.

## Backend (`apps/backend`)

- **Stack:** Express 4 (ESM, `"type": "module"`), driver `pg` com SQL puro
  parametrizado (sem ORM), Zod para validação, Supabase (auth),
  `express-rate-limit`, `nodemailer`, `date-fns`/`date-fns-tz`. Testes com
  **Vitest** + **fast-check**. Dev via `tsx`.
- **Imports ESM:** sempre com sufixo `.js`, mesmo em arquivos `.ts`
  (ex.: `import { ServiceError } from '../services/service-error.js'`).
- **Camadas (fluxo obrigatório):** `routes → controller → service → tenantRepository`.
  - `routes/*.routes.ts`: encadeiam middlewares e envolvem cada handler em
    `asyncHandler(...)` para que rejeições async cheguem ao `errorHandler`.
  - `controllers/*.controller.ts`: apenas traduzem HTTP↔serviço. Leem
    `req.tenantId`/`req.params`/`req.body`, validam corpo com
    `parseBody(schema, req.body)` (lança `ServiceError` 422 `VALIDATION_ERROR`),
    chamam o service e respondem. Não fazem try/catch que engula erros — deixam
    o erro subir para o `errorHandler` central.
  - `services/*.service.ts`: regra de negócio. Acessam dados via
    `tenantRepository(tenantId)` e lançam `ServiceError(message, statusCode, code)`.
    Reexportam a `ServiceError` central.
- **Tratamento de erros (central):** `src/http/error-handler.ts` mapeia
  `ServiceError → { statusCode, error: code, message }` e qualquer outro erro
  para `500 { statusCode: 500, error: 'INTERNAL_ERROR', ... }`, logando com
  `logError` e sem vazar detalhes. Registrado por último. Envelope de resposta
  padrão: `{ statusCode, error, message }`.
- **Helpers HTTP reutilizáveis** em `src/http/`: `async-handler`, `parse-body`,
  `send-error`, `log-error`, `client-ip`. Reutilize-os.
- **Validação:** schemas em `@order-system/shared` quando compartilhados; senão
  locais em `validation/*.validation.ts`.
- **Migrations:** SQL numeradas em `apps/backend/migrations/NNN_*.sql`.

### Multi-tenancy (regra crítica)

- **Todo acesso a dados tenant-scoped passa pelo `tenantRepository(tenantId)`**
  (`src/db/tenant-repository.ts`). Ele injeta `tenant_id` por construção em
  select/insert/update/delete e lança `MissingTenantContextError` antes de
  qualquer I/O se o tenant estiver ausente.
- **Nenhum service importa `config/database.js` diretamente** — há um teste de
  arquitetura (`__tests__/unit/tenant-repository-architecture.test.ts`) que falha
  se isso acontecer. Exceção permanente: `tenant-provision.service.ts`.
- `raw()` é escape hatch controlado: o SQL deve referenciar `tenant_id` como
  `$1`, senão lança `MissingTenantPlaceholderError`.
- O tenant é resolvido em `middleware/tenant.middleware.ts` (após auth), expondo
  `req.tenantId` e `req.tenantContext`.

## Mobile (`apps/mobile`)

- **Stack:** Expo ~57 + `expo-router` (roteamento por arquivos), React Native
  0.86, React 19, `react-native-web` (roda também como PWA). Testes com **Jest**
  + **jest-expo** + **@testing-library/react-native** (+ fast-check disponível).
- **Componentes e telas:** função nomeada exportada (`export function Nome()`),
  com JSDoc pt-BR no topo. Hooks no topo (`useTheme`, `useRouter`/
  `useLocalSearchParams`, `useState`, `useRef`).
- **Estilos via tema:** monte objetos tipados (`ViewStyle`/`TextStyle`/`ImageStyle`)
  a partir de `useTheme()` (`theme.colors.*`, `theme.typography.*`); não use
  cores/tamanhos hardcoded nem `StyleSheet.create`.
- **Reuso:** componentes em `src/components/` (`Input`, `Button`, `Screen`, ...);
  validação em serviços dedicados em `src/services/` (ex.: `email-validation`),
  com o backend como autoridade final.
- **Acessibilidade é de primeira classe:** `accessibilityLabel`,
  `accessibilityRole`, `accessibilityState`, `accessibilityHint`; mensagens de
  erro com `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"`;
  ícones decorativos marcados como ocultos para leitores de tela.
- **`testID` em todos os elementos interativos e de mensagem** (ex.:
  `request-code-email-input`, `reset-password-submit-button`).

## Nomeação de arquivos

- **Backend (kebab-case + sufixo de papel):** `*.controller.ts`, `*.service.ts`,
  `*.routes.ts`, `*.middleware.ts`, `*.validation.ts`. Testes: `*.test.ts`
  (unit) e `*.property.test.ts` (property-based).
- **Mobile:** componentes e telas em PascalCase (`Input.tsx`, `RequestCodeScreen.tsx`);
  serviços/lógica em kebab-case (`api-client`, `email-validation`).

## Idioma e testes

- **Mensagens de erro, comentários e JSDoc em pt-BR.** Cite IDs de requisito das
  specs (`.kiro/specs/...`) quando existirem (ex.: `R4.3`, `R6.1`).
- **Property tests (backend):** `describe/it/expect` do Vitest + `import * as fc
  from 'fast-check'`, com JSDoc enunciando a propriedade formal e
  `**Validates: Requirements X.Y**`. Ficam em `src/__tests__/properties/`.
- **Não adicione testes automaticamente** a menos que o usuário peça.

## Linting (ESLint)

- **Config única na raiz:** `eslint.config.js` (flat config do ESLint 9) cobre
  todos os workspaces. Stack: `eslint` 9 + `typescript-eslint` 8 + `@eslint/js`
  + `eslint-plugin-react-hooks`. Cada workspace roda `eslint src/` via seu
  script `lint` e herda a config da raiz.
- **Não há Prettier.** O ESLint cobre apenas qualidade/correção, não
  formatação. Não introduza um formatter sem alinhar com o usuário.
- **Regras base (todo TS/TSX):**
  - `@typescript-eslint/no-explicit-any`: **warn** — evite `any`; prefira
    `unknown` + narrowing. Ainda assim, é aviso (não trava), sinalizando dívida.
  - `@typescript-eslint/no-unused-vars`: **warn** — prefixe com `_` para
    silenciar intencionalmente (ex.: `_next` no `errorHandler`); os padrões
    `argsIgnorePattern`/`varsIgnorePattern`/`caughtErrorsIgnorePattern` são `^_`.
  - `@typescript-eslint/consistent-type-imports`: **warn** — use `import type`
    (estilo inline) para imports usados apenas como tipo.
  - `eqeqeq` (smart), `prefer-const`: **warn**; `no-var`: **error**.
  - `no-console`: **off** (há logs deliberados, ex.: `logError`, bot).
- **Overrides por contexto:**
  - Mobile e Web: `react-hooks/rules-of-hooks` (**error**) e
    `react-hooks/exhaustive-deps` (**warn**).
  - Mobile: `no-require-imports` **desligada** — `require()` de assets é
    idiomático no React Native (ex.: `require('../../assets/logo.png')`).
  - Testes (`**/__tests__/**`, `*.test.*`): `no-explicit-any` e
    `no-non-null-assertion` desligadas para facilitar cenários de teste.
- **Ignorados:** `node_modules`, `dist`, `build`, `.expo`, `coverage`, `*.d.ts`
  e arquivos de config (`*.config.{js,ts}`, `babel`/`metro`).
- **Ao finalizar código, o lint do app afetado deve passar sem novos erros.**
  Warnings pré-existentes são dívida conhecida; não adicione novos. Se precisar
  contornar uma regra, faça-o de forma pontual e comentada, não afrouxando a
  config global.

## Comandos úteis (por app, via pnpm --filter)

- Backend: `typecheck`, `test` (vitest run), `lint`, `dev`, `migrate`.
- Mobile: `typecheck`, `test` (jest), `lint`, `start`.
- Raiz (recursivo): `pnpm -r build | lint | test | typecheck`.
- Evite iniciar servidores/watchers dentro de tarefas automatizadas; peça ao
  usuário para rodar `dev`/`start` manualmente quando necessário.
