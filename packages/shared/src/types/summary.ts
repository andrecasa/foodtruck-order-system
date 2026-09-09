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

/**
 * Produto no ranking "Top mais vendidos" do resumo (diário/mensal). A métrica
 * principal é a quantidade vendida (`quantitySold`); o faturamento
 * (`revenueCents`) acompanha para a UI poder exibir ambos. Contabiliza TODOS os
 * pedidos do período, independentemente do status de pagamento.
 */
export interface TopProduct {
  menuItemId: string;
  name: string;
  categoryId: string;
  /** Soma das quantidades vendidas no período (métrica de ordenação). */
  quantitySold: number;
  /** Faturamento do produto no período em centavos (SUM(quantity * unit_price_cents)). */
  revenueCents: number;
}

/**
 * Resposta do ranking "Top 10 produtos mais vendidos". É um ranking único
 * agregado (até 10 itens), ordenado por quantidade vendida desc (desempate por
 * faturamento desc). Quando `categoryIds` não é vazio, o ranking considera
 * apenas produtos dessas categorias; vazio = todas as categorias.
 */
export interface TopProductsResponse {
  products: TopProduct[];
  /** Filtro de categorias aplicado (ecoa a requisição); `[]` = todas. */
  categoryIds: string[];
}
