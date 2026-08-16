import { z } from 'zod';
export const createMenuItemRequestSchema = z.object({
    name: z.string().min(1).max(100),
    price: z.number().int().min(1).max(999999),
    category: z.string().min(1),
});
export const updateMenuItemRequestSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    price: z.number().int().min(1).max(999999).optional(),
    category: z.string().min(1).optional(),
});
//# sourceMappingURL=menu.validator.js.map