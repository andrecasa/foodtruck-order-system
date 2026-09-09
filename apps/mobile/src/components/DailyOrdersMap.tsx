import type { DailyOrdersMapProps } from './DailyOrdersMap.types';

export type { OrderMapPoint, DailyOrdersMapProps } from './DailyOrdersMap.types';

/**
 * DailyOrdersMap — ponto de entrada neutro do mapa de pedidos do dia.
 *
 * A implementação real é resolvida por plataforma pelo Metro/Expo:
 * - Web/PWA: `DailyOrdersMap.web.tsx` (react-leaflet + tiles OpenStreetMap).
 * - Nativo (Android/iOS): `DailyOrdersMap.native.tsx` (fallback por enquanto;
 *   ver o JSDoc daquele arquivo para o caminho de evolução).
 *
 * Este arquivo define a assinatura pública usada pelo TypeScript (o `tsc` não
 * faz resolução por plataforma) e reexporta os tipos do contrato. Em runtime
 * ele nunca é carregado — as variantes `.web`/`.native` têm precedência —, por
 * isso não renderiza nada. O parâmetro `_props` é intencionalmente não usado
 * (prefixo `_` conforme a config do ESLint).
 */
export function DailyOrdersMap(_props: DailyOrdersMapProps): null {
  return null;
}
