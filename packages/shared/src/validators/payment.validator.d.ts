import { z } from 'zod';
export declare const registerPaymentRequestSchema: z.ZodObject<{
    paymentMethod: z.ZodEnum<["dinheiro", "pix", "cartão"]>;
}, "strip", z.ZodTypeAny, {
    paymentMethod: "dinheiro" | "pix" | "cartão";
}, {
    paymentMethod: "dinheiro" | "pix" | "cartão";
}>;
//# sourceMappingURL=payment.validator.d.ts.map