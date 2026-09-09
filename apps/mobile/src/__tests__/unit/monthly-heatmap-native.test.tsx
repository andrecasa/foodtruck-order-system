import React from 'react';
import { render } from '@testing-library/react-native';
import type { HeatmapPoint } from '@order-system/shared';

// Mocka o WebView expondo o HTML recebido (source.html) via accessibilityLabel.
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

import { MonthlyHeatmap } from '../../components/MonthlyHeatmap.native';

function point(overrides: Partial<HeatmapPoint>): HeatmapPoint {
  return { latitude: -23.55, longitude: -46.63, weight: 1, ...overrides };
}

describe('MonthlyHeatmap (nativo/WebView)', () => {
  it('renderiza o WebView com o mapa de calor quando há pontos', () => {
    const { getByTestId } = render(
      <MonthlyHeatmap points={[point({ latitude: -23.5, longitude: -46.6, weight: 4 })]} />,
    );
    expect(getByTestId('monthly-heatmap')).toBeTruthy();
    expect(getByTestId('monthly-heatmap-webview')).toBeTruthy();
  });

  it('injeta os pontos [lat,lng,weight] e usa leaflet.heat + OSM no HTML', () => {
    const { getByTestId } = render(
      <MonthlyHeatmap points={[point({ latitude: -23.5, longitude: -46.6, weight: 4 })]} />,
    );
    const html = getByTestId('monthly-heatmap-webview').props.accessibilityLabel as string;
    expect(html).toContain('-23.5');
    expect(html).toContain('-46.6');
    expect(html).toContain('heatLayer');
    expect(html).toContain('leaflet-heat');
    expect(html).toContain('tile.openstreetmap.org');
    expect(html).toContain('OpenStreetMap');
  });

  it('enquadra o mapa após o container ter tamanho (whenReady + invalidateSize)', () => {
    // Regressão: dentro do WebView, chamar fitBounds/setView antes do layout
    // estabilizar calcula o zoom errado (viewport de tamanho zero). O HTML deve
    // adiar o enquadramento para whenReady e forçar invalidateSize antes.
    const { getByTestId } = render(
      <MonthlyHeatmap
        points={[
          point({ latitude: -23.5, longitude: -46.6, weight: 4 }),
          point({ latitude: -25.0, longitude: -49.2, weight: 1 }),
        ]}
      />,
    );
    const html = getByTestId('monthly-heatmap-webview').props.accessibilityLabel as string;
    expect(html).toContain('whenReady');
    expect(html).toContain('invalidateSize');
    // O enquadramento continua usando fitBounds para pontos dispersos.
    expect(html).toContain('fitBounds');
  });

  it('mostra o estado vazio quando não há pontos', () => {
    const { getByTestId, queryByTestId } = render(<MonthlyHeatmap points={[]} />);
    expect(getByTestId('monthly-heatmap-empty')).toBeTruthy();
    expect(queryByTestId('monthly-heatmap-webview')).toBeNull();
  });
});
