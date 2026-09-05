# Checklist de Revisão e Análise de Melhorias

Antes de finalizar qualquer tarefa que crie ou altere código neste repositório,
faça uma passada de revisão usando este checklist. O objetivo é entregar código
limpo, sem duplicação e alinhado às boas práticas do `order-system`.

Se durante a análise você identificar problemas fora do escopo da tarefa atual,
**não os corrija em silêncio**: liste-os ao final da resposta como sugestões de
melhoria, para o usuário decidir. Correções dentro do escopo devem ser aplicadas.

## 1. Duplicação de código

- Procure trechos repetidos que você acabou de escrever ou que já existiam perto
  da área alterada. Há lógica que poderia virar um helper, função utilitária ou
  componente reutilizável?
- Verifique se já existe algo equivalente no projeto antes de criar novo:
  helpers em `apps/backend/src/http/`, `tenantRepository`, componentes em
  `apps/mobile/src/components/`, serviços em `src/services/`, schemas em
  `@order-system/shared`.
- Regras de negócio ou validações não devem estar duplicadas entre camadas
  (controller vs. service) nem entre backend e mobile.

## 2. Aderência aos padrões do projeto

- **Backend:** o fluxo respeita `routes → controller → service → tenantRepository`?
  Controllers só traduzem HTTP↔serviço (sem regra de negócio, sem try/catch que
  engula erros). Services concentram regra de negócio e lançam `ServiceError`.
- **Multi-tenant:** todo acesso a dados passa pelo `tenantRepository(tenantId)`?
  Nenhum service importa `config/database.js` diretamente (há teste de
  arquitetura que falha se isso acontecer). Consultas `raw()` referenciam
  `tenant_id` como `$1`.
- **Mobile:** telas e componentes usam `useTheme()` para estilos, expõem `testID`
  em elementos interativos e de mensagem, e delegam validação a serviços
  dedicados com o backend como autoridade final?
- **ESM no backend:** imports usam sufixo `.js` mesmo em arquivos `.ts`.
- **Nomeação de arquivos:** backend em kebab-case com sufixo de papel
  (`*.controller.ts`, `*.service.ts`, `*.routes.ts`, `*.middleware.ts`,
  `*.validation.ts`); componentes/telas mobile em PascalCase (`.tsx`).

## 3. Qualidade e robustez

- Entradas são validadas cedo? Erros são claros e em pt-BR?
- O tratamento de erro segue o padrão central (`ServiceError` + `errorHandler`),
  sem vazar detalhes internos ao cliente?
- Tipos são precisos (o `tsconfig` é `strict` com `noUncheckedIndexedAccess`)?
  Evite `any`; trate índices possivelmente indefinidos.
- Há valores mágicos que deveriam ser constantes nomeadas?
- Acessibilidade nos componentes mobile (`accessibilityLabel`, `accessibilityRole`,
  estados) está preservada?

## 4. Verificação

- Rode a verificação do app afetado antes de dar a tarefa por concluída:
  - Backend: `pnpm --filter @order-system/backend typecheck` e `test` (Vitest).
  - Mobile: `pnpm --filter @order-system/mobile typecheck` e `test` (Jest).
  - Lint: `pnpm --filter @order-system/<app> lint` (ou `pnpm -r lint`). O ESLint
    está configurado na raiz (`eslint.config.js`); a área alterada não deve
    introduzir novos erros nem novos warnings.
- Não adicione testes automaticamente a menos que o usuário peça. Quando
  adicionar (ou quando a tarefa for corrigir bug/adicionar feature e o usuário
  pedir cobertura), siga o estilo existente (property tests com fast-check +
  Vitest no backend; Testing Library no mobile).
- Se não for possível verificar algo (dependência ausente, ambiente), diga
  explicitamente o que ficou sem validar.

## 5. Escopo e comunicação

- A mudança resolve exatamente o que foi pedido, sem adicionar features,
  abstrações ou "defensividade" além do necessário?
- Ao final, se houver oportunidades de refatoração ou remoção de duplicação
  fora do escopo, liste-as brevemente como sugestões — não as aplique sem
  confirmação.
