---
inclusion: manual
---

# Skill: Implementar design do Penpot na landing page

## Quando usar

Acione esta skill quando for **implementar no código** (principalmente a
`Landing_Page` do `apps/web`) um design que está no Penpot, mantendo o padrão de
Design System já usado no app web e no PWA operador (`apps/mobile`).

Fluxo desta skill: **Penpot (fonte do design) → código**, sempre ancorado no
Design System que vive em `@order-system/shared` e é consumido via `useTheme()`.
O Penpot informa o *layout* e a *composição* (o quê, onde, hierarquia); o
**código do projeto é a autoridade dos valores de estilo** (cores, espaçamentos,
tipografia, raios) via tokens de tema — nunca copie hex/px crus do Penpot.

## Premissas e fontes da verdade

- **Design (composição/layout):** Penpot, acessado pela UI via MCP (servidor
  `penpot` em `~/.kiro/settings/mcp.json`). Antes de qualquer código do Penpot,
  leia o `high_level_overview` e o `penpot_api_info` dos tipos que for usar.
- **Design System (valores de estilo):** `@order-system/shared`
  (`NEUTRAL_PLATFORM_THEME` em `packages/shared/src/theme/platform-theme.ts`),
  exposto no `apps/web` por `useTheme()` (`apps/web/src/theme`). É a **mesma**
  fonte usada pelo backend (branding) e pelo PWA mobile — por isso o web e o PWA
  ficam alinhados. Tokens disponíveis:
  - `theme.colors.*` (ex.: `primary`, `background`, `text`, `textSecondary`,
    `surface`, `surfacePrimary`, `border`, status `aguardando/preparando/...`).
  - `theme.typography.fontFamily` (`Inter`), `theme.typography.sizes.{xs..xxl}`,
    `theme.typography.weights.{regular:400, medium:500, bold:600}`.
  - `theme.spacing.{xs:4, sm:8, md:16, lg:24, xl:32}`.
  - `theme.borderRadius.{sm:8, md:12, lg:24, full:9999}`.

## Procedimento

### 1. Ler o design no Penpot (UI via MCP)

- Ler o `high_level_overview` do MCP Penpot (obrigatório antes de usar `penpot`/
  `penpotUtils`) e o `penpot_api_info` dos tipos necessários.
- Localizar o board/frame da landing na página de design. Guardar referências
  intermediárias em `storage` (ids de shapes, medidas) para reuso entre chamadas.
- Usar `export_shape` (PNG para preview, SVG quando precisar de vetor) para ter
  uma imagem fiel do alvo — hero, seções, CTA, cards — antes de codar.
- Extrair a **estrutura** (hierarquia de seções, ordem, agrupamentos,
  responsividade) e as **proporções**. Se precisar inspecionar estilos de uma
  seção como referência:
  ```js
  const page = penpotUtils.getPageByName('<nome da página de design>');
  const section = penpotUtils.findShape((s) => s.name === '<seção>', page.root);
  penpot.generateStyle(section.children, { type: 'css', withChildren: true, includeChildren: true });
  ```
  Use o CSS extraído apenas para **entender** o layout; converta cada valor para
  o token de tema equivalente (ver passo 3), não cole valores crus.

### 2. Mapear o design para o código real

Alvos no `apps/web` (não invente componentes — estes são os que existem):

- `apps/web/src/pages/LandingPage.tsx` — a landing em si (hero, destaques,
  passos, CTAs, rodapé).
- `apps/web/src/components/` — componentes reutilizáveis existentes: `Screen`
  (de `Layout.tsx`), `FeatureCarousel`, `FeatureModal`, `TrialWarning`. Reutilize
  antes de criar novo; se um novo componente for necessário, coloque-o aqui e
  exporte por `index.ts`.
- `apps/web/src/theme` — `useTheme()` e o tema; não edite tokens para "casar" com
  o Penpot. Se o design exigir um token novo, alinhe com o usuário e adicione em
  `@order-system/shared` (`ThemeConfig` + `NEUTRAL_PLATFORM_THEME`), para web,
  PWA e backend permanecerem em sincronia.

Conteúdo textual/estrutura de marketing de referência: `docs/landingpage.md`.

### 3. Implementar mantendo o padrão do projeto

- **Estilos só via `useTheme()`** — nada de cores, tamanhos ou fontes hardcoded.
  Traduza cada valor do Penpot para o token mais próximo:
  - cor → `theme.colors.*`; fonte → `theme.typography.fontFamily`;
    tamanho de fonte → `theme.typography.sizes.*`; peso →
    `theme.typography.weights.*`; espaçamento/padding/gap → `theme.spacing.*`;
    raio → `theme.borderRadius.*`.
  - Se o Penpot trouxer um valor sem token equivalente, prefira o token mais
    próximo; só introduza token novo (no shared) com aval do usuário.
- **Acessibilidade e testabilidade** (padrão do web e do PWA): `aria-label`,
  roles e estados adequados nos elementos interativos; `data-testid` em
  elementos interativos e de mensagem (ex.: `landing-cta`).
- **JSDoc em pt-BR** no topo de componentes/telas, citando requisitos da spec
  quando aplicável (ex.: `R1.1`, `R1.2`).
- **Mudança mínima e focada** no que o design pede; não "limpe" código ao redor.
- **Espelhar no PWA só se estiver no escopo.** Esta skill mira o `apps/web`. Se o
  design também mudar um componente compartilhado conceitualmente com o
  `apps/mobile`, replique o mesmo padrão (tema via `useTheme()`, acessibilidade,
  `testID`) — mas confirme o escopo com o usuário antes.

### 4. Revisar contra o Penpot

- Rodar o build/preview localmente é responsabilidade do usuário (não iniciar
  `dev`/servidores em tarefa automatizada). Para conferir a fidelidade, compare a
  implementação com o `export_shape` do passo 1 e ajuste espaçamentos/hierarquia.

### 5. Verificar (padrão do projeto, single-run)

```bash
pnpm --filter @order-system/web typecheck
pnpm --filter @order-system/web test
pnpm --filter @order-system/web lint
```

Se um componente compartilhado com o PWA foi tocado, rode também:

```bash
pnpm --filter @order-system/mobile typecheck
pnpm --filter @order-system/mobile test
pnpm --filter @order-system/mobile lint
```

Não introduza novos erros nem novos warnings de lint. Sempre adicione/atualize
testes (Testing Library no `apps/web`) cobrindo o comportamento novo/alterado.

## Regras críticas (não violar)

- **Design System é o código, não o Penpot.** Valores de estilo saem de
  `useTheme()` / `@order-system/shared`; o Penpot define layout e composição.
- **Sem estilos hardcoded** (hex, px de fonte/espaçamento, family). Sempre token.
- **Fonte:** `theme.typography.fontFamily` (`Inter`) — nunca fixe a string.
- **Reuse** `Screen`, `FeatureCarousel`, `FeatureModal`, `TrialWarning` antes de
  criar componentes novos.
- **Acessibilidade + `data-testid`** em elementos interativos e de mensagem.
- **Web e PWA alinhados:** qualquer token novo entra em `@order-system/shared`
  (com aval do usuário), nunca só no `apps/web`.

## Referências

- Padrões do projeto: `.kiro/steering/project-standards.md`
- Clean code / DRY: `.kiro/steering/clean-code.md`
- Checklist de revisão: `.kiro/steering/code-review-checklist.md`
