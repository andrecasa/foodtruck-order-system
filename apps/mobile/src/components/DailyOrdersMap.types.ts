/**
 * Contrato compartilhado do mapa de pedidos do dia (`DailyOrdersMap`).
 *
 * Mantido num arquivo `.types.ts` (sem sufixo de plataforma) para que as
 * variantes `DailyOrdersMap.web.tsx` e `DailyOrdersMap.native.tsx` importem os
 * mesmos tipos de uma única fonte de verdade, sem acionar a resolução por
 * plataforma do Metro. Este é o contrato definitivo: quando o nativo for
 * implementado, ele reusa exatamente estes tipos.
 */

/**
 * Ponto plotável no mapa: um pedido do dia que possui coordenadas capturadas.
 * A tela filtra fora os pedidos sem `latitude`/`longitude` antes de montar a
 * lista, então aqui as coordenadas são sempre números válidos.
 */
export interface OrderMapPoint {
  /** Identificador do pedido (uuid). */
  id: string;
  /** Número diário do pedido (exibido no marcador). */
  dailyNumber: number;
  /** Latitude em graus decimais (-90..90). */
  latitude: number;
  /** Longitude em graus decimais (-180..180). */
  longitude: number;
  /** Nome do cliente (rótulo de acessibilidade / popup). */
  customerName: string;
  /** Status do pedido; define a cor do pin via `theme.colors[status]`. */
  status: string;
}

export interface DailyOrdersMapProps {
  /** Pedidos do dia com coordenadas, já filtrados pela tela. */
  points: OrderMapPoint[];
  /** Altura do mapa em px. Padrão: 240. */
  height?: number;
  /** Test ID do container. Padrão: `daily-orders-map`. */
  testID?: string;
}
