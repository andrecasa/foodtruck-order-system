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
 * - `resetPassword`: valida o corpo com `resetPasswordSchema` (400
 *   `VALIDATION_ERROR` em falha); chama `confirmReset`; em sucesso responde 200
 *   com a mensagem de conclusão; `ServiceError` é mapeado para
 *   `{ statusCode, error, message }` (R5.7, R5.8, R6.1, R6.2, R6.3, R8.4).
 *
 * O formato de resposta de erro (`{ statusCode, error, message }`) segue a
 * convenção dos demais controllers (ex.: `auth.controller`, `user.controller`).
 */

import { Request, Response } from 'express';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validation/password-reset.validation.js';
import * as passwordResetService from '../services/password-reset.service.js';

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
  const parsed = forgotPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Formato de e-mail inválido';
    res.status(400).json({
      statusCode: 400,
      error: 'VALIDATION_ERROR',
      message,
    });
    return;
  }

  // Neutralidade: nenhum resultado de negócio (usuário inexistente/inativo,
  // falha de e-mail, erro interno) altera a resposta. Sempre 200 + NEUTRAL_MESSAGE.
  try {
    await passwordResetService.requestCode(parsed.data.email);
  } catch (err) {
    // Não propaga: registra internamente para diagnóstico e mantém a resposta
    // neutra (R9.3/R9.5).
    console.error('[password-reset-controller] requestCode falhou', err);
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
    res.status(400).json({
      statusCode: 400,
      error: 'VALIDATION_ERROR',
      message,
    });
    return;
  }

  try {
    await passwordResetService.confirmReset(parsed.data);
    res.status(200).json({ message: RESET_SUCCESS_MESSAGE });
  } catch (err) {
    if (err instanceof passwordResetService.ServiceError) {
      res.status(err.statusCode).json({
        statusCode: err.statusCode,
        error: err.code,
        message: err.message,
      });
      return;
    }
    console.error('[password-reset-controller] resetPassword falhou', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao redefinir senha',
    });
  }
}
