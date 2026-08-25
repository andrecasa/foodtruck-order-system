# Design System — Order System (Food Truck App)

## Introdução

Design System da plataforma white-label **Food Truck App**. Define os tokens visuais compartilhados entre mobile (Expo/React Native) e web (Vite/React), projetados para suportar personalização por tenant sem alteração de código.

Cada tenant pode sobrescrever qualquer token via JSON parcial retornado pelo backend (`GET /api/tenant/branding`). O deep merge preserva valores não-informados, garantindo que a paleta neutra (documentada aqui) seja sempre o fallback seguro.

> **Fonte da verdade**: Este documento + projeto Penpot "Food Truck App" (conectado via MCP).
> Os valores aqui correspondem exatamente a `apps/mobile/src/theme/theme.config.ts` (tema neutro).

---

## Princípios de Design

- **Neutral & Professional** — Paleta dessaturada, sem identidade de marca. Cada tenant aplica seu branding.
- **Clean & Minimal** — Superfícies brancas, sombras sutis, foco no conteúdo.
- **Material Design Influence** — Ícones Material Symbols Outlined, elevation scale, pill buttons.
- **Fonte Inter** — Legibilidade máxima em todas as densidades.
- **Stroke 1px** — Bordas sempre com 1px, alinhamento inner.
- **Pill-shaped** — Inputs (border-radius 24px) e botões (border-radius 20px).
- **WCAG AA** — Contraste mínimo 4.5:1 em texto sobre fundo.
- **Token-driven** — Todos os valores visuais vêm de tokens semânticos; nenhum hardcode nos componentes.

---

## Arquitetura de Tokens
          
```
ThemeConfig (interface TypeScript)
├── colors.*           → Paleta semântica
├── typography.*       → Família, tamanhos, pesos
├── spacing.*          → Escala de espaçamento
└── borderRadius.*     → Raios de borda
```

Interface definida em `packages/shared/src/types/theme.ts`.
Implementações neutras em:
- Mobile: `apps/mobile/src/theme/theme.config.ts`
- Web: `apps/web/src/theme/theme.config.ts`

---

## Paleta de Cores (Tema Neutro da Plataforma)

### Cores Primárias

| Token          | Hex Mobile  | Hex Web     | Uso                                       |
| -------------- | ----------- | ----------- | ----------------------------------------- |
| `primary`      | `#2C6E9B`   | `#3B5568`   | Cor principal (botões, destaques, ícones ativos) |
| `secondary`    | `#5A6B7B`   | `#6B7B8C`   | Cor secundária (acentos)                  |

### Superfícies

| Token              | Hex         | Uso                                        |
| ------------------ | ----------- | ------------------------------------------ |
| `background`       | `#F5F7FA`   | Fundo de tela                              |
| `surface`          | `#FFFFFF`   | Fundo de cards, header, modais             |
| `surfaceDisabled`  | `#E2E8F0`   | Fundo de controles desabilitados           |
| `surfacePrimary`   | `#EEF3F7`   | Sub-card: tint primário                    |
| `surfaceRevenue`   | `#F7F1E6`   | Sub-card: tint faturamento (amber)         |
| `surfaceReceived`  | `#EDF5EF`   | Sub-card: tint recebido (verde)            |
| `surfacePending`   | `#FBEEEE`   | Sub-card: tint pendente (vermelho)         |

### Texto

| Token            | Hex         | Uso                                      |
| ---------------- | ----------- | ---------------------------------------- |
| `text`           | `#1F2933`   | Texto principal                          |
| `textSecondary`  | `#6B7280`   | Texto secundário, placeholders, labels   |
| `textDisabled`   | `#9AA5B1`   | Texto/ícone de conteúdo desabilitado     |

### Bordas e Separadores

| Token      | Hex         | Uso                          |
| ---------- | ----------- | ---------------------------- |
| `divider`  | `#E2E8F0`   | Separadores finos            |
| `border`   | `#E2E8F0`   | Bordas de inputs, cards, chips |

### Status de Pedidos

| Token        | Hex         | Uso                              |
| ------------ | ----------- | -------------------------------- |
| `aguardando` | `#B8860B`   | Status: pedido aguardando preparo (amber) |
| `preparando` | `#3B6EA5`   | Status: pedido em preparação (azul) |
| `pronto`     | `#3E8E5A`   | Status: pedido pronto (verde)    |
| `entregue`   | `#6B7280`   | Status: pedido entregue (cinza)  |

### Semânticas

| Token      | Hex         | Uso                            |
| ---------- | ----------- | ------------------------------ |
| `success`  | `#3E8E5A`   | Sucesso / confirmação          |
| `warning`  | `#B8860B`   | Alerta / atenção               |
| `error`    | `#B23A3A`   | Erro / ações destrutivas       |

### Financeiras

| Token      | Hex         | Uso                          |
| ---------- | ----------- | ---------------------------- |
| `received` | `#2E7D32`   | Valor recebido (verde escuro)|
| `pending`  | `#C62828`   | Valor pendente (vermelho)    |
| `revenue`  | `#2C6E9B`   | Faturamento (azul primário)  |

### Nota sobre Divergência Mobile × Web

As cores primárias diferem intencionalmente: o mobile usa `#2C6E9B` (blue, mais vibrante para touch targets) enquanto o web usa `#3B5568` (blue-gray, mais discreto para tela de preparador). Ambas são neutras e sem identidade de marca. Tenants podem sobrescrever para suas próprias cores.

---

## Tipografia

### Fontes

| Token        | Valor                         | Descrição         |
| ------------ | ----------------------------- | ----------------- |
| `fontFamily` | `Inter`                       | Fonte principal   |
| (ícones)     | `Material Symbols Outlined`   | Fonte de ícones   |

### Escala Tipográfica

| Estilo       | Token Size | Valor | Weight Token | Valor | Uso                                   |
| ------------ | ---------- | ----- | ------------ | ----- | ------------------------------------- |
| **Display**  | `xxl`      | 32px  | `regular`    | 400   | Logotipo, nomes de negócio            |
| **Title**    | `xl`       | 20px  | `medium`     | 500   | Títulos de seção                      |
| **AppBar**   | —          | 18px  | `regular`    | 400   | Título do header                      |
| **Body Large** | `lg`     | 16px  | `regular`    | 400   | Texto primário, nomes em cards        |
| **Body**     | `md`       | 14px  | `regular`    | 400   | Texto padrão, botões, itens           |
| **Label**    | `sm`       | 12px  | `regular`    | 400   | Labels de formulário, badges          |
| **Caption**  | `xs`       | 10px  | `regular`    | 400   | Timestamps, nav labels, textos auxiliares |

### Tokens do ThemeConfig

| Token             | Valor | Descrição              |
| ----------------- | ----- | ---------------------- |
| `sizes.xs`        | `10`  | Caption                |
| `sizes.sm`        | `12`  | Label / badge          |
| `sizes.md`        | `14`  | Body text              |
| `sizes.lg`        | `16`  | Body large             |
| `sizes.xl`        | `20`  | Title                  |
| `sizes.xxl`       | `32`  | Display                |
| `weights.regular` | `400` | Texto corrido, botões  |
| `weights.medium`  | `500` | Títulos, ênfase        |
| `weights.bold`    | `600` | Preços, destaques      |

---

## Espaçamento

| Token  | Valor (px) | Uso                         |
| ------ | ---------- | --------------------------- |
| `xs`   | `4`        | Gaps mínimos                |
| `sm`   | `8`        | Padding interno, gaps       |
| `md`   | `16`       | Padding padrão              |
| `lg`   | `24`       | Seções, padding de tela     |
| `xl`   | `32`       | Separação de blocos grandes |

---

## Border Radius

| Token  | Valor (px) | Uso                              |
| ------ | ---------- | -------------------------------- |
| `sm`   | `8`        | Containers secundários           |
| `md`   | `12`       | Cards, modais                    |
| `lg`   | `24`       | Inputs (pill-shaped)             |
| `full` | `9999`     | Badges circulares, avatares      |

### Valores por Componente

| Componente       | Border Radius |
| ---------------- | ------------- |
| Botão lg         | 22px          |
| Botão md         | 20px          |
| Botão sm         | 18px          |
| Input            | 24px          |
| Card             | 14px          |
| Card (sub-card)  | 10px          |
| Badge md         | 14px          |
| Badge sm         | 11px          |
| Modal            | 16px          |
| FilterChip icon  | 18px          |
| FilterChip pill  | 16px          |
| BottomNav        | 0 (flat)      |

---

## Sombras (Elevation)

| Nível      | Valor                            | Uso                     |
| ---------- | -------------------------------- | ----------------------- |
| Level 0    | nenhuma                          | Flat / inline elements  |
| Level 1    | `0 1px 3px rgba(0,0,0,0.06)`    | AppBar, BottomNav       |
| Level 2    | `0 2px 8px rgba(0,0,0,0.08)`    | Cards                   |
| Level 3    | `0 8px 24px rgba(0,0,0,0.15)`   | Modais, overlays        |

---

## Ícones

- **Fonte:** Material Symbols Outlined
- **Weight:** Sempre 400
- **Renderização Mobile:** font text (`fontFamily: "Material Symbols Outlined"`)
- **Renderização Web:** Google Fonts link

### Tamanhos

| Contexto     | Tamanho |
| ------------ | ------- |
| Badge inline | 12px    |
| Timer/small  | 14px    |
| Sub-card     | 18px    |
| Input icon   | 20px    |
| Nav/default  | 22px    |
| AppBar       | 24px    |
| Hero/large   | 32px    |

### Ícones Utilizados

| Ícone                   | Contexto          |
| ----------------------- | ----------------- |
| `receipt_long`          | Pedidos / nav     |
| `add_circle`            | Novo Pedido / nav |
| `restaurant_menu`       | Cardápio / nav    |
| `monitoring`            | Resumo / nav      |
| `payments`              | Pagamento         |
| `menu`                  | Abrir drawer      |
| `arrow_back`            | Voltar            |
| `logout`                | Sair              |
| `check_circle`          | Pronto/Entregue   |
| `schedule`              | Aguardando        |
| `local_fire_department` | Preparando        |
| `notifications`         | Pronto (nav)      |
| `chat`                  | WhatsApp          |
| `storefront`            | Presencial        |
| `mail`                  | Campo email       |
| `lock`                  | Campo senha       |
| `person`               | Campo nome        |
| `add` / `remove`        | Stepper +/−       |
| `currency_exchange`     | Badge pagamento   |
| `timer`                 | Tempo do pedido   |
| `visibility` / `visibility_off` | Toggle senha |

---

## Componentes

### AppBar (Header)

```
Background: surface (#FFFFFF)
Height: 56px
Padding: 0 16px
Gap: 12px
Layout: flex row, align-items center
Shadow: Level 1 (0 1px 3px rgba(0,0,0,0.06))

Elementos:
- Leading icon: Material Symbols 24px, color textSecondary (#6B7280)
  - "menu" (abre drawer) — padrão
  - "arrow_back" (volta) — quando onBack fornecido
- Título: 18px weight 400, Inter, color text (#1F2933), flex:1, textAlign center
- Trailing: rightElement ou spacer 24px (para centralizar título)
```

### Bottom Navigation

```
Background: surface (#FFFFFF)
Height: 56px
Shadow: 0 -1px 3px rgba(0,0,0,0.06)
Layout: flex row, justify-content space-around, align-items center

Cada item:
- Layout: flex column, gap 2px, align-items center
- Ícone: Material Symbols 22px weight 400
- Label: 10px Inter weight 400
- Ativo: color primary (#2C6E9B)
- Inativo: color textSecondary (#6B7280)

Items: Pedidos | Novo | Cardápio | Resumo
Icons: receipt_long | add_circle | restaurant_menu | monitoring
```

### Button

#### Filled (md — padrão)

```
Background: primary (#2C6E9B)
Color: surface (#FFFFFF)
Border: none
Border-radius: 20px
Height: 40px
Padding: 0 20px
Font: 14px weight 400, Inter
```

#### Filled (sm — in-card actions)

```
Background: varia por status (aguardando, preparando, pronto)
Color: surface (#FFFFFF)
Border: none
Border-radius: 18px
Height: 36px
Padding: 0 16px
Font: 12px weight 400, Inter
```

#### Filled (lg — main CTA)

```
Background: primary (#2C6E9B)
Color: surface (#FFFFFF)
Border: none
Border-radius: 22px
Height: 44px
Padding: 0 20px
Font: 14px weight 400, Inter
```

#### Variantes de cor (filled)

| Variante    | Background            |
| ----------- | --------------------- |
| primary     | `primary` (#2C6E9B)  |
| secondary   | `secondary` (#5A6B7B)|
| danger      | `error` (#B23A3A)    |
| status      | cor do status atual   |

#### Outlined

```
Background: transparent
Border: 1px solid textSecondary (#6B7280) — inner alignment
Border-radius: 20px
Height: 40px
Padding: 0 20px
Font: 14px weight 400
Color: textSecondary (#6B7280) ou custom color prop
```

#### Disabled

```
Background: surfaceDisabled (#E2E8F0)
Color: textDisabled (#9AA5B1)
Border: none
Border-radius: 20px
Height: 40px
Font: 14px weight 400
```

### Badge

#### Status (tinted — padrão)

Badges usam fundo com 12% de opacidade da cor do status + texto na cor sólida.

| Status     | Background           | Text Color   |
| ---------- | -------------------- | ------------ |
| Aguardando | `aguardando` + 1F   | `#B8860B`    |
| Preparando | `preparando` + 1F   | `#3B6EA5`    |
| Pronto     | `pronto` + 1F       | `#3E8E5A`    |
| Entregue   | `entregue` + 1F     | `#6B7280`    |

```
Layout: flex row, gap 3px, align-items center
Border-radius: 11px (sm) / 14px (md)
Height: 22px (sm) / 28px (md)
Padding: 0 8px (sm) / 0 12px (md)
Icon: Material Symbols 12px, mesma cor do texto
Font: 10px (sm) / 11px (md) weight 400, Inter
Text: capitalizado (ex: "Aguardando")
```

#### Tinted (informativo)

| Tipo       | Background          | Text Color   |
| ---------- | ------------------- | ------------ |
| Pago       | `surfaceReceived`   | `primary`    |
| Pendente   | `surfaceRevenue`    | `aguardando` |
| Presencial | `preparando` + 14   | `preparando` |
| WhatsApp   | `pronto` + 14       | `pronto`     |

### Input (Pill)

```
Wrapper: flex column, gap 8px

Label:
- Font: 12px weight 400, Inter
- Color: text (#1F2933)

Campo:
- Shape: Pill (border-radius 24px)
- Height: 52px
- Padding: 0 16px
- Gap: 10px (entre icon e texto)
- Layout: flex row, align-items center

Estados:
- Default: bg surface (#FFFFFF), border 1px solid border (#E2E8F0)
- Focus: bg surface (#FFFFFF), border 1px solid primary (#2C6E9B)
- Error: bg surface (#FFFFFF), border 1px solid error (#B23A3A)
- Disabled: bg surface (#FFFFFF), border 1px solid border (#E2E8F0), opacity 0.5

Leading icon: Material Symbols 20px, color textSecondary (#6B7280)
Trailing icon (password toggle): Material Symbols "visibility" 20px, color textSecondary
Placeholder: 14px weight 400, color textSecondary (#6B7280)
Value text: 14px weight 400, color text (#1F2933)

Error message:
- Font: 10px weight 400, color error (#B23A3A)
- Margin-top: 4px (xs)
```

### Card (Order Card)

```
Background: surface (#FFFFFF)
Border-radius: 14px
Border: 1px solid <status-color> + 40 (25% opacity) — inner alignment
Layout: flex row (stripe + content)
Overflow: hidden

Left stripe:
- Width: 5px
- Background: <status-color> sólida
- Border-radius: 14px 0 0 14px (top-left, bottom-left)

Content area:
- Padding: 12px
- Gap: 8px
- Layout: flex column

Composição do card:
1. Badges row: flex row, gap 6px
   - Payment badge (sm): [icon 12px] + [label 10px]
   - Origin badge (sm): [icon 12px] + [label 10px]
   - Status badge (sm): [icon 12px] + [label 10px]
2. Nome: "#{dailyNumber} - {customerName}", 16px weight 600, color text
3. Itens: "{qty}x {name} ({subtotal})", 12px weight 400, color text
4. Preço: formatPrice(totalAmount), 16px weight 600, color text
5. Tempo: [icon timer 14px] + [label 11px], color textSecondary, opacity 0.7
6. CTA Button (sm): se status permite avanço
```

### FilterChips (Icon Tabs)

```
Container:
- Background: surface (#FFFFFF)
- Border-radius: 16px
- Padding: 10px vertical
- Layout: flex row

Cada tab:
- Flex: 1
- Layout: flex column, align-items center, gap 6px

Icon area:
- Width: 75px, Height: 36px
- Border-radius: 18px
- Active: bg <status-color> sólida, icon color surface (#FFFFFF) 22px
- Inactive: bg <status-color> + 14 (8% opacity), icon color <status-color> opacity 0.5

Label:
- Font: 10px weight 400, Inter
- Active: color <status-color>
- Inactive: color textSecondary (#6B7280)
```

### Origin Selector (Swipeable)

```
Container:
- Height: 40px
- Border-radius: 20px
- Border: 1px solid border (#E2E8F0)
- Background: surface (#FFFFFF)

Thumb (slider):
- Background: primary (#2C6E9B)
- Border-radius: 18px
- Margin: 2px
- Animated (spring)

Tab labels:
- Font: 13px weight 400, Inter
- Active: color surface (#FFFFFF)
- Inactive: color textSecondary (#6B7280)

Options: "Presencial" | "WhatsApp"
```

### Modal / Dialog

```
Overlay: rgba(33, 33, 33, 0.4)

Dialog:
- Background: surface (#FFFFFF)
- Border-radius: 16px
- Shadow: Level 3 (0 8px 24px rgba(0,0,0,0.15))
- Padding: 24px
- Gap: 16px
- Max-width: 400px
- Layout: flex column

Título: 18px weight 500, color text (#1F2933)
Body: 14px weight 400, color textSecondary (#6B7280)

Actions row:
- Layout: flex row, gap 8px, justify-content flex-end
- Cancel: outlined button (md), border textSecondary, text textSecondary
- Confirm: filled button (md), bg primary ou error (variant danger)
```

### SubCard (Stat Card)

```
Layout: flex row, align-items center, gap 8px
Background: surfacePrimary / surfaceRevenue / surfaceReceived / surfacePending
Border-radius: 10px
Padding: 10px horizontal, 12px vertical
Height: 60px

Icon circle:
- Width/Height: 34px
- Border-radius: 17px (full)
- Background: <color> + 1F (12% opacity)
- Icon: Material Symbols 18px, color <color>

Text area:
- Value: 15px weight 600, color <color>
- Label: 10px weight 400, color textSecondary (#6B7280) ou labelColor
```

### PaymentRow

```
Layout: flex row, align-items center, gap 12px, height 44px

Icon circle:
- Width/Height: 30px
- Border-radius: 15px (full)
- Background: <iconColor> + 1F (12% opacity)
- Icon: Material Symbols 16px, color <iconColor>

Label: flex 1, 14px weight 400, color text (#1F2933)
Value: 14px weight 600, color text (#1F2933)
```

### Toast / Error Banner

```
Background: error (#B23A3A) ou surface com border
Border-radius: 8px (sm)
Padding: 12px 16px
Font: 12px weight 400, color surface (#FFFFFF)
Position: top, centered
```

---

## Telas do App Mobile

### Login

```
Layout: flex column, align-items center, gap 24px
Background: background (#F5F7FA)
Padding: 24px horizontal, 50px top

Elementos:
1. Logo/título: businessName, 32px weight 400 (Display)
2. Subtítulo: "Faça login para continuar", 14px, color textSecondary
3. Input Email: icon "mail", placeholder "Seu e-mail"
4. Input Senha: icon "lock", placeholder "Sua senha", toggle visibility
5. Error message: 12px, color error, centralizado
6. Button lg (fullWidth): "Entrar"
```

### Fila de Pedidos (OrderQueue)

```
Layout: flex column, fill height
Background: background (#F5F7FA)

1. Header: AppBar com title "Pedidos", menu icon
2. DateChip: seletor de data (abre CalendarModal)
3. FilterChips (icon tabs): Aguardando | Preparando | Pronto | Entregue
4. ScrollContainer: lista de Order Cards
5. Empty state: ilustração + texto quando sem pedidos

Cada card mostra: badges, nome, itens, preço, tempo, CTA
Realtime: atualização automática via WebSocket
```

### Novo Pedido (CreateOrder)

```
Layout: FormScreen (scroll + fixed CTA bottom)
Background: background (#F5F7FA)

1. Header: AppBar com title "Novo Pedido", back arrow
2. Input: "Nome do cliente" (icon person)
3. Origin Selector: "Presencial" | "WhatsApp"
4. Section "Itens do Pedido":
   - Agrupados por categoria (label 13px bold)
   - Cada item: nome + preço + stepper (−/qty/+)
   - Stepper: circles 28px, minus (bg surface, border border), plus (bg primary, icon surface)
5. Total row: bg surfacePrimary, borderRadius 8px, h 48px
   - "Total" 14px weight 400
   - Amount: 20px weight 600, color primary
6. Button lg (fullWidth): "Criar Pedido"
```

### Pagamento

```
Layout: flex column
Background: background (#F5F7FA)

1. Header: AppBar com title "Pagamento", back arrow
2. Order summary card: número, cliente, itens, total
3. Section "Formas de Pagamento":
   - 4 botões pill (height 44px, radius 22px):
     PIX | Cartão Débito | Cartão Crédito | Dinheiro
   - Não selecionado: bg surface, border 1px border, text text
   - Selecionado: bg success (#3E8E5A), text surface
4. Button lg: "Confirmar Pagamento"
5. Estado "Já Pago":
   - Método exibido com bg success + 1F, text success
   - Mensagem "Pedido já foi pago" centralizada
```

### Resumo do Dia

```
Layout: flex column, scroll
Background: background (#F5F7FA)

1. Header: AppBar com title "Resumo do Dia", menu icon
2. DateChip: seletor de data
3. Section "Resumo do Dia" — Grid 2x2 de SubCards:
   - Pedidos: icon receipt_long, color primary, bg surfacePrimary
   - Faturamento: icon trending_up, color revenue, bg surfaceRevenue
   - Recebido: icon check_circle, color received, bg surfaceReceived
   - Pendente: icon schedule, color pending, bg surfacePending
4. Section "Formas de Pagamento" — PaymentRows:
   - PIX, Cartão Débito, Cartão Crédito, Dinheiro
5. Button outline: "Ver Resumo Mensal"
```

---

## Regras de Implementação

1. **Todos os valores visuais via tokens** — Nenhum hardcode de cor/tamanho nos componentes
2. **Stroke sempre 1px** — Nunca usar 2px (stroke alignment: inner)
3. **Border-radius por componente** — Seguir tabela de valores específicos
4. **Sem background tinted nos order cards** — Sempre fundo branco, borda colorida + stripe
5. **Ícones via fonte Material Symbols Outlined** — weight 400
6. **Botão CTA por status**: aguardando → `aguardando`, preparando → `preparando`
7. **Font-weight nos botões: 400** — Consistente em todos os tamanhos
8. **Badge bg = cor + "1F" (12% opacity)** — Padrão tinted, não sólido
9. **Inputs com label externo acima** — 12px weight 400, gap 8px
10. **Font-family: "Inter"** — Sempre
11. **Opacity pattern**: "14" = 8%, "1F" = 12%, "40" = 25% — Sufixos hex no color string

---

## Design Tokens no Penpot

Para manter sincronismo entre código e design, o projeto Penpot "Food Truck App" utiliza Design Tokens organizados em sets:

### Token Set: `platform-neutral`

| Tipo            | Tokens                                                      |
| --------------- | ----------------------------------------------------------- |
| `color`         | Toda a paleta de cores listada acima                        |
| `dimension`     | spacing.xs (4), sm (8), md (16), lg (24), xl (32)          |
| `borderRadius`  | sm (8), md (12), lg (24), full (9999)                      |
| `fontSizes`     | xs (10), sm (12), md (14), lg (16), xl (20), xxl (32)      |
| `fontWeights`   | regular (400), medium (500), bold (600)                     |
| `fontFamilies`  | Inter                                                       |
| `opacity`       | disabled (0.5), subtle (0.7)                                |

### Tema: `Platform Default`

Ativa o token set `platform-neutral`. Tenants criam seus próprios sets com overrides parciais.

---

## Como Criar um Novo Tema (Tenant)

1. Crie um JSON com override parcial:

```json
{
  "businessName": "Taco Loco",
  "logoUrl": "https://...",
  "theme": {
    "colors": {
      "primary": "#E65100",
      "secondary": "#BF360C"
    }
  }
}
```

2. Configure no banco (tabela `tenants`, coluna `theme` JSONB).

3. O backend retorna via `GET /api/tenant/branding` após login.

4. O sistema faz deep merge com o tema neutro — apenas campos informados são sobrescritos.

5. Tokens não-informados (como status colors, spacing, typography) herdam do tema neutro.

---

## Referência de Arquivos

| Arquivo | Descrição |
| ------- | --------- |
| `packages/shared/src/types/theme.ts` | Interface `ThemeConfig` |
| `apps/mobile/src/theme/theme.config.ts` | Tema neutro mobile + merge + fetch |
| `apps/web/src/theme/theme.config.ts` | Tema neutro web + merge + fetch |
| `apps/*/src/theme/ThemeProvider.tsx` | Provider de contexto |
| `apps/mobile/src/components/` | Componentes que consomem tokens |
| `docs/design-system.md` | Este documento |

---

## Changelog

| Data       | Alteração |
| ---------- | --------- |
| 2025-08-24 | **Reescrita completa**: removidas todas as referências ao Pastel das Meninas e cores Material Design legadas. Alinhado com o tema neutro real de `theme.config.ts`. Documentados tokens, componentes e telas com valores corretos da plataforma. Adicionada seção de Design Tokens para Penpot. |
| 2025-08-14 | (legado) Atualizado design dos badges de role. |
| 2025-08-11 | (legado) Valores extraídos do Penpot antigo (order-system). |
