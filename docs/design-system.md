# Design System — Order System

## Introdução

O Design System do Order System é a camada de tokens visuais compartilhada entre as aplicações web e mobile. Ele foi projetado para suportar **white-label**: qualquer food truck pode personalizar cores, tipografia, espaçamentos e bordas sem alterar código-fonte — apenas fornecendo um JSON de override parcial.

Todos os tokens são definidos pela interface `ThemeConfig` em `packages/shared/src/types/theme.ts` e consumidos de forma idêntica pelas duas plataformas.

> **Fonte da verdade**: O design no Penpot (conectado via MCP) é a referência para todos os valores visuais. Este documento é uma representação textual extraída do Penpot — em caso de dúvida, consulte o Penpot diretamente.

---

## Princípios de Design

- **Clean & Minimal** — Superfícies brancas, sombras sutis, foco no conteúdo
- **Material Design Influence** — Ícones Material Symbols Outlined, elevation scale, pill buttons
- **Fonte Inter** — Legibilidade máxima em todas as densidades
- **Stroke 1px** — Bordas sempre com 1px, alinhamento inner
- **Pill-shaped** — Inputs (border-radius 24px) e botões (border-radius 20px)
- **WCAG AA** — Contraste mínimo de 4.5:1 em texto sobre fundo

---

## Visão Geral dos Tokens

| Categoria         | Descrição                                    | Estrutura                                       |
| ----------------- | -------------------------------------------- | ----------------------------------------------- |
| **Colors**        | Paleta de cores da marca e status de pedidos | `colors.*`                                      |
| **Typography**    | Família tipográfica, tamanhos e pesos        | `typography.fontFamily`, `sizes.*`, `weights.*` |
| **Spacing**       | Escala de espaçamento (margin/padding)       | `spacing.*`                                     |
| **Border Radius** | Raios de borda para componentes              | `borderRadius.*`                                |

---

## Valores Padrão

Os valores abaixo representam o tema padrão ("Pastel das Meninas") e servem como fallback caso nenhum override seja fornecido.

### Colors

| Token        | Valor Hex   | Uso                                        |
| ------------ | ----------- | ------------------------------------------ |
| `primary`    | `#1B5E20`   | Cor principal (botões, destaques, ícones)  |
| `secondary`  | `#4E342E`   | Cor secundária (acentos)                   |
| `background` | `#FAFAFA`   | Fundo de tela                              |
| `surface`    | `#FFFFFF`   | Fundo de cards, header, modais             |
| `text`       | `#212121`   | Texto principal                            |
| `textSecondary` | `#757575` | Texto secundário, placeholders, labels   |
| `divider`    | `#E0E0E0`   | Bordas, separadores                        |
| `success`    | `#388E3C`   | Sucesso / status pronto                    |
| `warning`    | `#F9A825`   | Alerta / status aguardando                 |
| `error`      | `#D32F2F`   | Erro / ações destrutivas                   |
| `aguardando` | `#F9A825`   | Status: pedido aguardando preparo          |
| `preparando` | `#1976D2`   | Status: pedido em preparação               |
| `pronto`     | `#388E3C`   | Status: pedido pronto para entrega         |

### Typography

| Token              | Valor         | Descrição                         |
| ------------------ | ------------- | --------------------------------- |
| `fontFamily`       | `Inter` | Fonte principal    |
| `iconFont`         | `Material Symbols Outlined` | Fonte de ícones   |

#### Escala Tipográfica (extraída do Penpot)

| Estilo       | Size | Weight | Uso                                   |
| ------------ | ---- | ------ | ------------------------------------- |
| **Display**  | 32px | 300    | Logotipo, nomes de negócio            |
| **Headline** | 24px | 400    | Títulos de página (em texto corrido)  |
| **Title**    | 20px | 500    | Títulos de seção, AppBar (DS page)    |
| **Body Large** | 16px | 400  | Texto primário, card header           |
| **Body**     | 14px | 400    | Texto padrão, botões, itens           |
| **Label**    | 12px | 500    | Labels de formulário, ênfase          |
| **Caption**  | 11px | 400    | Timestamps, textos auxiliares         |

> **Nota sobre AppBar nas telas**: No design das telas (página "App"), o AppBar usa título 18px weight 500 com ícone leading 24px em primary. Na página "Design System", o componente AppBar mostra 20px weight 400. As telas são a referência final para implementação.

#### Tokens usados no ThemeConfig

| Token             | Valor | Descrição              |
| ----------------- | ----- | ---------------------- |
| `sizes.xs`        | `10`  | Caption / labels mínimos |
| `sizes.sm`        | `12`  | Label / badge          |
| `sizes.md`        | `14`  | Body text              |
| `sizes.lg`        | `16`  | Body large             |
| `sizes.xl`        | `20`  | Title                  |
| `sizes.xxl`       | `32`  | Display / headline     |
| `weights.regular` | `400` | Texto corrido, botões md |
| `weights.medium`  | `500` | Ênfase, títulos, labels |
| `weights.bold`    | `600` | Preços, destaques      |

### Spacing

| Token  | Valor (px) | Uso                         |
| ------ | ---------- | --------------------------- |
| `xs`   | `4`        | Gaps mínimos                |
| `sm`   | `8`        | Padding interno, gaps       |
| `md`   | `16`       | Padding padrão              |
| `lg`   | `24`       | Seções, padding de tela     |
| `xl`   | `32`       | Separação de blocos grandes |

### Border Radius

| Token  | Valor (px) | Uso                              |
| ------ | ---------- | -------------------------------- |
| `sm`   | `8`        | Containers secundários           |
| `md`   | `12`       | Cards, modais                    |
| `lg`   | `24`       | Inputs (pill-shaped)             |
| `full` | `9999`     | Badges circulares, avatares      |

**Valores específicos por componente:**

| Componente  | Border Radius |
| ----------- | ------------- |
| Botão md    | 20px          |
| Botão sm    | 18px          |
| Botão lg    | 22px          |
| Input       | 24px          |
| Card        | 12px          |
| Badge md    | 14px          |
| Badge sm    | 11px          |
| Modal       | 16px          |

---

## Ícones

- **Fonte:** Material Symbols Outlined
- **Mobile:** Renderizados via font text (fontFamily: "Material Symbols Outlined")
- **Web:** Google Fonts link `Material+Symbols+Outlined`
- **Weight:** Sempre 400
- **Tamanhos:** 18px (xs), 20px (sm), 24px (md), 32px (lg)

### Ícones Utilizados

| Ícone                   | Contexto          | Tamanho típico |
| ----------------------- | ----------------- | -------------- |
| `receipt_long`          | Pedidos / AppBar  | 24px (AppBar), 22px (nav) |
| `add_circle`            | Novo Pedido       | 24px / 22px    |
| `restaurant_menu`       | Cardápio          | 24px / 22px    |
| `bar_chart`             | Resumo            | 24px / 22px    |
| `payments`              | Pagamento         | 24px           |
| `logout`                | Sair              | 24px           |
| `check_circle`          | Pronto            | 20px           |
| `schedule`              | Aguardando        | 20px           |
| `local_fire_department` | Preparando        | 20px           |
| `chat`                  | WhatsApp          | 20px           |
| `mail`                  | Campo email       | 20px           |
| `lock`                  | Campo senha       | 20px           |
| `person`                | Campo nome        | 20px           |
| `add` / `remove`        | Stepper +/−       | 20px           |

---

## Componentes

### AppBar (Header)

```
Background: #FFFFFF
Height: 56px
Padding: 0 16px
Shadow: 0 1px 3px rgba(0,0,0,0.06)  [nas telas]
        0 1px 3px rgba(0,0,0,0.08)  [no DS page]
Layout: flex row, align-items center, gap 12px

Conteúdo (nas telas App):
- Ícone leading: Material Symbols Outlined 24px, color #8B6B5A
  - "menu" (abre drawer) — padrão
  - "arrow_back" (volta) — quando prop onBack é fornecido
- Título: 18px weight 400, Inter, color #3D2020, flex:1, textAlign center
- Spacer ou rightElement à direita (24px width para centralizar título)
```

### Role Badge (Tela de Usuários)

```
Shape: pill (borderRadius 10px)
Height: 15px
Padding: 0 8px
Font: 8px weight 400, Inter

Estilo (padrão dos filter chips):
- Background: cor do role com 12% opacidade (hex + '1F')
- Text: cor sólida do role

Cores por role:
- Admin:      bg #7B2D2D1F, text #7B2D2D
- Atendente:  bg #5B8BA81F, text #5B8BA8
- Preparador: bg #5A8C5A1F, text #5A8C5A
```

### Payment Method Button (Tela de Pagamento)

```
Height: 44px
Border-radius: 22px
Font: 14px weight 400, Inter

Estados:
- Não selecionado: bg #FFFFFF, border 1px #E8DDD5, text #3D2020
- Selecionado: bg #5A8C5A (verde sólido), sem border, text #FFFFFF

Ordem dos métodos: PIX, Cartão, Dinheiro

Estado "Já Pago":
- Exibe apenas o método usado com bg #5A8C5A1F (12% opacidade) e text #5A8C5A
- Mensagem "Pedido já foi pago" em verde centralizada abaixo
```

### Bottom Navigation

```
Background: #FFFFFF
Height: 56px
Shadow: 0 -1px 3px rgba(0,0,0,0.06)
Layout: flex row, justify-content space-around, align-items center

Cada item:
- Layout: flex column, gap 2px, align-items center
- Ícone: Material Symbols Outlined 22px weight 400
- Label: 10px Inter
- Ativo: cor primary (#1B5E20), label weight 600
- Inativo: cor #757575, label weight 400

Items: Pedidos | Novo | Cardápio | Resumo
Icons: receipt_long | add_circle | restaurant_menu | bar_chart
```

### Button

#### Filled (md — padrão)

```
Background: #1B5E20 (primary) | #1976D2 (preparando) | #388E3C (pronto) | #D32F2F (danger)
Color: #FFFFFF
Border: none
Border-radius: 20px
Height: 40px
Padding: 0 20px
Font: 14px weight 400, Inter
```

#### Filled (sm — in-card actions)

```
Background: mesmas cores por status
Color: #FFFFFF
Border: none
Border-radius: 18px
Height: 36px
Padding: 0 16px
Font: 12px weight 500, Inter
Align-self: flex-start (não full-width)
```

#### Filled (lg — main CTA)

```
Background: #1B5E20
Color: #FFFFFF
Border: none
Border-radius: 22px
Height: 44px
Padding: 0 20px
Font: 14px weight 500, Inter
```

#### Outlined

```
Background: transparent
Border: 1px solid (inner alignment)
Border-radius: 20px
Height: 40px
Padding: 0 20px
Font: 14px weight 400

Variantes de cor:
- Cancelar: border #757575, text #757575
- Desativar: border #1B5E20, text #1B5E20
- Sair: border #D32F2F, text #D32F2F
```

#### Text

```
Background: transparent
Border: none
Border-radius: 20px
Font: 14px weight 400, color #1B5E20
```

#### Disabled

```
Background: #E0E0E0
Color: #9E9E9E
Border: none
Border-radius: 20px
Height: 40px
Font: 14px weight 400
```

### Badge

#### Status (sólido)

| Status     | Background | Text Color |
| ---------- | ---------- | ---------- |
| Aguardando | `#F9A825`  | `#FFFFFF`  |
| Preparando | `#1976D2`  | `#FFFFFF`  |
| Pronto     | `#388E3C`  | `#FFFFFF`  |
| Entregue   | `#E0E0E0`  | `#616161`  |

```
Border-radius: 14px
Height: 28px
Padding: 0 12px
Font: 11px weight 400, Inter
Text: capitalizado (ex: "Aguardando", não "aguardando")
```

#### Status sm (usado em cards)

```
Border-radius: 11px
Height: 22px
Padding: 0 12px
Font: 10px weight 600, Inter
```

#### Tinted (informativo)

| Tipo       | Background | Text Color |
| ---------- | ---------- | ---------- |
| Pendente   | `#FFF3E0`  | `#E65100`  |
| Pago       | `#E8F5E9`  | `#1B5E20`  |
| Presencial | `#E3F2FD`  | `#1565C0`  |
| WhatsApp   | `#E8F5E9`  | `#2E7D32`  |

```
Mesmas dimensões do badge md (28px, 14px radius, 11px font, weight 400)
```

### Input (Pill)

```
Shape: Pill (border-radius 24px)
Height: 48px
Padding: 0 16px
Font: 14px weight 400, Inter
Leading icon: Material Symbols Outlined 20px, color #757575 (default) / #212121 (focus)

Label acima do campo:
- Font: 13px weight 600, color #212121
- Gap entre label e campo: 8px

Estados:
- Default: Background #F5F5F5, sem borda
- Focus: Background #FFFFFF, borda 1px solid #1B5E20 (inner)
- Error: Background #FFFFFF, borda 1px solid #E91E63 (inner) — nota: pink, não #D32F2F
- Disabled: Background #F5F5F5, opacity 0.5
```

### Card

```
Background: #FFFFFF (sempre branco, nunca tinted)
Border-radius: 12px
Padding: 16px (DS page) / 14px top-bottom + 16px left-right (nas telas)
Gap: 8px (flex column)
Border: 1px solid <status-color>, alignment inner

Variantes:
- Elevated (default): sem borda, shadow 0 2px 8px rgba(0,0,0,0.08)
- Aguardando: border #F9A825
- Preparando: border #1976D2
- Pronto: border #388E3C
```

#### Card de Pedido (composição nas telas)

```
Header row: flex row, justify-content space-between, align-items center
- Título: "#1 — Maria Silva", 16px weight 500
- Badge sm à direita

Corpo:
- Origem: "Presencial" ou "WhatsApp", 12px weight 400, color #757575
- Itens: "2x Pastel de Carne\n1x Caldo de Cana", 13px weight 400, color #212121
- Preço: "R$ 25,00" (sem prefixo "Total:"), 14px weight 600, color #212121
- Status pronto: "✓ Pronto para entrega", 12px weight 500, color #388E3C

Botão de ação (apenas aguardando e preparando):
- Size sm (36px, border-radius 18px, 12px weight 500)
- Aguardando: "Iniciar Preparo", bg #1B5E20
- Preparando: "Marcar Pronto", bg #1976D2
- Pronto: sem botão (apenas texto indicador)
```

### Modal / Dialog

```
Overlay: rgba(33,33,33,0.4)

Dialog:
- Background: #FFFFFF
- Border-radius: 16px
- Shadow: 0 8px 24px rgba(0,0,0,0.15)
- Padding: 24px
- Gap: 16px
- Layout: flex column

Título: 18px weight 400, color #212121
Body: 14px weight 400, color #757575

Action buttons:
- Height: 36px
- Border-radius: 18px
- Font: 13px weight 400
- Confirm: bg primary (#1B5E20) ou danger (#D32F2F), text white
- Cancel: bg transparent, text #757575, sem borda
- Actions row: gap 8px, justify-content flex-end
```

---

## Regras de Implementação

1. **Stroke sempre 1px** — Nunca usar 2px em bordas (stroke alignment: inner)
2. **Border-radius 20px** para todos os botões md (filled, outlined, disabled, text)
3. **Border-radius 24px** para inputs
4. **Border-radius 12px** para cards
5. **Border-radius 14px** para badges
6. **Sem background tinted nos cards** — Sempre fundo branco, apenas borda colorida
7. **Ícones via fonte Material Symbols Outlined** — weight 400
8. **Botão de ação por status**: aguardando → primary #1B5E20, preparando → azul #1976D2
9. **Inputs com label externo acima** — 13px weight 600, campo com placeholder + leading icon
10. **Font-family: "Inter"**
11. **Font-weight nos botões md: 400** — Não usar 500 nem 600
12. **Todos os botões md: 40px height, 20px radius, 14px font** — Consistentes
13. **Input error border cor é #E91E63** (pink), não #D32F2F (red)
14. **Badge text weight: 400** (md) — Sem text-transform uppercase
15. **Button sm: 12px weight 500** — Diferente do md (14px weight 400)

---

## Como Criar um Novo Tema

1. Crie um JSON com override parcial dos tokens:

```json
{
  "businessName": "Novo Food Truck",
  "colors": {
    "primary": "#E65100",
    "secondary": "#BF360C",
    "background": "#FFF8E1"
  }
}
```

2. Configure via variável de ambiente:
   - **Mobile:** `EXPO_PUBLIC_THEME_CONFIG='{"colors":{"primary":"#E65100"}}'`
   - **Web:** Injete via `window.__THEME_CONFIG__` no HTML ou use `VITE_THEME_CONFIG_PATH`

3. O sistema faz deep merge com o tema padrão — apenas os campos informados são sobrescritos.

---

## Referência de Arquivos

| Arquivo | Descrição |
| ------- | --------- |
| `packages/shared/src/types/theme.ts` | Interface `ThemeConfig` |
| `apps/mobile/src/theme/theme.config.ts` | Tema padrão mobile |
| `apps/web/src/theme/theme.config.ts` | Tema padrão web |
| `apps/*/src/theme/ThemeProvider.tsx` | Provider de contexto |
| `apps/*/src/components/` | Componentes que consomem tokens |
| `.kiro/steering/design-system-sync.md` | Spec técnica para agente (valores CSS exatos) |

---

## Changelog

| Data       | Alteração |
| ---------- | --------- |
| 2025-08-14 | Atualizado design dos badges de role na tela de usuários: fundo com 12% de opacidade + texto na cor do role (padrão dos filter chips). Botão de pagamento selecionado agora usa verde sólido (#5A8C5A) com texto branco. Ordem dos métodos de pagamento: PIX, Cartão, Dinheiro. Header com suporte a `onBack` (seta de volta). |
| 2025-08-11 | Atualizado com valores reais extraídos do Penpot via MCP. Adicionadas seções: AppBar, Bottom Navigation, Card de Pedido (composição), Regras de Implementação, Button sm/lg. Corrigidos valores que divergiam (badge sm weight, input error color, card padding nas telas). |
