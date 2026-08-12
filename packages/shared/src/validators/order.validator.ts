import { z } from 'zod';

export const createOrderRequestSchema = z.object({
  customerName: z.string().min(1).max(100),
  origin: z.enum(['presencial', 'whatsapp']),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1),
});

export const updateOrderStatusRequestSchema = z.object({
  status: z.enum(['aguardando', 'preparando', 'pronto', 'entregue']),
});
