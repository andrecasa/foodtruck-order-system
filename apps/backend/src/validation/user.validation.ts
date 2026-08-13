import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'atendente', 'preparador']);

export const createUserSchema = z.object({
  name: z.string()
    .min(1, 'Nome deve ter entre 1 e 100 caracteres')
    .max(100, 'Nome deve ter entre 1 e 100 caracteres')
    .refine(s => s.trim().length > 0, 'Nome deve ter entre 1 e 100 caracteres'),
  email: z.string()
    .max(254, 'Formato de e-mail inválido')
    .email('Formato de e-mail inválido'),
  password: z.string()
    .min(8, 'A senha deve ter entre 8 e 72 caracteres')
    .max(72, 'A senha deve ter entre 8 e 72 caracteres'),
  role: roleSchema,
});

export const updateUserSchema = z.object({
  name: z.string()
    .min(1, 'Nome deve ter entre 1 e 100 caracteres')
    .max(100, 'Nome deve ter entre 1 e 100 caracteres')
    .refine(s => s.trim().length > 0, 'Nome deve ter entre 1 e 100 caracteres')
    .optional(),
  email: z.string()
    .max(254, 'Formato de e-mail inválido')
    .email('Formato de e-mail inválido')
    .optional(),
  role: roleSchema.optional(),
}).refine(data => Object.keys(data).length > 0, 'Pelo menos um campo deve ser informado');

export const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, 'A senha deve ter entre 8 e 72 caracteres')
    .max(72, 'A senha deve ter entre 8 e 72 caracteres'),
});

export const toggleStatusSchema = z.object({
  status: z.enum(['ativo', 'inativo']),
});
