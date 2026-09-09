import React from 'react';
import { render } from '@testing-library/react-native';
import type { OrderMapPoint } from '../../components/DailyOrdersMap.types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mocka o WebView: expõe o HTML recebido (source.html) via um testID próprio,
// para inspecionar o conteúdo injetado sem renderizar um WebView real.
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    WebView: ({ testID, source }: any) => (
      <View testID={testID} accessibilityLabel={source?.html} />
    ),
  };
});

jest.mock('../../theme', () => require('../helpers/mockTheme').themeMocks);
jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// Importado após os mocks (variante nativa explícita).
import { DailyOrdersMap } from '../../components/DailyOrdersMap.native';

// ─── Helpers ────────────────────────────────────────────────────────────────

function point(overrides: Partial<OrderMapPoint>): OrderMapPoint {
  return {
    id: 'id',
    dailyNumber: 1,
    latitude: -23.55,
    longitude: -46.63,
    customerName: 'Cliente',
    status: 'aguardando',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DailyOrdersMap (nativo/WebView)', () => {
  it('renderiza o WebView com o mapa quando há pontos', () => {
    const { getByTestId } = render(
      <DailyOrdersMap points={[point({ id: 'a', dailyNumber: 7, customerName: 'Ana' })]} />,
    );

    expect(getByTestId('daily-orders-map')).toBeTruthy();
    expect(getByTestId('daily-orders-map-webview')).toBeTruthy();
  });

  it('injeta os pontos (coordenadas e rótulo) no HTML do WebView', () => {
    const { getByTestId } = render(
      <DailyOrdersMap
        points={[point({ id: 'a', dailyNumber: 7, customerName: 'Ana', latitude: -23.5, longitude: -46.6 })]}
      />,
    );

    const html = getByTestId('daily-orders-map-webview').props.accessibilityLabel as string;
    // Coordenadas e rótulo do pedido presentes no JSON injetado.
    expect(html).toContain('-23.5');
    expect(html).toContain('-46.6');
    expect(html).toContain('Ana');
    // Usa Leaflet + tiles OSM com atribuição.
    expect(html).toContain('leaflet');
    expect(html).toContain('tile.openstreetmap.org');
    expect(html).toContain('OpenStreetMap');
  });

  it('usa pino SVG (L.marker + L.icon) colorido pelo status', () => {
    const { getByTestId } = render(
      <DailyOrdersMap points={[point({ id: 'a', status: 'aguardando' })]} />,
    );
    const html = getByTestId('daily-orders-map-webview').props.accessibilityLabel as string;
    // Marcador com ícone (não mais circleMarker) usando data URI de SVG.
    expect(html).toContain('L.marker');
    expect(html).toContain('L.icon');
    expect(html).toContain('data:image/svg+xml');
    // Cor do status "aguardando" (#D4812B) aparece no SVG codificado na URL
    // (o "#" vira %23 pelo encodeURIComponent).
    expect(html).toContain('%23D4812B');
  });

  it('enquadra o mapa após o container ter tamanho (whenReady + invalidateSize)', () => {
    // Regressão: dentro do WebView, chamar fitBounds/setView antes do layout
    // estabilizar calcula o zoom errado (viewport de tamanho zero). O HTML deve
    // adiar o enquadramento para whenReady e forçar invalidateSize antes.
    const { getByTestId } = render(
      <DailyOrdersMap
        points={[
          point({ id: 'a', latitude: -23.5, longitude: -46.6 }),
          point({ id: 'b', latitude: -25.0, longitude: -49.2 }),
        ]}
      />,
    );
    const html = getByTestId('daily-orders-map-webview').props.accessibilityLabel as string;
    expect(html).toContain('whenReady');
    expect(html).toContain('invalidateSize');
    expect(html).toContain('fitBounds');
  });

  it('mostra o estado vazio quando não há pontos', () => {
    const { getByTestId, queryByTestId } = render(<DailyOrdersMap points={[]} />);
    expect(getByTestId('daily-orders-map-empty')).toBeTruthy();
    expect(queryByTestId('daily-orders-map-webview')).toBeNull();
  });
});
