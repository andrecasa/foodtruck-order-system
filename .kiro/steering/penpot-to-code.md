---
inclusion: manual
---

# Penpot → Code: Guia de Extração Pixel-Perfect

## Quando usar este guia

Sempre que precisar sincronizar um componente ou tela do Penpot com o código (mobile ou web).

## Paleta Atual (Pastel das Meninas)

```
primary:       #7B2D2D  (burgundy — botões, ícones ativos, AppBar icon)
secondary:     #D4812B  (amber — accent, aguardando, ribbon protótipo)
background:    #FDF8F4  (cream — fundo de tela)
surface:       #FFFFFF  (fundo de cards)
text:          #3D2020  (marrom escuro quente — texto principal)
textSecondary: #8B6B5A  (marrom claro — texto secundário, nav inativo)
divider:       #E8DDD5  (bege quente — separadores)
error:         #B54040  (vermelho muted)
aguardando:    #D4812B  (amber)
preparando:    #5B8BA8  (steel blue)
pronto:        #5A8C5A  (sage green)

Card strokes: 30% opacity (hex suffix '4D')
Card fills: gradient diagonal (transparent → 10% status color) + white base
Origin badges: Presencial (bg #F5EDE8, text #7B2D2D) | WhatsApp (bg #F0F5EE, text #5A8C5A)
```

## Princípio fundamental

**Nunca use `penpot.generateStyle()` para React Native.**  
Use extração de propriedades brutas via Penpot API e traduza manualmente para StyleSheet.

Para **web (React + CSS)**, `penpot.generateStyle()` funciona bem e pode ser usado quase diretamente.

---

## Fluxo de Extração

```
1. Localizar shape no Penpot (findShape por nome)
2. Extrair propriedades brutas (fills, strokes, shadows, flex, texts)
3. Traduzir para a plataforma alvo (RN StyleSheet ou CSS)
4. Aplicar no componente
5. Verificar build (tsc --noEmit)
```

---

## React Native — Tradução de Propriedades

### Container / Board → ViewStyle

| Penpot API | React Native StyleSheet |
|-----------|------------------------|
| `shape.fills[0].fillColor` | `backgroundColor: '#FFFFFF'` |
| `shape.borderRadius` | `borderRadius: 12` |
| `shape.strokes[0].strokeColor` | `borderColor: '#F9A825'` |
| `shape.strokes[0].strokeWidth` | `borderWidth: 1` |
| `shape.width` / `shape.height` | `width: 390` / `height: 56` |
| `shape.shadows[0]` | Ver tabela abaixo |
| `shape.flex.dir` | `flexDirection: 'row'` ou `'column'` |
| `shape.flex.rowGap` | `gap: 12` (RN ≥ 0.71) ou `rowGap: 12` |
| `shape.flex.columnGap` | `columnGap: 12` |
| `shape.flex.alignItems` | `alignItems: 'center'` |
| `shape.flex.justifyContent` | `justifyContent: 'space-between'` |
| `shape.flex.topPadding` | `paddingTop: 16` |
| `shape.flex.bottomPadding` | `paddingBottom: 16` |
| `shape.flex.leftPadding` | `paddingLeft: 16` |
| `shape.flex.rightPadding` | `paddingRight: 16` |

### Shadow → RN boxShadow

```javascript
// Penpot:
shape.shadows[0] = {
  offsetX: 0, offsetY: -1, blur: 3, spread: 0,
  color: { color: "#000000", opacity: 0.06 }
}

// React Native (boxShadow — the shadow* props are deprecated):
boxShadow: '0px -1px 3px 0px rgba(0, 0, 0, 0.06)',
elevation: 2,       // Android fallback
```

### Text → TextStyle

| Penpot API | React Native |
|-----------|-------------|
| `text.fontSize` (string) | `fontSize: parseInt(text.fontSize)` |
| `text.fontWeight` (string) | `fontWeight: '400'` |
| `text.fontFamily` | `fontFamily: 'Inter'` |
| `text.fills[0].fillColor` | `color: '#212121'` |

### Stroke (border) — Inner Alignment

O Penpot usa `strokeAlignment: "inner"`. Em React Native, `borderWidth` é sempre inner por padrão, então basta:

```typescript
borderWidth: shape.strokes[0].strokeWidth,  // sempre 1
borderColor: shape.strokes[0].strokeColor,
```

### Layout Child Sizing

| Penpot `layoutChild.horizontalSizing` | React Native |
|---------------------------------------|-------------|
| `"fix"` | width: valor fixo |
| `"fill"` | `flex: 1` ou `alignSelf: 'stretch'` |
| `"auto"` | omitir width (auto) |

---

## Web (React + CSS) — Tradução de Propriedades

### Opção 1: generateStyle() (recomendado para web)

```javascript
const css = penpot.generateStyle([shape], { 
  type: "css", 
  withChildren: true 
});
// Usar quase diretamente — ajustar nomes de classes
```

### Opção 2: Extração manual (para CSS-in-JS / Tailwind)

| Penpot API | CSS |
|-----------|-----|
| `shape.fills[0].fillColor` | `background: #FFFFFF` |
| `shape.borderRadius` | `border-radius: 12px` |
| `shape.strokes[0]` | `border: 1px solid #F9A825` |
| `shape.shadows[0]` | `box-shadow: 0px -1px 3px 0px rgba(0,0,0,0.06)` |
| `shape.flex.*` | `display: flex; flex-direction: row; gap: 12px;` |
| `text.fontSize` | `font-size: 14px` |
| `text.fontWeight` | `font-weight: 400` |
| `text.fontFamily` | `font-family: "Inter", sans-serif` |
| `text.fills[0].fillColor` | `color: #212121` |

### Shadow → CSS box-shadow

```javascript
// Penpot:
{ offsetX: 0, offsetY: 2, blur: 8, spread: 0, color: { color: "#000000", opacity: 0.08 } }

// CSS:
box-shadow: 0px 2px 8px 0px rgba(0, 0, 0, 0.08);
```

---

## Código de Extração (copiar e adaptar)

### Template para extrair um componente completo

```javascript
// 1. Navegar para a página correta
const page = penpotUtils.getPageByName("App"); // ou "Web", "Design System"
penpot.openPage(page);

// 2. Encontrar o componente
const component = penpotUtils.findShape(
  s => s.name === "NOME_DO_COMPONENTE" && s.type === "board",
  page.root
);

// 3. Extrair container
const container = {
  width: component.width,
  height: component.height,
  fills: component.fills,
  strokes: component.strokes,
  shadows: component.shadows,
  borderRadius: component.borderRadius,
  flex: component.flex ? {
    dir: component.flex.dir,
    rowGap: component.flex.rowGap,
    columnGap: component.flex.columnGap,
    alignItems: component.flex.alignItems,
    justifyContent: component.flex.justifyContent,
    topPadding: component.flex.topPadding,
    bottomPadding: component.flex.bottomPadding,
    leftPadding: component.flex.leftPadding,
    rightPadding: component.flex.rightPadding,
  } : null,
};

// 4. Extrair textos filhos
const texts = penpotUtils.findShapes(s => s.type === "text", component);
const textInfo = texts.map(t => ({
  characters: t.characters,
  fontSize: t.fontSize,
  fontWeight: t.fontWeight,
  fontFamily: t.fontFamily,
  color: t.fills?.[0]?.fillColor,
}));

return { container, texts: textInfo };
```

---

## Ícones (Material Symbols Outlined)

No Penpot, ícones são renderizados como `Text` com `fontFamily: "Material Symbols Outlined"`.

### Identificação
```javascript
const isIcon = (text) => text.fontFamily === "Material Symbols Outlined";
// text.characters contém o nome do ícone: "receipt_long", "add_circle", etc.
```

### React Native (web)
```tsx
<Text style={{ fontFamily: 'Material Symbols Outlined', fontSize: 22 }}>
  receipt_long
</Text>
```

### Web (CSS)
```html
<span class="material-symbols-outlined" style="font-size: 22px">
  receipt_long
</span>
```

---

## Checklist de Sincronização

Ao sincronizar um componente do Penpot → código:

- [ ] Extrair fills (backgroundColor)
- [ ] Extrair strokes (border: width, color, alignment)
- [ ] Extrair shadows (shadow props / box-shadow)
- [ ] Extrair borderRadius
- [ ] Extrair flex layout (direction, gap, padding, align, justify)
- [ ] Extrair dimensões (width, height — fixas vs auto)
- [ ] Extrair tipografia de cada texto (font, size, weight, color)
- [ ] Identificar ícones (Material Symbols font)
- [ ] Verificar se há children boards e repetir o processo
- [ ] Compilar (`tsc --noEmit`)
- [ ] Comparar visualmente com export do Penpot (`export_shape`)

---

## Armadilhas Comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| Texto aparece como "receipt_long" | Font Material Symbols não carregada | Carregar via Google Fonts stylesheet (web) |
| Fonte não aplica | `fontFamily` no código difere do registrado | Usar exatamente o nome registrado em `useFonts` |
| Página em branco | `useFonts` falha (TTF inválido) | Não carregar TTFs de URLs aleatórias; usar Google Fonts |
| Sombra não aparece (Android) | Falta `elevation` | Adicionar `elevation: N` junto com boxShadow |
| Border não inner | RN border é inner por padrão | Apenas setar borderWidth + borderColor |
| Gap não funciona | RN < 0.71 | Usar marginBottom nos children como fallback |
| `generateStyle()` gera CSS inútil para RN | É para web | Usar extração manual de propriedades |
| Badge texto cor errada | Cálculo dinâmico de contraste | Status badges usam cor do status (tinted 12% bg + status color text) |
| Badge texto peso errado | Diferente por tamanho | SEMPRE 400 para todos os tamanhos |
| Botão não centralizado | alignSelf no componente | Button usa `alignSelf: 'center'` por padrão |
| Botão cor errada por status | Mapeamento incorreto | aguardando → primary (#7B2D2D), preparando → preparando (#5B8BA8) |

---

## Specs Definitivos por Componente (Fonte: Penpot)

### Badge (Status — sm, usado em cards)
```
height: 22px
borderRadius: 11px
paddingHorizontal: 12px
fontSize: 10
fontWeight: '400'  ← NUNCA 500 ou 600
textColor: <statusColor>  ← cor do status (tinted style)
backgrounds: aguardando=#D4812B@12%, preparando=#5B8BA8@12%, pronto=#5A8C5A@12%
pattern: mesmo dos FilterChips — backgroundColor com 12% opacity, texto na cor do status
```

### Badge (Status — md)
```
height: 28px
borderRadius: 14px
paddingHorizontal: 12px
fontSize: 11
fontWeight: '400'
textColor: <statusColor>  ← cor do status (tinted style)
backgrounds: mesma cor do status com 12% opacity
```

### Badge (Tinted — pago, pendente)
```
pago: bg=#F0F5EE, text=#7B2D2D
pendente: bg=#FDF5EA, text=#D4812B
```

### Badge (Origem)
```
Presencial: bg=#F5EDE8, text=#7B2D2D
WhatsApp: bg=#F0F5EE, text=#5A8C5A
height: 22px, borderRadius: 11px, fontSize: 10, fontWeight: '500'
horizontalSizing: fill (stretches to full card width, text centered)
```

### Button (sm — in-card actions)
```
height: 36px
borderRadius: 18px
paddingHorizontal: 16px
fontSize: 12
fontWeight: '400'  ← NUNCA 500
textColor: '#FFFFFF'
alignSelf: 'center'  ← SEMPRE centralizado no card
backgrounds:
  - aguardando: #7B2D2D (primary, NÃO a cor do status)
  - preparando: #5B8BA8 (cor do status)
  - pronto: #5A8C5A (cor do status)
```

### FilterChips (Status Filter — fila de pedidos)
```
container:
  flexDirection: row
  gap: 8px
  horizontalSizing: fill (stretch to content width)

chip (active/selected):
  height: 32px
  borderRadius: 16px
  paddingHorizontal: 12px
  backgroundColor: <statusColor> + opacity 0.12 (12%)
  borderWidth: 0
  fontSize: 12
  fontWeight: '400'
  textColor: <statusColor>

chip (inactive):
  height: 32px
  borderRadius: 16px
  paddingHorizontal: 12px
  backgroundColor: #FFFFFF
  borderWidth: 1px
  borderColor: #E8DDD5
  fontSize: 12
  fontWeight: '400'
  textColor: <statusColor>

status colors:
  - aguardando: #D4812B
  - preparando: #5B8BA8
  - pronto: #5A8C5A
  - entregue: #8B6B5A

default state: aguardando, preparando, pronto = active; entregue = inactive
```

### Button (md — padrão)
```
height: 40px
borderRadius: 20px
paddingHorizontal: 20px
fontSize: 14
fontWeight: '400'
```

### Card (Order)
```
backgroundColor: #FFFFFF + gradient overlay (LinearGradient transparent→10% status)
borderRadius: 12px
borderWidth: 1px
borderColor: <statusColor> + '4D' (30% opacity)
paddingVertical: 16px
paddingHorizontal: 16px
gap: 12px
```

### AppBar
```
height: 56px
backgroundColor: #FFFFFF
paddingHorizontal: 16px
gap: 12px
shadow: 0 1px 3px rgba(0,0,0,0.06)
layout: flexDirection row, alignItems center, justifyContent flex-start
elements (left → right):
  - Menu icon: Material Symbols "menu" 24px, color #8B6B5A (textSecondary), onPress opens Drawer
  - Title: 18px, weight 400, color #3D2020 (text), flex:1, textAlign:center
  - Spacer: invisible View width 24px (matches menu icon width for symmetric centering)
NOTE: No logout icon in AppBar — logout lives exclusively in the Drawer Menu.
```

### Drawer Menu
```
fullScreen: true (Modal)
backgroundColor: #F5F0EB

Drawer Header:
  height: 56px
  backgroundColor: #FFFFFF
  shadow: 0 1px 3px rgba(0,0,0,0.06)
  paddingHorizontal: 16px, gap: 12px, alignItems: center
  - Close icon: Material Symbols "close" 24px, color #8B6B5A
  - Title: "Menu" Inter 18px weight 500, color #3D2020, textAlign center, flex:1
  - Spacer: invisible element for symmetry

Menu Items:
  paddingTop: 16px
  Each item:
    height: 52px
    paddingHorizontal: 24px
    gap: 16px
    flexDirection: row, alignItems: center
    - Icon: Material Symbols 22px, color #7B2D2D (primary)
    - Label: Inter 16px weight 400, color #3D2020

  Items: Pedidos, Novo Pedido, Cardápio, Resumo do Dia, Configurações

Divider:
  height: 1px
  backgroundColor: #E0D6CC
  marginHorizontal: 24px
  marginVertical: 16px

Sair:
  Same layout as menu item
  Icon + Label color: #D32F2F (red)
```

### Payment Method Button (Tela Pagamento)
```
container:
  flexDirection: column
  gap: 20px

method button (unselected):
  height: 44px
  borderRadius: 22px
  backgroundColor: #FFFFFF
  borderWidth: 1px
  borderColor: #E8DDD5
  fontSize: 14
  fontWeight: '400'
  textColor: #3D2020 (text)
  alignItems: center, justifyContent: center
  horizontalSizing: fill (full width)

method button (selected):
  height: 44px
  borderRadius: 22px
  backgroundColor: #7B2D2D + opacity 0.12 (12%)  ← mesmo padrão dos FilterChips
  borderWidth: 0
  fontSize: 14
  fontWeight: '400'
  textColor: #7B2D2D (primary)
  alignItems: center, justifyContent: center
  horizontalSizing: fill (full width)

confirm button:
  height: 44px
  borderRadius: 22px
  backgroundColor: #7B2D2D (primary, sólido)
  fontSize: 14
  fontWeight: '400'
  textColor: #FFFFFF
  alignSelf: stretch (full width)
```

### Bottom Nav
```
height: 56px
backgroundColor: #FFFFFF
shadow: 0 -1px 3px rgba(0,0,0,0.06)
justifyContent: space-around
icon: Material Symbols Outlined 22px
label: 10px, weight 400
active: color #7B2D2D (primary)
inactive: color #8B6B5A (textSecondary)
```
