/**
 * Preparação (pura) dos dados do mapa de calor, compartilhada entre as variantes
 * web e nativa para não duplicar a lógica de normalização/enquadramento.
 *
 * Por que normalizar: o `Leaflet.heat` pinta a intensidade como `valor/max`.
 * Como os pedidos vêm agregados por coordenada (`weight` = contagem), dividimos
 * cada peso pelo maior peso presente e fixamos `max = 1`. Assim o ponto mais
 * "quente" sempre satura o gradiente, independentemente da escala absoluta —
 * inclusive no caso comum de venda presencial, em que todos os pedidos caem no
 * mesmo ponto (um único ponto com peso alto que, sem isso, ficava fraco).
 */
import type { HeatmapPoint } from './MonthlyHeatmap.types';
import { computeMapBounds, type MapBounds } from './DailyOrdersMap.bounds';

/** Tupla [lat, lng, intensidade 0..1] no formato do Leaflet.heat. */
export type HeatTuple = [number, number, number];

/**
 * Opções visuais do heatmap, calibradas para boa visibilidade sobre tiles
 * coloridos do OSM:
 * - `radius`/`blur` generosos para os focos ocuparem área suficiente;
 * - `minOpacity` alto elimina a transparência excessiva (o calor sempre aparece,
 *   mesmo em zoom afastado);
 * - `max` abaixo de 1 faz o calor saturar mais cedo (como os pesos já vêm
 *   normalizados em 0..1, isso deixa até intensidades médias "quentes");
 * - `gradient` térmico clássico (verde → amarelo → laranja → vermelho), em vez
 *   do azul frio padrão do plugin, para o calor ler bem como "densidade".
 */
export const HEAT_OPTIONS = {
  radius: 25,
  blur: 15,
  max: 0.6,
  minOpacity: 0.4,
  gradient: {
    0.3: '#2E8B57', // verde nas intensidades baixas
    0.55: '#F2D22E', // amarelo
    0.75: '#F2941E', // laranja
    1.0: '#D0211C', // vermelho (núcleo)
  },
} as const;

/**
 * Zoom usado quando todos os pontos coincidem (mesmo local) ou há um só ponto:
 * sem dispersão para dar `fitBounds`, aproximamos o suficiente para o calor
 * aparecer com contexto de rua/bairro.
 */
export const SINGLE_LOCATION_ZOOM = 16;

export interface HeatmapData {
  /** Tuplas [lat, lng, intensidade] prontas para `L.heatLayer`. */
  tuples: HeatTuple[];
  /** Enquadramento; `boundingBox` é null quando os pontos coincidem. */
  bounds: MapBounds;
}

/** Verdadeiro quando todos os pontos estão praticamente no mesmo lugar. */
function pointsCoincide(points: HeatmapPoint[]): boolean {
  if (points.length <= 1) return true;
  const first = points[0]!;
  return points.every(
    (p) => p.latitude === first.latitude && p.longitude === first.longitude,
  );
}

/**
 * Normaliza os pesos para 0..1 e resolve o enquadramento. Quando os pontos
 * coincidem, força um zoom aproximado (`SINGLE_LOCATION_ZOOM`) em vez do bounding
 * box degenerado, para o calor não ficar minúsculo.
 */
export function prepareHeatmapData(points: HeatmapPoint[]): HeatmapData {
  const maxWeight = points.reduce((m, p) => Math.max(m, p.weight), 1);
  const tuples: HeatTuple[] = points.map((p) => [
    p.latitude,
    p.longitude,
    p.weight / maxWeight,
  ]);

  const base = computeMapBounds(points);
  const bounds: MapBounds =
    pointsCoincide(points) && points.length > 0
      ? { center: base.center, boundingBox: null, fallbackZoom: SINGLE_LOCATION_ZOOM }
      : base;

  return { tuples, bounds };
}
