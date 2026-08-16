import { z } from 'zod';

export const createCategoryRequestSchema = z.object({
  name: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome deve ter entre 1 e 100 caracteres')
    .transform((s) => s.trim())
    .refine((s) => s.length >= 1, 'Nome deve ter entre 1 e 100 caracteres'),
});

export const updateCategoryRequestSchema = z.object({
  name: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome deve ter entre 1 e 100 caracteres')
    .transform((s) => s.trim())
    .refine((s) => s.length >= 1, 'Nome deve ter entre 1 e 100 caracteres'),
});

export const reorderCategoriesRequestSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1, 'Lista de categorias não pode estar vazia'),
});
