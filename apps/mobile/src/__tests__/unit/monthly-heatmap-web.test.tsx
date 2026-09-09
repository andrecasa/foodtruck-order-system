import React from 'react';
import { render } from '@testing-library/react-native';
import type { HeatmapPoint } from '@order-system/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockHeatLayer = jest.fn();
const mockAddTo = jest.fn(() => ({ remove: jest.fn() }));

jest.mock('react-leaflet', () => {
  const { View } = require('react-native');
  return {
    MapContainer: ({ children }: any) => <View testID="leaflet-map">{children}</View>,
    TileLayer: (props: any) => <View testID="leaflet-tiles" accessibilityLabel={props.attribution} />,
    useMap: () => ({ fitBounds: jest.fn(), setView: jest.fn() }),
  };
});

// L.heatLayer(latlngs, opts).addTo(map)
jest.mock('leaflet', () => ({
  __esModule: true,
  default: {
    heatLayer: (...args: any[]) => {
      mockHeatLayer(...args);
      return { addTo: mockAddTo, remove: jest.fn() };
    },
  },
}));
jest.mock('leaflet.heat', () => ({}), { virtual: true });

jest.mock('../../theme', () => require('../helpers/mockTheme').themeMocks);
jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

import { MonthlyHeatmap } from '../../components/MonthlyHeatmap.web';

function point(overrides: Partial<HeatmapPoint>): HeatmapPoint {
  return { latitude: -23.55, longitude: -46.63, weight: 1, ...overrides };
}

describe('MonthlyHeatmap (web)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renderiza o mapa e adiciona a camada de calor com os pontos', () => {
    const { getByTestId } = render(
      <MonthlyHeatmap
        points={[
          point({ latitude: -23.5, longitude: -46.6, weight: 3 }),
          point({ latitude: -22.9, longitude: -43.2, weight: 1 }),
        ]}
      />,
    );

    expect(getByTestId('monthly-heatmap')).toBeTruthy();
    expect(getByTestId('leaflet-map')).toBeTruthy();
    // heatLayer recebe tuplas [lat, lng, intensidade] com o peso NORMALIZADO
    // (peso/maiorPeso), para o ponto mais quente saturar o gradiente.
    expect(mockHeatLayer).toHaveBeenCalledTimes(1);
    const latlngs = mockHeatLayer.mock.calls[0][0];
    expect(latlngs).toEqual([
      [-23.5, -46.6, 1], // 3/3
      [-22.9, -43.2, 1 / 3], // 1/3
    ]);
    // Opções de visibilidade: piso de opacidade e gradiente quente definidos.
    const opts = mockHeatLayer.mock.calls[0][1];
    expect(opts.minOpacity).toBeGreaterThan(0);
    expect(opts.gradient).toBeDefined();
    expect(mockAddTo).toHaveBeenCalled();
  });

  it('inclui a atribuição obrigatória do OpenStreetMap', () => {
    const { getByLabelText } = render(<MonthlyHeatmap points={[point({})]} />);
    expect(getByLabelText(/OpenStreetMap/i)).toBeTruthy();
  });

  it('mostra o estado vazio quando não há pontos', () => {
    const { getByTestId, queryByTestId } = render(<MonthlyHeatmap points={[]} />);
    expect(getByTestId('monthly-heatmap-empty')).toBeTruthy();
    expect(queryByTestId('leaflet-map')).toBeNull();
    expect(mockHeatLayer).not.toHaveBeenCalled();
  });
});
