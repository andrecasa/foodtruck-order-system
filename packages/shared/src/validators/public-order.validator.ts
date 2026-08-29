import { z } from 'zod';

export const publicCreateOrderSchema = z
  .object({
    customerName: z.string().min(1).max(100),
    items: z
      .array(
        z.object({
          menuItemId: z.string().uuid(),
          quantity: z.number().int().min(1).max(99),
        })
      )
      .min(1)
      .max(50),
  })
  .strict();
