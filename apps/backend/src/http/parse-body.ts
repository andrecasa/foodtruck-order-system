import type { z, ZodError, ZodTypeAny } from 'zod';
import { ServiceError } from '../services/service-error.js';

/**
 * Valida `req.body` contra um schema Zod, retornando os dados já tipados.
 *
 * Em caso de falha, lança `ServiceError(message, 422, 'VALIDATION_ERROR')` —
 * mapeado centralmente pelo errorHandler. Absorve o boilerplate repetido nos
 * controllers (`safeParse` + `if (!success) throw ...`), SEM apagar as
 * mensagens específicas: quando um controller precisa de mensagens condicionais
 * (ex.: "Preço deve ser maior que zero"), passa um `mapError` que traduz o
 * `ZodError` na mensagem apropriada.
 *
 * Uso simples (mensagem = primeira issue do Zod, ou fallback):
 *   const data = parseBody(createCategoryRequestSchema, req.body);
 *
 * Uso com mensagem customizada:
 *   const data = parseBody(createMenuItemRequestSchema, req.body, (err) => {
 *     const first = err.issues[0];
 *     if (first?.path.includes('price') && first.code === 'too_small') {
 *       return 'Preço deve ser maior que zero';
 *     }
 *     return first?.message ?? 'Dados inválidos';
 *   });
 */
export function parseBody<Schema extends ZodTypeAny>(
  schema: Schema,
  body: unknown,
  mapError?: (error: ZodError) => string,
): z.infer<Schema> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = mapError
      ? mapError(parsed.error)
      : parsed.error.issues[0]?.message ?? 'Dados inválidos';
    throw new ServiceError(message, 422, 'VALIDATION_ERROR');
  }
  return parsed.data;
}
