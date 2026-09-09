import { prepareHeatmapData, SINGLE_LOCATION_ZOOM } from '../../components/MonthlyHeatmap.data';
import type { HeatmapPoint } from '../../components/MonthlyHeatmap.types';

function p(latitude: number, longitude: number, weight: number): HeatmapPoint {
  return { latitude, longitude, weight };
}

describe('prepareHeatmapData', () => {
  it('normaliza os pesos para 0..1 (peso/maiorPeso)', () => {
    const { tuples } = prepareHeatmapData([
      p(-23.5, -46.6, 4),
      p(-22.9, -43.2, 1),
    ]);
    expect(tuples).toEqual([
      [-23.5, -46.6, 1], // 4/4
      [-22.9, -43.2, 0.25], // 1/4
    ]);
  });

  it('todos os pedidos no mesmo local: intensidade 1 e zoom aproximado (sem bounding box)', () => {
    // Caso da venda presencial: N pedidos na mesma coordenada -> 1 ponto agregado.
    const { tuples, bounds } = prepareHeatmapData([p(-25.4756, -49.1935, 26)]);
    expect(tuples).toEqual([[-25.4756, -49.1935, 1]]);
    expect(bounds.boundingBox).toBeNull();
    expect(bounds.fallbackZoom).toBe(SINGLE_LOCATION_ZOOM);
    expect(bounds.center).toEqual([-25.4756, -49.1935]);
  });

  it('pontos coincidentes (mesmas coords) também usam o zoom aproximado', () => {
    const { bounds } = prepareHeatmapData([
      p(-25.4756, -49.1935, 10),
      p(-25.4756, -49.1935, 16),
    ]);
    expect(bounds.boundingBox).toBeNull();
    expect(bounds.fallbackZoom).toBe(SINGLE_LOCATION_ZOOM);
  });

  it('pontos dispersos mantêm o bounding box (fitBounds)', () => {
    const { bounds } = prepareHeatmapData([
      p(-23.0, -46.0, 1),
      p(-25.0, -48.0, 1),
    ]);
    expect(bounds.boundingBox).toEqual([
      [-25.0, -48.0],
      [-23.0, -46.0],
    ]);
  });

  it('sem pontos: lista vazia de tuplas', () => {
    const { tuples } = prepareHeatmapData([]);
    expect(tuples).toEqual([]);
  });
});
