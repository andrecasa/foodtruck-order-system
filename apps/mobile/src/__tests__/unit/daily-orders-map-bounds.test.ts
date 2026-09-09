import {
  computeMapBounds,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  COUNTRY_ZOOM,
} from '../../components/DailyOrdersMap.bounds';
import type { OrderMapPoint } from '../../components/DailyOrdersMap.types';

function point(overrides: Partial<OrderMapPoint>): OrderMapPoint {
  return {
    id: 'id',
    dailyNumber: 1,
    latitude: 0,
    longitude: 0,
    customerName: 'Cliente',
    status: 'aguardando',
    ...overrides,
  };
}

describe('computeMapBounds', () => {
  it('sem pontos: centra no Brasil com zoom de país e sem bounding box', () => {
    const result = computeMapBounds([]);
    expect(result.center).toEqual([DEFAULT_CENTER[0], DEFAULT_CENTER[1]]);
    expect(result.boundingBox).toBeNull();
    expect(result.fallbackZoom).toBe(COUNTRY_ZOOM);
  });

  it('um ponto: centra no ponto com zoom padrão e sem bounding box', () => {
    const result = computeMapBounds([point({ latitude: -23.55, longitude: -46.63 })]);
    expect(result.center).toEqual([-23.55, -46.63]);
    expect(result.boundingBox).toBeNull();
    expect(result.fallbackZoom).toBe(DEFAULT_ZOOM);
  });

  it('dois ou mais pontos: bounding box englobando todos e centro no meio', () => {
    const result = computeMapBounds([
      point({ id: 'a', latitude: -23.0, longitude: -46.0 }),
      point({ id: 'b', latitude: -25.0, longitude: -48.0 }),
    ]);
    expect(result.boundingBox).toEqual([
      [-25.0, -48.0],
      [-23.0, -46.0],
    ]);
    expect(result.center).toEqual([-24.0, -47.0]);
  });
});
