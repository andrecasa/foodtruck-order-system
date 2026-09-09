import React from 'react';
import { render } from '@testing-library/react-native';
import type { OrderMapPoint } from '../../components/DailyOrdersMap.types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mocka react-leaflet: cada primitivo vira um elemento com testID inspecionável,
// evitando a necessidade de um DOM real de mapa.
jest.mock('react-leaflet', () => {
  const { View } = require('react-native');
  return {
    MapContainer: ({ children }: any) => <View testID="leaflet-map">{children}</View>,
    TileLayer: (props: any) => <View testID="leaflet-tiles" accessibilityLabel={props.attribution} />,
    // O ícone (divIcon) carrega a className "order-pin order-pin-<id>"; expomos
    // o último token (order-pin-<id>) como testID para asserção.
    Marker: ({ children, icon }: any) => {
      const cls = String(icon?.options?.className ?? '').trim().split(/\s+/);
      return <View testID={cls[cls.length - 1]}>{children}</View>;
    },
    Popup: ({ children }: any) => <View testID="leaflet-popup">{children}</View>,
    useMap: () => ({ fitBounds: jest.fn(), setView: jest.fn() }),
  };
});

// L.icon apenas devolve as opções (incluindo className) para inspeção.
jest.mock('leaflet', () => ({
  __esModule: true,
  default: { icon: (options: any) => ({ options }) },
}));

jest.mock('../../theme', () => require('../helpers/mockTheme').themeMocks);
jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// Importado após os mocks (variante web explícita).
import { DailyOrdersMap } from '../../components/DailyOrdersMap.web';

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

describe('DailyOrdersMap (web)', () => {
  it('renderiza um pin por ponto com testID por id', () => {
    const { getByTestId } = render(
      <DailyOrdersMap
        points={[
          point({ id: 'a', dailyNumber: 1 }),
          point({ id: 'b', dailyNumber: 2, latitude: -22.9, longitude: -43.2 }),
        ]}
      />,
    );

    expect(getByTestId('daily-orders-map')).toBeTruthy();
    expect(getByTestId('leaflet-map')).toBeTruthy();
    expect(getByTestId('order-pin-a')).toBeTruthy();
    expect(getByTestId('order-pin-b')).toBeTruthy();
  });

  it('inclui a atribuição obrigatória do OpenStreetMap', () => {
    const { getByLabelText } = render(<DailyOrdersMap points={[point({ id: 'a' })]} />);
    // A atribuição é repassada ao TileLayer via accessibilityLabel no mock.
    expect(getByLabelText(/OpenStreetMap/i)).toBeTruthy();
  });

  it('mostra o estado vazio quando não há pontos', () => {
    const { getByTestId, queryByTestId } = render(<DailyOrdersMap points={[]} />);
    expect(getByTestId('daily-orders-map-empty')).toBeTruthy();
    expect(queryByTestId('leaflet-map')).toBeNull();
  });
});
