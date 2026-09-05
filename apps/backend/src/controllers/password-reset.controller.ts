/**
 * password-reset.controller — traduz HTTP ↔ serviço para o fluxo público
 * "Esqueceu sua senha?" (forgot-password).
 *
 * Responsabilidades (design.md — "Backend — Controller" e "Error Handling"):
 * - `forgotPassword`: valida o corpo com `forgotPasswordSchema`; se inválido,
 *   responde 400 `VALIDATION_ERROR` (pt-BR). Caso válido, chama `requestCode`
 *   dentro de um try/catch amplo e SEMPRE responde 200 com a `NEUTRAL_MESSAGE`,
 *   mesmo em erro interno, para preservar a neutralidade (não enumeração de
 *   contas — R2.2, R9.3, R9.5).
 * - `resetPassword`: valida o corpo com `resetPasswordSchema` (lança
 *   `ServiceError` 400 `VALIDATION_ERROR` em falha); chama `confirmReset`; em
 *   sucesso responde 200 com a mensagem de conclusão. Recusas de negócio
 *   chegam como `ServiceError` e são mapeadas pelo errorHandler central
 *   (R5.7, R5.8, R6.1, R6.2, R6.3, R8.4).
 *
 * Erros são mapeados centralmente pelo errorHandler (src/http/error-handler.js)
 * para `{ statusCode, error, message }`. EXCEÇÃO: `forgotPassword` mantém um
 * try/catch próprio porque sua resposta é sempre neutra (200) — o erro NÃO pode
 * propagar ao middleware. As rotas envolvem estes handlers em asyncHandler.
 */

import { Request, Response } from 'express';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validation/password-reset.validation.js';
import * as passwordResetService from '../services/password-reset.service.js';
import { logError } from '../http/log-error.js';

/**
 * Mensagem_Neutra: confirma o envio de instruções sem revelar se o e-mail está
 * cadastrado. É a resposta padrão de `forgotPassword` para qualquer resultado
 * de negócio (usuário ativo, inativo, inexistente, rate limit ou falha de
 * e-mail), garantindo a não enumeração de contas.
 */
export const NEUTRAL_MESSAGE =
  'Se o e-mail estiver cadastrado, enviamos instruções para redefinir a senha.';

/** Mensagem de sucesso da redefinição de senha. */
const RESET_SUCCESS_MESSAGE = 'Senha redefinida com sucesso.';

/**
 * POST /api/auth/forgot-password
 *
 * Solicita o envio de um código de verificação. A única resposta com status
 * diferente de 200 é a de validação de formato do e-mail (400
 * `VALIDATION_ERROR`). Todo o restante — inclusive erros internos — resulta em
 * 200 com a `NEUTRAL_MESSAGE`, preservando a neutralidade da resposta.
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  // Validação inline (não usa parseBody): este fluxo usa status 400 para erro
  // de formato — parseBody é padronizado em 422, então mantemos o mapeamento
  // local para preservar o contrato (400 VALIDATION_ERROR).
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Formato de e-mail inválido';
    throw new passwordResetService.ServiceError(message, 400, 'VALIDATION_ERROR');
  }

  // Neutralidade: nenhum resultado de negócio (usuário inexistente/inativo,
  // falha de e-mail, erro interno) altera a resposta. Sempre 200 + NEUTRAL_MESSAGE.
  // Por isso este catch NÃO propaga o erro ao errorHandler — a resposta neutra
  // é parte do contrato (R9.3/R9.5) e não deve virar um status de erro.
  try {
    await passwordResetService.requestCode(parsed.data.email);
  } catch (err) {
    // Não propaga: registra internamente para diagnóstico e mantém a resposta
    // neutra (R9.3/R9.5).
    logError('password-reset:request-code', err, req);
  }

  res.status(200).json({ message: NEUTRAL_MESSAGE });
}

/**
 * POST /api/auth/reset-password
 *
 * Valida o código de verificação e define a nova senha. Erros de validação de
 * formato retornam 400 `VALIDATION_ERROR`; recusas de negócio chegam como
 * `ServiceError` e são mapeadas para o `statusCode`/`code`/`message` da própria
 * exceção. Em sucesso, responde 200 com a mensagem de conclusão.
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const parsed = resetPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Dados inválidos';
    throw new passwordResetService.ServiceError(message, 400, 'VALIDATION_ERROR');
  }

  // Recusas de negócio chegam como ServiceError e são mapeadas centralmente
  // pelo errorHandler. Erros inesperados também — viram 500 INTERNAL_ERROR.
  await passwordResetService.confirmReset(parsed.data);
  res.status(200).json({ message: RESET_SUCCESS_MESSAGE });
}
