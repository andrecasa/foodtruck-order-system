import React, { useEffect, useMemo } from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
// Nota: o CSS do Leaflet é carregado via CDN no <head> (public/index.html), não
// por `import 'leaflet/dist/leaflet.css'` — o Metro não resolve os assets
// internos desse CSS. Ver README do mobile.
import { useTheme } from '../theme';
import type { MonthlyHeatmapProps, HeatmapPoint } from './MonthlyHeatmap.types';
import { prepareHeatmapData, HEAT_OPTIONS } from './MonthlyHeatmap.data';
import { MAP_TILE, GRAYSCALE_TILE_CLASS } from './map-tiles';
import { ensureGrayscaleTileStyle } from './map-grayscale.web';

/**
 * MonthlyHeatmap (web/PWA) — mapa de calor OpenStreetMap dos pedidos do mês que
 * possuem coordenadas. Usa `leaflet.heat` (plugin `L.heatLayer`) sobre tiles do
 * OSM. Sem Google Maps e sem API key.
 *
 * A intensidade de cada ponto é o `weight` (quantidade de pedidos agregados
 * naquela coordenada, vinda do backend). Quando não há pontos, mostra um estado
 * vazio em vez de um mapa sem calor.
 */

const DEFAULT_HEIGHT = 240;

/**
 * Camada de calor: adiciona um `L.heatLayer` ao mapa e o mantém sincronizado
 * com os pontos. Precisa ser filho de `MapContainer` para acessar a instância
 * via `useMap`.
 */
function HeatLayer({ points }: { points: HeatmapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    const { tuples, bounds } = prepareHeatmapData(points);
    const layer = L.heatLayer(tuples as L.HeatLatLngTuple[], HEAT_OPTIONS);
    layer.addTo(map);

    if (bounds.boundingBox) {
      map.fitBounds(bounds.boundingBox, { padding: [32, 32] });
    } else {
      map.setView(bounds.center, bounds.fallbackZoom);
    }

    return () => {
      layer.remove();
    };
  }, [map, points]);

  return null;
}

export function MonthlyHeatmap({
  points,
  height = DEFAULT_HEIGHT,
  testID = 'monthly-heatmap',
}: MonthlyHeatmapProps) {
  const theme = useTheme();

  ensureGrayscaleTileStyle();

  const initial = useMemo(() => prepareHeatmapData(points).bounds, [points]);

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
      <MapContainer
        center={initial.center}
        zoom={initial.fallbackZoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          url={MAP_TILE.url}
          attribution={MAP_TILE.attribution}
          className={MAP_TILE.grayscale ? GRAYSCALE_TILE_CLASS : undefined}
        />
        {/* grayscale aplicado via CSS injetado (ensureGrayscaleTileStyle) */}
        <HeatLayer points={points} />
      </MapContainer>
    </View>
  );
}
