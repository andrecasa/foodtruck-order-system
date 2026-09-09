# @order-system/mobile

App Expo/React Native do order-system. Roda em nativo (Android/iOS) e como
**PWA** via `react-native-web`.

## Comandos

```bash
pnpm --filter @order-system/mobile start       # Expo dev server
pnpm --filter @order-system/mobile web         # roda como web
pnpm --filter @order-system/mobile pwa         # export estático (PWA)
pnpm --filter @order-system/mobile typecheck   # tsc --noEmit
pnpm --filter @order-system/mobile test        # Jest
pnpm --filter @order-system/mobile lint        # ESLint (config na raiz)
```

## Mapa do Resumo do Dia (`DailyOrdersMap`)

A tela "Resumo do Dia" (`src/screens/DailySummaryScreen.tsx`) exibe, como
primeiro item, um mapa com um pin por pedido do dia que possui geolocalização
(`latitude`/`longitude`). Os dados vêm de `apiClient.getOrders({ date })` — o
mesmo endpoint já existente (`GET /api/orders`) que carrega as coordenadas
capturadas ao confirmar o pedido. Não há mudança de backend nem de
`@order-system/shared` para essa funcionalidade.

### Decisões

- **OpenStreetMap (OSM), não Google Maps.** Sem API key, sem billing e sem
  cartão de crédito. A atribuição obrigatória ("© OpenStreetMap contributors")
  é exibida nos tiles, conforme a
  [política de uso do OSM](https://operations.osmfoundation.org/policies/tiles/).
- **CSS do Leaflet via CDN, não `import`.** O CSS do Leaflet **não** é
  importado no componente (`import 'leaflet/dist/leaflet.css'`): o Metro (bundler
  do Expo web) não resolve os `url(images/...)` internos desse CSS e quebra o
  bundle. Em vez disso, a folha de estilo é carregada por `<link>` (CDN unpkg,
  versão fixada + SRI) no `<head>` de `public/index.html`, que também serve os
  assets relativos. Consequência: a estilização do mapa depende de rede — ok
  para uma tela administrativa que já exige backend online.
- **Base de mapa configurável num único lugar.** A URL e a atribuição dos tiles
  ficam em `src/components/map-tiles.ts` (`MAP_TILE` + `TILE_PRESETS`), usadas por
  todos os mapas (pins do dia e heatmap do mês, web e nativo). Para trocar a base
  do app inteiro, muda-se só qual preset `MAP_TILE` aponta. Presets prontos
  (todos gratuitos e sem API key): `osm`, `osmGrayscale` (atual — OSM dessaturado
  via CSS, bom contraste para o heatmap), `cartoPositron`/`cartoPositronNoLabels`
  (base clara para dados) e `cartoDarkMatter` (base escura). Bases coloridas podem
  ativar `grayscale: true` para dessaturar só os tiles (o heatmap continua colorido).
- **Duas plataformas, mesma stack visual (Leaflet + OSM).**
  - **Web/PWA:** `react-leaflet` + `leaflet` renderizam direto no DOM.
  - **Nativo (Android/iOS):** como não há DOM, o mapa roda dentro de um
    `WebView` (`react-native-webview`) que carrega o Leaflet do CDN e plota os
    mesmos pins. Assim a aparência e o comportamento ficam consistentes entre as
    plataformas, sem depender de `react-native-maps` nem de API key. O `WebView`
    roda em Expo Go e em builds nativos, sem configuração nativa extra.

### Arquitetura do componente (`src/components/`)

O componente usa a resolução por plataforma do Metro/Expo (sufixos de arquivo):

| Arquivo | Papel |
| --- | --- |
| `DailyOrdersMap.types.ts` | Contrato compartilhado (`OrderMapPoint`, `DailyOrdersMapProps`). |
| `DailyOrdersMap.bounds.ts` | `computeMapBounds` (função pura) — enquadramento a partir dos pontos; reusado por web e nativo. |
| `DailyOrdersMap.web.tsx` | Web/PWA: `react-leaflet` + tiles OSM, pins por status, estado vazio. |
| `DailyOrdersMap.native.tsx` | Nativo: `WebView` com HTML Leaflet embutido (CDN unpkg + SRI), mesmos pins por status e estado vazio. |
| `DailyOrdersMap.tsx` | Assinatura neutra (usada pelo `tsc`, que não resolve por plataforma) + reexport dos tipos. |

Notas de consistência entre as variantes:

- Ambas usam OSM (`tile.openstreetmap.org`) com a atribuição obrigatória, cor de
  pin por status (`theme.colors[status]`, com fallback `primary`) e o mesmo
  `computeMapBounds` para o enquadramento.
- No nativo, os pontos são injetados no HTML como **JSON serializado**
  (`JSON.stringify`), sem interpolar dados do usuário como código.
- Ambas dependem de rede para carregar tiles/assets — aceitável numa tela
  administrativa que já exige o backend online.
