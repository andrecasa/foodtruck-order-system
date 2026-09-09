import React, { useMemo } from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme';
import type { MonthlyHeatmapProps, HeatmapPoint } from './MonthlyHeatmap.types';
import { prepareHeatmapData, HEAT_OPTIONS } from './MonthlyHeatmap.data';
import { MAP_TILE, grayscaleTileCss } from './map-tiles';

/**
 * MonthlyHeatmap (nativo) — mapa de calor dos pedidos do mês, renderizado dentro
 * de um `WebView`.
 *
 * No nativo não há DOM para o Leaflet, então embutimos um HTML que carrega o
 * Leaflet + o plugin `leaflet.heat` do CDN e desenha o `L.heatLayer` com os
 * mesmos pontos da variante web (`MonthlyHeatmap.web.tsx`). A base de mapa vem
 * de `MAP_TILE` (ver `map-tiles.ts`). Sem Google Maps e sem API key. Os pontos
 * são injetados como JSON serializado.
 */

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
/** Plugin leaflet.heat (não há SRI oficial publicada; versão fixada). */
const LEAFLET_HEAT_URL = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
const DEFAULT_HEIGHT = 240;

/** Monta o HTML do mapa de calor. Pontos e config injetados como JSON. */
function buildHeatmapHtml(points: HeatmapPoint[]): string {
  const { tuples, bounds } = prepareHeatmapData(points);
  const data = JSON.stringify({
    tuples,
    bounds,
    options: HEAT_OPTIONS,
    tileUrl: MAP_TILE.url,
    attribution: MAP_TILE.attribution,
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
  <script src="${LEAFLET_HEAT_URL}" crossorigin=""></script>
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    .leaflet-container { background: #fff; }
    /* Dessatura só os tiles do mapa base (não o heatmap) quando a base pede
       grayscale: o canvas do leaflet.heat fica no overlay-pane, fora do filtro. */
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

      L.heatLayer(cfg.tuples, cfg.options).addTo(map);

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

export function MonthlyHeatmap({
  points,
  height = DEFAULT_HEIGHT,
  testID = 'monthly-heatmap',
}: MonthlyHeatmapProps) {
  const theme = useTheme();

  const html = useMemo(() => buildHeatmapHtml(points), [points]);

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
        accessibilityLabel="Nenhum pedido com localização neste mês"
      >
        <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 32, color: theme.colors.textSecondary }}>
          location_off
        </RNText>
        <RNText style={emptyTextStyle}>Nenhum pedido com localização neste mês</RNText>
      </View>
    );
  }

  return (
    <View
      style={containerStyle}
      testID={testID}
      accessibilityLabel={`Mapa de calor com ${points.length} local(is) de pedidos`}
    >
      <WebView
        testID={`${testID}-webview`}
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}
