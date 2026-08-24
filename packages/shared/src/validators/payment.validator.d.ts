import { z } from 'zod';
export declare const registerPaymentRequestSchema: z.ZodObject<{
    paymentMethod: z.ZodEnum<["dinheiro", "pix", "cartão débito", "cartão crédito"]>;
}, "strip", z.ZodTypeAny, {
    paymentMethod: "dinheiro" | "pix" | "cartão débito" | "cartão crédito";
}, {
    paymentMethod: "dinheiro" | "pix" | "cartão débito" | "cartão crédito";
}>;
//# sourceMappingURL=payment.validator.d.ts.map