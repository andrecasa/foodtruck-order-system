/**
 * Cálculo puro do enquadramento (bounding box / centro) a partir dos pontos.
 *
 * Isolado num módulo próprio (função pura, sem I/O nem dependência de mapa)
 * para poder ser reusado tanto pela variante web (`fitBounds` do Leaflet)
 * quanto pela futura variante nativa (`initialRegion` do react-native-maps) e
 * testado sem montar mapa nenhum.
 */
/**
 * Forma mínima de coordenada aceita pelo cálculo de enquadramento. Tanto
 * `OrderMapPoint` (pins do dia) quanto `HeatmapPoint` (mapa de calor do mês)
 * satisfazem esta interface, permitindo reuso da mesma função pura.
 */
export interface LatLngLike {
  latitude: number;
  longitude: number;
}

/** Coordenada central padrão (Brasil) usada quando não há pontos. */
export const DEFAULT_CENTER: readonly [number, number] = [-14.235, -51.925];
/** Zoom padrão de fallback (usado com pontos dispersos, quando há bounding box). */
export const DEFAULT_ZOOM = 13;
/** Zoom usado quando o país inteiro é exibido (sem pontos). */
export const COUNTRY_ZOOM = 4;
/**
 * Zoom usado quando todos os pontos coincidem (mesmo local): sem dispersão para
 * dar `fitBounds`, aproximamos ao nível de rua/bairro em vez de deixar o Leaflet
 * dar zoom máximo num bounding box degenerado (área zero).
 */
export const SINGLE_LOCATION_ZOOM = 16;

export interface MapBounds {
  /** Centro [lat, lng]. */
  center: [number, number];
  /** Cantos [ [south, west], [north, east] ] ou null quando não aplicável. */
  boundingBox: [[number, number], [number, number]] | null;
  /** Zoom sugerido quando não há bounding box (0 ou 1 ponto). */
  fallbackZoom: number;
}

/**
 * Deriva centro e bounding box dos pontos. Comportamento compartilhado por
 * todos os mapas (pins do dia e heatmap do mês) para enquadramento consistente:
 * - 0 pontos: centro no Brasil, zoom de país, sem bounding box.
 * - 1 ponto: centraliza no ponto com zoom de rua/bairro (`SINGLE_LOCATION_ZOOM`).
 * - 2+ pontos TODOS no mesmo local: centraliza com `SINGLE_LOCATION_ZOOM`, sem
 *   bounding box — evita o zoom máximo que o Leaflet daria num bounding box de
 *   área zero.
 * - 2+ pontos dispersos: bounding box englobando todos, centro no meio.
 */
export function computeMapBounds(points: LatLngLike[]): MapBounds {
  if (points.length === 0) {
    return {
      center: [DEFAULT_CENTER[0], DEFAULT_CENTER[1]],
      boundingBox: null,
      fallbackZoom: COUNTRY_ZOOM,
    };
  }

  const first = points[0]!;
  if (points.length === 1) {
    return {
      center: [first.latitude, first.longitude],
      boundingBox: null,
      fallbackZoom: SINGLE_LOCATION_ZOOM,
    };
  }

  let minLat = first.latitude;
  let maxLat = first.latitude;
  let minLng = first.longitude;
  let maxLng = first.longitude;

  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }

  // Todos os pontos no mesmo lugar → bounding box degenerado. Trata como
  // "local único" com zoom aproximado, em vez de deixar o fitBounds colar.
  if (minLat === maxLat && minLng === maxLng) {
    return {
      center: [first.latitude, first.longitude],
      boundingBox: null,
      fallbackZoom: SINGLE_LOCATION_ZOOM,
    };
  }

  return {
    center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
    boundingBox: [
      [minLat, minLng],
      [maxLat, maxLng],
    ],
    fallbackZoom: DEFAULT_ZOOM,
  };
}
