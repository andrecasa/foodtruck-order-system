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
