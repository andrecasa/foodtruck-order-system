import React, { useEffect, useMemo } from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
// Nota: o CSS do Leaflet NÃO é importado aqui via `import 'leaflet/.../leaflet.css'`.
// O Metro (bundler do Expo web) não resolve os `url(images/...)` internos desse
// CSS e quebra o bundle. Em vez disso, a folha de estilo é carregada via CDN no
// <head> (apps/mobile/public/index.html), que também serve os assets relativos.
import { useTheme } from '../theme';
import type { DailyOrdersMapProps, OrderMapPoint } from './DailyOrdersMap.types';
import { computeMapBounds } from './DailyOrdersMap.bounds';
import { MAP_TILE, GRAYSCALE_TILE_CLASS } from './map-tiles';
import { ensureGrayscaleTileStyle } from './map-grayscale.web';
import { pinDataUri, PIN_WIDTH, PIN_HEIGHT, PIN_ANCHOR } from './map-pin';

/**
 * DailyOrdersMap (web/PWA) — mapa OpenStreetMap com um pin por pedido do dia
 * que possui coordenadas.
 *
 * Renderizado apenas na web (react-native-web fornece o `div` DOM que o Leaflet
 * exige). Usa tiles públicos do OpenStreetMap com a atribuição obrigatória
 * ("© OpenStreetMap contributors") conforme a política de uso do OSM. Não usa
 * Google Maps nem exige API key.
 *
 * Cada pedido vira um pino SVG (ver `map-pin.ts`) colorido pelo status (via
 * `theme.colors[status]`), com popup mostrando número/cliente. Quando não há
 * pedidos com localização, mostra um estado vazio em vez de um mapa sem pins.
 */

const DEFAULT_HEIGHT = 240;

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

/**
 * Ajusta o enquadramento do mapa aos pontos sempre que a lista muda.
 * Precisa ser filho de `MapContainer` para acessar a instância via `useMap`.
 */
function FitBounds({ points }: { points: OrderMapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    const { center, boundingBox, fallbackZoom } = computeMapBounds(points);
    if (boundingBox) {
      map.fitBounds(boundingBox, { padding: [32, 32] });
    } else {
      map.setView(center, fallbackZoom);
    }
  }, [map, points]);

  return null;
}

export function DailyOrdersMap({
  points,
  height = DEFAULT_HEIGHT,
  testID = 'daily-orders-map',
}: DailyOrdersMapProps) {
  const theme = useTheme();
  const pinColor = usePinColor();

  ensureGrayscaleTileStyle();

  const initial = useMemo(() => computeMapBounds(points), [points]);

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
        <FitBounds points={points} />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude, p.longitude]}
            icon={L.icon({
              iconUrl: pinDataUri(pinColor(p.status)),
              className: `order-pin order-pin-${p.id}`,
              iconSize: [PIN_WIDTH, PIN_HEIGHT],
              iconAnchor: PIN_ANCHOR,
            })}
          >
            <Popup>
              <span>
                #{p.dailyNumber} — {p.customerName}
              </span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </View>
  );
}
