---
inclusion: manual
---

# Skill: Penpot Design System Sync

## Quando usar
Acione este skill quando precisar sincronizar os componentes com o design Penpot.

## Procedimento

### 1. Conectar ao Penpot
- Usar o MCP Penpot (já configurado em `~/.kiro/settings/mcp.json`)
- Navegar para a página "Design System" via `penpotUtils.getPageByName("Design System")`

### 2. Extrair estilos de cada seção
Para cada seção do Design System, extrair CSS com:
```js
const section = penpotUtils.findShape(s => s.name === "<nome da seção>", dsPage.root);
penpot.generateStyle(section.children, { type: "css", withChildren: true, includeChildren: true });
```

Seções disponíveis:
- `01 — Colors`
- `02 — Typography`
- `03 — Icons (Material)`
- `04 — Buttons` → `Filled Buttons`, `Outlined Buttons`
- `05 — Badges & Chips` → `Status Badges`, `Filter Chips`
- `06 — Inputs & Controls` → `Input / Default`, `Input / Focus`, `Input / Error`, `Stepper`
- `07 — Cards` → `Card Variants`
- `08 — Spacing & Elevation`
- `09 — Navigation` → `AppBar`, `Bottom Navigation`
- `10 — Modal & Dialogs` → `Dialog / Confirm`, `Dialog / Danger`

### 3. Comparar com componentes atuais
Arquivos a verificar:
- `apps/web/src/components/Button.tsx`
- `apps/web/src/components/Badge.tsx`
- `apps/web/src/components/Card.tsx`
- `apps/web/src/components/Input.tsx`
- `apps/web/src/components/Modal.tsx`
- `apps/web/src/components/Layout.tsx` (Header)
- `apps/mobile/src/components/` (espelhar web)

### 4. Atualizar código divergente
Aplicar os valores extraídos do Penpot. Referência: #[[.kiro/steering/design-system-sync.md]]

### 5. Atualizar steering file
Se novos tokens foram descobertos, atualizar `.kiro/steering/design-system-sync.md`.

### 6. Verificar compilação
```bash
pnpm --filter @order-system/web exec tsc --noEmit
pnpm --filter @order-system/mobile exec tsc --noEmit
```

## Regras Críticas (não violar)
- Font-family: "Inter Tight" (não "Inter")
- Todos os botões: 20px radius, 40px height, 14px font, weight 400
- Cards: bg #FFFFFF, border 1px, radius 12px, gap 8px, sem tinted bg
- Input error: #E91E63 (pink), não #D32F2F
- Badges: weight 400, sem uppercase
- Modal buttons: 36px height, 18px radius, 13px font
