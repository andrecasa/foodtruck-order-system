export interface DailySummary {
  date: string;
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  paidTotal: number;
  pendingTotal: number;
  byPaymentMethod: {
    dinheiro: number;
    pix: number;
    'cartão débito': number;
    'cartão crédito': number;
  };
}

export interface MonthlySummaryResponse {
  year: number;
  month: number;
  totals: {
    totalOrders: number;
    totalRevenue: number;   // cents (paid + pending)
    totalReceived: number;  // cents (paid only)
    totalPending: number;   // cents
  };
  byPaymentMethod: {
    dinheiro: number;           // cents
    pix: number;                // cents
    'cartão débito': number;    // cents
    'cartão crédito': number;   // cents
  };
  days: DayBreakdown[];
}

export interface DayBreakdown {
  day: number;              // 1-31
  orderCount: number;
  revenue: number;          // cents
  paidOrders: number;
}

/**
 * Ponto do mapa de calor (heatmap) do resumo do mês. Os pedidos são agregados
 * por coordenada arredondada no backend, então `weight` é a quantidade de
 * pedidos naquele ponto (intensidade do calor).
 */
export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  /** Quantidade de pedidos agregados nesta coordenada (intensidade). */
  weight: number;
}

/**
 * Resposta do heatmap mensal. O heatmap é montado apenas com pedidos que têm
 * coordenada (`points`); os contadores expõem o total geral do mês, com e sem
 * localização, para a UI mostrar "X de Y pedidos com localização".
 */
export interface MonthlyHeatmapResponse {
  year: number;
  month: number;
  /** Total de pedidos do mês, independente de terem coordenada. */
  totalOrders: number;
  /** Pedidos do mês que têm coordenada (base do heatmap). */
  geolocatedOrders: number;
  /** Pontos agregados por coordenada (somente pedidos geolocalizados). */
  points: HeatmapPoint[];
}
