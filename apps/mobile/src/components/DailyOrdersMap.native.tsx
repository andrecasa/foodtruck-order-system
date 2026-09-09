import React, { useMemo } from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme';
import type { DailyOrdersMapProps, OrderMapPoint } from './DailyOrdersMap.types';
import { computeMapBounds } from './DailyOrdersMap.bounds';
import { MAP_TILE, grayscaleTileCss } from './map-tiles';
import { pinDataUri, PIN_WIDTH, PIN_HEIGHT, PIN_ANCHOR } from './map-pin';

/**
 * DailyOrdersMap (nativo) — mapa com um pin por pedido do dia que possui
 * coordenadas, renderizado dentro de um `WebView`.
 *
 * No nativo (Android/iOS) não há DOM para o Leaflet, então embutimos um HTML
 * mínimo num `WebView` que carrega o Leaflet do CDN e plota os mesmos pins da
 * variante web (`DailyOrdersMap.web.tsx`), mantendo consistência de aparência e
 * de contrato de props. Escolha OSM-only: sem Google Maps e sem API key. A
 * atribuição obrigatória ("© OpenStreetMap contributors") é exibida pelos tiles.
 *
 * O `WebView` roda em Expo Go e em builds nativos (não exige configuração
 * nativa extra além da lib `react-native-webview`). Os pontos são injetados no
 * HTML como JSON serializado (`JSON.stringify`), evitando qualquer interpolação
 * de string crua no script.
 *
 * Cada pedido vira um pino SVG (ver `map-pin.ts`) colorido pelo status (via
 * `theme.colors[status]`, com fallback `primary`) — independe de fonte/rede.
 * Quando não há pedidos com localização, mostra um estado vazio em vez de um
 * mapa sem pins.
 */

/** Versão do Leaflet fixada (mesma da variante web) + SRI para integridade. */
const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const DEFAULT_HEIGHT = 240;

/** Ponto já com a cor do pin resolvida, pronto para injeção no HTML do WebView. */
interface WebViewPoint {
  latitude: number;
  longitude: number;
  /** `data:` URI do SVG do pino, já colorido pelo status. */
  iconUrl: string;
  dailyNumber: number;
  customerName: string;
}

/**
 * Monta o documento HTML do mapa. Recebe os pontos (com cor já resolvida) e a
 * configuração de enquadramento, ambos serializados como JSON — nenhum dado do
 * usuário é interpolado como código.
 */
function buildMapHtml(points: WebViewPoint[], bounds: ReturnType<typeof computeMapBounds>): string {
  const data = JSON.stringify({
    points,
    bounds,
    tileUrl: MAP_TILE.url,
    attribution: MAP_TILE.attribution,
    pin: { width: PIN_WIDTH, height: PIN_HEIGHT, anchor: PIN_ANCHOR },
  });
  const grayscaleCss = grayscaleTileCss('.leaflet-tile-pane');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet"
    href="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css"
    integrity="${LEAFLET_CSS_SRI}" crossorigin="" />
  <script
    src="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js"
    integrity="${LEAFLET_JS_SRI}" crossorigin=""></script>
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    .leaflet-container { background: #fff; }
    /* Dessatura só os tiles do mapa base (não os pins) conforme MAP_TILE. */
    ${grayscaleCss}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function () {
      var cfg = ${data};
      var map = L.map('map', { attributionControl: true, scrollWheelZoom: true });
      L.tileLayer(cfg.tileUrl, { attribution: cfg.attribution, maxZoom: 19 }).addTo(map);

      cfg.points.forEach(function (p) {
        var icon = L.icon({
          iconUrl: p.iconUrl,
          iconSize: [cfg.pin.width, cfg.pin.height],
          iconAnchor: cfg.pin.anchor,
        });
        L.marker([p.latitude, p.longitude], { icon: icon })
          .addTo(map)
          .bindPopup('#' + p.dailyNumber + ' — ' + p.customerName);
      });

      // Enquadra o mapa SÓ depois que o container tem tamanho real. Dentro do
      // WebView, este script roda antes de o layout estabilizar; se chamarmos
      // fitBounds/setView com viewport de tamanho zero, o Leaflet calcula o
      // zoom errado (tipicamente o máximo). invalidateSize() força o Leaflet a
      // reler as dimensões antes de enquadrar, e reaplicamos em load/resize.
      function frame() {
        map.invalidateSize(false);
        if (cfg.bounds.boundingBox) {
          map.fitBounds(cfg.bounds.boundingBox, { padding: [32, 32] });
        } else {
          map.setView(cfg.bounds.center, cfg.bounds.fallbackZoom);
        }
      }

      map.whenReady(function () { setTimeout(frame, 0); });
      window.addEventListener('load', frame);
      window.addEventListener('resize', frame);
    })();
  </script>
</body>
</html>`;
}

/**
 * Resolve a cor do pin a partir do status do pedido, caindo para `primary`
 * quando o status não tem token de cor dedicado (ex.: "entregue").
 */
function usePinColor() {
  const theme = useTheme();
  return (status: string): string => {
    const colors = theme.colors as Record<string, string | undefined>;
    return colors[status] ?? theme.colors.primary;
  };
}

export function DailyOrdersMap({
  points,
  height = DEFAULT_HEIGHT,
  testID = 'daily-orders-map',
}: DailyOrdersMapProps) {
  const theme = useTheme();
  const pinColor = usePinColor();

  const html = useMemo(() => {
    const webViewPoints: WebViewPoint[] = points.map((p: OrderMapPoint) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      iconUrl: pinDataUri(pinColor(p.status)),
      dailyNumber: p.dailyNumber,
      customerName: p.customerName,
    }));
    return buildMapHtml(webViewPoints, computeMapBounds(points));
    // pinColor depende só do tema (estável entre renders relevantes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, theme]);

  const containerStyle: ViewStyle = {
    height,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  };

  const emptyStyle: ViewStyle = {
    height,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  };

  const emptyTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  };

  if (points.length === 0) {
    return (
      <View
        style={emptyStyle}
        testID={`${testID}-empty`}
        accessibilityLabel="Nenhum pedido com localização para este dia"
      >
        <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 32, color: theme.colors.textSecondary }}>
          location_off
        </RNText>
        <RNText style={emptyTextStyle}>Nenhum pedido com localização para este dia</RNText>
      </View>
    );
  }

  return (
    <View
      style={containerStyle}
      testID={testID}
      accessibilityLabel={`Mapa com ${points.length} pedido(s) com localização`}
    >
      <WebView
        testID={`${testID}-webview`}
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        // Sem navegação para fora: é um mapa estático embutido.
        setSupportMultipleWindows={false}
      />
    </View>
  );
}
