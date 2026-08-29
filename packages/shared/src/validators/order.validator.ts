import { z } from 'zod';

export const createOrderRequestSchema = z.object({
  customerName: z.string().min(1).max(100),
  origin: z.enum(['presencial', 'whatsapp', 'web']),
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

export const updateOrderItemsRequestSchema = z.object({
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1)
    .max(50)
    .refine(
      (items) => new Set(items.map((i) => i.menuItemId)).size === items.length,
      { message: 'Itens duplicados não são permitidos' }
    ),
  customerName: z.string().min(1).max(100).optional(),
  origin: z.enum(['presencial', 'whatsapp']).optional(),
});
