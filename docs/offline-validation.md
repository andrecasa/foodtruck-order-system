# Validação de Funcionamento Offline

> **Requisito 14.4**: O sistema SHALL funcionar sem acesso à internet durante a operação normal, exceto pela integração com WhatsApp (Evolution API), que requer conectividade de saída apenas para o servidor do WhatsApp.

## Resultado da Validação

| Critério | Status | Observação |
|----------|--------|------------|
| Docker network local | ✅ OK | Todos os serviços usam `order-system-network` (driver: bridge) |
| PostgreSQL | ✅ OK | Container local, sem dependências externas |
| GoTrue (Auth) | ✅ OK | Conecta apenas ao DB local, sem OAuth externo configurado |
| Realtime | ✅ OK | Conecta apenas ao DB local |
| Kong (API Gateway) | ✅ OK | Rotas apenas para serviços internos (auth:9999, realtime:4000) |
| Backend | ✅ OK | Conecta ao DB, Kong e Evolution API (todos internos na rede Docker) |
| Evolution API | ✅ OK | Único serviço que requer internet (protocolo WhatsApp) |
| Backend fetch calls | ✅ OK | Único `fetch()` externo é para `EVOLUTION_API_URL` |
| Frontend web (API) | ✅ OK | Conecta apenas a `localhost:4000` (via Vite proxy) |
| Frontend mobile (API) | ✅ OK | Conecta a `localhost:4000` / `localhost:8000` |
| Kong config (kong.yml) | ✅ OK | Declara apenas upstreams internos |

## ⚠️ Ressalvas Encontradas

### Google Fonts CDN (não-crítico)

Os seguintes arquivos referenciam o Google Fonts CDN para carregar fontes Inter e Material Symbols Outlined:

1. **`apps/web/index.html`** (linhas 7-9):
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Material+Symbols+Outlined..." rel="stylesheet" />
   ```

2. **`apps/mobile/app/_layout.tsx`** (linha 41, apenas no modo web):
   ```typescript
   link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined...';
   ```

**Impacto**: Sem internet, as fontes do Google não serão carregadas no primeiro acesso. Porém:
- O navegador usará o fallback CSS (`-apple-system, BlinkMacSystemFont, sans-serif`)
- Após o primeiro carregamento com internet, as fontes ficam em cache do navegador
- O app mobile nativo (não-web) usa `@expo-google-fonts/inter` empacotado localmente
- Os ícones Material Symbols podem não renderizar sem cache prévio

**Classificação**: Cosmético, não-funcional. O sistema continua operável — apenas a tipografia e ícones podem degradar visualmente sem internet.

**Mitigação sugerida** (futura, fora do escopo MVP):
- Empacotar fontes Inter e Material Symbols como arquivos locais no build
- Usar `@fontsource/inter` ou similar para bundling local

## Conclusão

✅ **A arquitetura atende ao Requisito 14.4**. Todos os serviços do sistema (DB, Auth, Realtime, API Gateway, Backend) comunicam-se exclusivamente pela rede Docker interna. O único serviço que requer conectividade externa é o Evolution API (WhatsApp), conforme especificado.

A ressalva sobre Google Fonts é cosmética e não impede a operação do sistema.

---

*Validação realizada em: análise estática de `docker-compose.yml`, `kong.yml`, código-fonte do backend, e configuração dos apps frontend.*
