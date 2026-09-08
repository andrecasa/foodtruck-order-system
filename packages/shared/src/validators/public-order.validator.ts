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
    // Coordenadas opcionais capturadas no PWA/app ao confirmar o pedido. O
    // schema é `.strict()`, então precisam ser declaradas aqui; podem faltar
    // quando o cliente nega a permissão de localização.
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict();
