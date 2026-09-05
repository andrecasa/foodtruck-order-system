import type { Request, Response } from 'express';
import { errorHandler } from '../../http/error-handler.js';

/**
 * Invoca um handler de controller como a stack do Express faria em produção:
 * chama o handler e, se ele lançar/rejeitar, encaminha o erro ao
 * `errorHandler` (o mesmo middleware registrado no `index.ts`), que escreve o
 * envelope de erro no `res`.
 *
 * Depois da migração para o error-handling middleware (Opção B), os controllers
 * do Grupo A não respondem mais diretamente nos caminhos de erro — eles lançam
 * `ServiceError`. Este helper permite que os testes existentes continuem
 * afirmando `res.statusCode` / `res.body` exatamente como o cliente HTTP os
 * receberia, sem duplicar a lógica de mapeamento em cada teste.
 *
 * Uso:
 *   await invokeHandler(createCategory, req, res);
 *   expect(res.statusCode).toBe(422);
 */
export async function invokeHandler(
  handler: (req: never, res: never) => unknown,
  req: unknown,
  res: unknown,
): Promise<void> {
  try {
    await handler(req as never, res as never);
  } catch (err) {
    errorHandler(err, req as Request, res as Response, () => undefined);
  }
}
