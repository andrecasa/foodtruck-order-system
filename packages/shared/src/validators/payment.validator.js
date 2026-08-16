import { z } from 'zod';
export const registerPaymentRequestSchema = z.object({
    paymentMethod: z.enum(['dinheiro', 'pix', 'cartão']),
});
//# sourceMappingURL=payment.validator.js.map