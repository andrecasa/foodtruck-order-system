import type { MonthlyHeatmapProps } from './MonthlyHeatmap.types';

export type { MonthlyHeatmapProps, HeatmapPoint } from './MonthlyHeatmap.types';

/**
 * MonthlyHeatmap — ponto de entrada neutro do mapa de calor mensal.
 *
 * A implementação real é resolvida por plataforma pelo Metro/Expo:
 * - Web/PWA: `MonthlyHeatmap.web.tsx` (react-leaflet + leaflet.heat).
 * - Nativo (Android/iOS): `MonthlyHeatmap.native.tsx` (WebView + leaflet-heat).
 *
 * Este arquivo define a assinatura pública usada pelo TypeScript (o `tsc` não
 * faz resolução por plataforma) e reexporta os tipos do contrato. Em runtime
 * nunca é carregado — as variantes `.web`/`.native` têm precedência —, por isso
 * não renderiza nada. `_props` é intencionalmente não usado (prefixo `_`).
 */
export function MonthlyHeatmap(_props: MonthlyHeatmapProps): null {
  return null;
}
