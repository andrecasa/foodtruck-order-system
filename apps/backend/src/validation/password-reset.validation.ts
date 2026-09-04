import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string()
    .max(254, 'Formato de e-mail inválido')
    .email('Formato de e-mail inválido'),
});

export const resetPasswordSchema = z.object({
  email: z.string()
    .max(254, 'Formato de e-mail inválido')
    .email('Formato de e-mail inválido'),
  code: z.string()
    .regex(/^\d{6}$/, 'Código inválido'),
  newPassword: z.string()
    .min(8, 'A senha deve ter entre 8 e 72 caracteres')
    .max(72, 'A senha deve ter entre 8 e 72 caracteres'),
});
