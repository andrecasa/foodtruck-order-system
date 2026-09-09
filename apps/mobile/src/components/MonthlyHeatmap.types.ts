import type { HeatmapPoint } from '@order-system/shared';

/**
 * Contrato compartilhado do mapa de calor mensal (`MonthlyHeatmap`).
 *
 * Mantido num arquivo `.types.ts` (sem sufixo de plataforma) para que as
 * variantes web e nativa importem os mesmos tipos de uma única fonte, sem
 * acionar a resolução por plataforma do Metro.
 */
export type { HeatmapPoint };

export interface MonthlyHeatmapProps {
  /** Pontos agregados por coordenada (só pedidos geolocalizados). */
  points: HeatmapPoint[];
  /** Altura do mapa em px. Padrão: 240. */
  height?: number;
  /** Test ID do container. Padrão: `monthly-heatmap`. */
  testID?: string;
}
