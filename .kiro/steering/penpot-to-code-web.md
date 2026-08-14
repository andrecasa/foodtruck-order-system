---
inclusion: manual
---

# Penpot → Code (Web): Guia de Extração Pixel-Perfect

## Quando usar este guia

Sempre que precisar sincronizar um componente ou tela do Penpot com o código web (React + CSS-in-JS inline styles).

## Paleta Atual (Pastel das Meninas)

```
primary:       #7B2D2D  (burgundy — botões, ícones ativos, header icon)
secondary:     #D4812B  (amber — accent, aguardando, ribbon protótipo)
background:    #FDF8F4  (cream — fundo de tela)
surface:       #FFFFFF  (fundo de cards e forms)
text:          #3D2020  (marrom escuro quente — texto principal)
textSecondary: #8B6B5A  (marrom claro — texto secundário, logout, placeholders)
divider:       #E8DDD5  (bege quente — separadores, borders inativos)
error:         #B54040  (vermelho muted)
aguardando:    #D4812B  (amber)
preparando:    #5B8BA8  (steel blue)
pronto:        #5A8C5A  (sage green)
entregue:      #8B6B5A  (textSecondary)

Card strokes: 30% opacity (strokeOpacity: 0.3)
Card fills: gradient linear diagonal (white@0% → statusColor@10%) + white base
Origin badges: Presencial (bg #F5EDE8, text #7B2D2D) | WhatsApp (bg #F0F5EE, text #5A8C5A)
```

## Princípio fundamental

Para web, `penpot.generateStyle()` pode ser usado como referência, mas o código final usa **React.CSSProperties** inline. Traduzir propriedades do Penpot diretamente para CSS.

---

## Fluxo de Extração

```
1. Localizar shape no Penpot (findShape por nome)
2. Extrair propriedades brutas (fills, strokes, shadows, flex, texts)
3. Traduzir para React.CSSProperties
4. Aplicar no componente
5. Verificar build (tsc --noEmit)
```

---

## Tradução Penpot → CSS-in-JS

### Container / Board → React.CSSProperties

| Penpot API | CSS-in-JS |
|-----------|-----------|
| `shape.fills[0].fillColor` | `background: '#FFFFFF'` |
| `shape.fills[0].fillOpacity: 0.12` | `background: 'rgba(R,G,B,0.12)'` ou `color + '1F'` |
| `shape.borderRadius` | `borderRadius: '12px'` |
| `shape.strokes[0].strokeColor` | `border: '1px solid #E8DDD5'` |
| `shape.strokes[0].strokeOpacity` | `border: '1px solid rgba(R,G,B,opacity)'` |
| `shape.shadows[0]` | `boxShadow: '0px 4px 16px rgba(0,0,0,0.08)'` |
| `shape.flex.dir` | `flexDirection: 'row'` ou `'column'` |
| `shape.flex.rowGap` | `gap: '12px'` (ou rowGap) |
| `shape.flex.columnGap` | `gap: '8px'` (ou columnGap) |
| `shape.flex.alignItems` | `alignItems: 'center'` |
| `shape.flex.justifyContent` | `justifyContent: 'space-between'` |
| `shape.flex.topPadding` + etc | `padding: '24px'` ou individual |
| `shape.width` / `shape.height` | `width: '380px'` / `height: '56px'` |

### Gradient Fill (Card status overlay)

```javascript
// Penpot: linear gradient diagonal, white@0% → statusColor@10%
// CSS:
background: 'linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(212,129,43,0.1) 100%), #FFFFFF',
```

### Shadow → box-shadow

```javascript
// Penpot: { offsetX: 0, offsetY: 4, blur: 16, spread: 0, color: { color: "#000000", opacity: 0.08 } }
// CSS:
boxShadow: '0px 4px 16px 0px rgba(0, 0, 0, 0.08)',
```

### Text → CSS

| Penpot API | CSS-in-JS |
|-----------|-----------|
| `text.fontSize` | `fontSize: '14px'` |
| `text.fontWeight` | `fontWeight: 400` |
| `text.fontFamily` | `fontFamily: '"Inter", -apple-system, sans-serif'` |
| `text.fills[0].fillColor` | `color: '#3D2020'` |

### Ícones (Material Symbols Outlined)

```html
<span class="material-symbols-outlined" style={{ fontSize: '24px', color: '#7B2D2D' }}>
  receipt_long
</span>
```

Certifique-se de carregar a fonte via Google Fonts no `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
```

---

## Specs Definitivos por Componente (Fonte: Penpot — Página "Web")

### Tela Login Preparador

```
Screen:
  width: 1280px (full width)
  height: 100vh
  backgroundColor: #FDF8F4
  display: flex, flexDirection: column, alignItems: center, justifyContent: center
  gap: 20px

Header Section (acima do form):
  - Icon: Material Symbols "restaurant" 48px, color #7B2D2D
  - Title: "Pastel das Meninas" Inter 28px weight 400, color #3D2020
  - Subtitle: "Tela do Preparador" Inter 14px weight 400, color #8B6B5A

Login Form:
  width: 400px
  backgroundColor: #FFFFFF
  borderRadius: 16px
  boxShadow: 0px 4px 16px rgba(0, 0, 0, 0.08)
  padding: 32px
  display: flex, flexDirection: column, gap: 16px

Input (email/password):
  height: 52px
  backgroundColor: #FFFFFF
  border: 1px solid #E8DDD5 (divider) — default
  border: 1px solid #7B2D2D (primary) — focus
  border: 1px solid #B54040 (error) — error state
  borderRadius: 24px (pill)
  padding: 0 16px
  display: flex, flexDirection: row, alignItems: center, gap: 10px
  transition: border-color 0.15s ease
  - Icon: Material Symbols 20px, color #8B6B5A (mail / lock)
  - Placeholder text: Inter 14px weight 400, color #8B6B5A
  - Input text: Inter 14px weight 400, color #3D2020
  - Password toggle: Material Symbols "visibility" / "visibility_off" 20px, color #8B6B5A
    (button transparente no trailing, sem border/bg)

Login Button:
  width: 100% (fill)
  height: 44px
  borderRadius: 22px (pill)
  backgroundColor: #7B2D2D (primary)
  border: none
  text: "Entrar" Inter 14px weight 400, color #FFFFFF
  display: flex, alignItems: center, justifyContent: center
  cursor: pointer
  disabled: backgroundColor #E8DDD5, color #9E9E9E
```

### Header (Fila do Preparador)

```
height: 56px
backgroundColor: #FFFFFF
boxShadow: 0px 1px 3px rgba(0, 0, 0, 0.06)
padding: 0 24px
display: flex, flexDirection: row, alignItems: center, justifyContent: space-between

Left section (row, gap: 12px):
  - Icon: Material Symbols "receipt_long" 24px, color #7B2D2D (primary)
  - Title: Inter 18px weight 400, color #3D2020

Right section — Logout Button:
  height: 36px
  borderRadius: 18px
  backgroundColor: transparent (no fill)
  border: 1px solid #E8DDD5
  padding: 0 12px (implícito pelo gap)
  display: flex, flexDirection: row, gap: 6px, alignItems: center, justifyContent: center
  - Icon: Material Symbols "logout" 16px, color #8B6B5A
  - Text: "Sair" Inter 12px weight 400, color #8B6B5A
  cursor: pointer

NOTE: Na web, logout fica no Header (diferente do mobile onde fica no Drawer).
```

### FilterChips (Status Filter)

```
container:
  display: flex, flexDirection: row, gap: 8px, flexWrap: wrap

chip (active/selected):
  height: 32px
  borderRadius: 16px
  padding: 0 12px
  backgroundColor: <statusColor> opacity 12% (fillOpacity: 0.12)
  border: none
  fontSize: 12px
  fontWeight: 400
  color: <statusColor>
  cursor: pointer
  display: inline-flex, alignItems: center, justifyContent: center

chip (inactive):
  height: 32px
  borderRadius: 16px
  padding: 0 12px
  backgroundColor: #FFFFFF
  border: 1px solid #E8DDD5
  fontSize: 12px
  fontWeight: 400
  color: <statusColor>
  cursor: pointer

status colors:
  - aguardando: #D4812B
  - preparando: #5B8BA8
  - pronto: #5A8C5A
  - entregue: #8B6B5A

default: aguardando, preparando, pronto = active; entregue = inactive
```

### Card (Order — Pedido)

```
width: 380px
borderRadius: 12px
border: 1px solid <statusColor> at 30% opacity
background: linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(<statusRGB>,0.1) 100%), #FFFFFF
padding: 16px
display: flex, flexDirection: column, gap: 12px

Card Header Row:
  display: flex, flexDirection: row, alignItems: center, justifyContent: space-between
  width: 100% (fill = 348px inner)
  - Title: Inter 16px weight 400, color #3D2020
  - Badge (ver Badge specs abaixo)

Origin Badge:
  horizontalSizing: fill (width: 100% of card inner)
  height: 22px
  borderRadius: 11px
  display: flex, alignItems: center, justifyContent: center
  - Presencial: backgroundColor #F5EDE8, text Inter 10px weight 500 color #7B2D2D
  - WhatsApp: backgroundColor #F0F5EE, text Inter 10px weight 500 color #5A8C5A

Items Text:
  Inter 13px weight 400, color #3D2020
  whiteSpace: pre-line (multiline: "2x Pastel\n1x Caldo")
  lineHeight: 1.5

Price:
  Inter 18px weight 600, color #3D2020

Action Button:
  height: 36px
  borderRadius: 18px
  padding: 0 16px
  fontSize: 12px, fontWeight: 400, color #FFFFFF
  display: inline-flex, alignItems: center, justifyContent: center
  horizontalSizing: auto (width adapts to content)
  backgrounds:
    - aguardando: #7B2D2D (primary)
    - preparando: #5B8BA8
    - pronto: #5A8C5A
  alignSelf: center (centralizado no card)
```

### Badge (Status — sm)

```
height: 22px
borderRadius: 11px
padding: 0 12px
display: inline-flex, alignItems: center, justifyContent: center
backgroundColor: <statusColor> at 12% opacity
fontSize: 10px
fontWeight: 400
color: <statusColor>
```

### Cards Grid Layout

```
container (Orders Grid):
  padding: 24px
  display: flex, flexDirection: column, gap: 20px

Cards Row:
  display: flex, flexDirection: row, gap: 20px, flexWrap: wrap
```

### Button (md — padrão web)

```
height: 40px
borderRadius: 20px
padding: 0 20px
fontSize: 14px
fontWeight: 400
color: #FFFFFF
backgroundColor: #7B2D2D (primary)
border: none
cursor: pointer
display: inline-flex, alignItems: center, justifyContent: center, gap: 6px
transition: opacity 0.15s ease

Variantes:
  - primary: bg #7B2D2D, text #FFFFFF
  - secondary: bg #D4812B, text #FFFFFF
  - outline: bg transparent, border 1px solid #8B6B5A, text #8B6B5A
  - danger: bg #B54040, text #FFFFFF
  - disabled: bg #E8DDD5, text #9E9E9E, cursor not-allowed

Custom color (status buttons):
  - backgroundColor pode ser override via prop "color"
```

---

## Checklist de Sincronização (Web)

Ao sincronizar um componente do Penpot → código web:

- [ ] Extrair fills (background / background-color)
- [ ] Extrair gradients (linear-gradient CSS)
- [ ] Extrair strokes (border: width + style + color + opacity)
- [ ] Extrair shadows (box-shadow)
- [ ] Extrair borderRadius
- [ ] Extrair flex layout (display:flex, direction, gap, padding, align, justify)
- [ ] Extrair dimensões (width, height — fixas vs auto vs 100%)
- [ ] Extrair tipografia (font-family, font-size, font-weight, color)
- [ ] Identificar ícones (Material Symbols Outlined span com className)
- [ ] Usar tokens do ThemeProvider (`useTheme()`) onde possível
- [ ] Compilar (`tsc --noEmit`)
- [ ] Comparar visualmente com export do Penpot

---

## Armadilhas Comuns (Web)

| Problema | Causa | Solução |
|----------|-------|---------|
| Ícone não renderiza | Font Material Symbols não carregada | Adicionar `<link>` Google Fonts no index.html |
| Badge cor com hex+suffix (ex: `#D4812B1F`) | Opacity via hex alpha | Preferir `rgba()` para clareza |
| Card sem gradiente | Esqueceu `background` com 2 layers | Usar `linear-gradient(...), #FFFFFF` |
| Border sumiu no chip ativo | `border: 'none'` remove espaço | Usar `border: '1px solid transparent'` quando trocar |
| Chip não alinha verticalmente | Height fixa sem flex center | Adicionar `display: inline-flex, alignItems: center` |
| Header icon errado | Cor do ícone diferente | Web usa `#7B2D2D` (primary), Mobile usa `#8B6B5A` (textSecondary) |
| Logout no lugar errado | Mobile = Drawer, Web = Header | Consistente com o Penpot de cada plataforma |
| fontWeight como string | React CSS espera number | Usar `fontWeight: 400` (number), não `'400'` |
| Button radius errado | Login button = 22px, md button = 20px | Login CTA é `lg` (h44, r22), buttons normais são `md` (h40, r20) |

---

## Diferenças Mobile vs Web (por design no Penpot)

| Aspecto | Mobile (App page) | Web (Web page) |
|---------|-------------------|----------------|
| **Header icon color** | #8B6B5A (textSecondary) | #7B2D2D (primary) |
| **Header title weight** | 400 | 400 ✅ |
| **Header padding** | 16px | 24px |
| **Header justify** | flex-start (menu + title + spacer) | space-between (left group + logout) |
| **Logout location** | Drawer Menu | Header (button outline) |
| **Navigation** | BottomNav + Drawer | Sem nav (single page) |
| **Card width** | full (flex fill) | 380px fixo |
| **Cards layout** | column (vertical scroll) | row wrap (grid horizontal) |
| **Content padding** | 16px | 24px |
| **Input borderRadius** | 24px (pill) | 24px (pill) ✅ |
| **Input style** | bg white + border #E8DDD5, focus #7B2D2D | bg white + border #E8DDD5, focus #7B2D2D ✅ |
