import { z } from 'zod';
export const registerPaymentRequestSchema = z.object({
    paymentMethod: z.enum(['dinheiro', 'pix', 'cartão débito', 'cartão crédito']),
});
//# sourceMappingURL=payment.validator.js.map