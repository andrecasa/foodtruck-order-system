import type { Response } from 'express';

/**
 * Envelope de erro padrão da API: `{ statusCode, error, message }`.
 *
 * - `statusCode`: o status HTTP (também usado no `res.status`).
 * - `error`: código estável do erro (ex.: 'ORDER_NOT_FOUND'). É o contrato que
 *   o cliente pode inspecionar; para as rotas públicas, é o código PÚBLICO
 *   (traduzido a partir do código interno do service quando necessário).
 * - `message`: mensagem legível em pt-BR.
 */
export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
}

/**
 * Escreve o envelope de erro padrão no `res`. Único lugar que monta o JSON de
 * erro, garantindo formato consistente em todos os controllers.
 *
 * Uso:
 *   sendError(res, 404, 'ORDER_NOT_FOUND', 'Pedido não encontrado.');
 */
export function sendError(
  res: Response,
  statusCode: number,
  error: string,
  message: string,
): void {
  const body: ErrorResponse = { statusCode, error, message };
  res.status(statusCode).json(body);
}
