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
        totalRevenue: number;
        totalReceived: number;
        totalPending: number;
    };
    days: DayBreakdown[];
}
export interface DayBreakdown {
    day: number;
    orderCount: number;
    revenue: number;
    paidOrders: number;
}
//# sourceMappingURL=summary.d.ts.map