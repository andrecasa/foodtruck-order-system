import type { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../services/service-error.js';
import { sendError } from './send-error.js';
import { logError } from './log-error.js';

/**
 * Middleware de tratamento de erro (assinatura de 4 argumentos do Express).
 * Deve ser registrado por ÚLTIMO, depois de todas as rotas.
 *
 * Mapeia:
 *   - `ServiceError`  → `{ statusCode, error: code, message }` com o status do erro.
 *   - qualquer outro  → `500 { statusCode: 500, error: 'INTERNAL_ERROR', message }`.
 *
 * O envelope é idêntico ao que os controllers produziam inline via
 * `handleServiceError`, preservando o contrato de resposta. Erros inesperados
 * são logados (como os `console.error` que existiam nos catches) e nunca vazam
 * detalhes internos ao cliente.
 *
 * A assinatura precisa dos 4 parâmetros (incluindo `next`) para o Express
 * reconhecer isto como error handler, mesmo que `next` não seja usado.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Se a resposta já começou a ser enviada, delega ao handler padrão do Express.
  if (res.headersSent) {
    return;
  }

  if (err instanceof ServiceError) {
    sendError(res, err.statusCode, err.code, err.message);
    return;
  }

  // Erro inesperado: loga com contexto da request (método + rota) e responde
  // 500 genérico, sem vazar detalhes internos ao cliente.
  logError('error-handler', err, req);
  sendError(res, 500, 'INTERNAL_ERROR', 'Erro ao processar requisição');
}
