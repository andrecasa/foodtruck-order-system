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
    cartão: number;
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
  days: DayBreakdown[];
}

export interface DayBreakdown {
  day: number;              // 1-31
  orderCount: number;
  revenue: number;          // cents
  paidOrders: number;
}
