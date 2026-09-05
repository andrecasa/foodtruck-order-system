/**
 * password-reset.service — regras de negócio do fluxo público "Esqueceu sua
 * senha?" (forgot-password).
 *
 * Responsabilidades desta etapa (design.md — "Backend — Service"):
 * - `ServiceError(message, statusCode, code)` com mensagens em pt-BR.
 * - `generateCode()`: gera código de 6 dígitos via CSPRNG (`crypto.randomInt`),
 *   com zeros à esquerda (R3.1).
 * - `hashCode(code)`: hash sha256 (hex) para armazenamento; nunca texto puro (R3.4).
 * - `requestCode(email)`: valida formato (Zod) → busca usuários → para cada
 *   usuário `ativo`, invalida códigos anteriores, gera+hasheia+persiste e dispara
 *   o envio assíncrono do e-mail; retorna sempre `void`. Só lança `ServiceError`
 *   para e-mail em formato inválido. O `onAllAttemptsFailed` do envio invalida o
 *   código gerado via `invalidateCode` (R2.7 / R9.3).
 *
 * As dependências (repositório e serviço de e-mail) são injetáveis para permitir
 * os testes de propriedade das tasks 5.2–5.4, que fornecem mocks.
 */

import { randomInt, createHash } from 'node:crypto';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validation/password-reset.validation.js';
import {
  passwordResetRepository,
  type PasswordResetRepository,
} from '../db/password-reset-repository.js';
import { emailService, type EmailService } from './email/email.service.js';
import { supabaseAdmin } from '../config/supabase.js';

// --- Error classes ---

import { ServiceError } from './service-error.js';
export { ServiceError };

// --- Constants ---

/** Número de dígitos do código de verificação (R3.1). */
const CODE_DIGITS = 6;

/** Limite exclusivo superior do sorteio: gera valores em [0, 1_000_000). */
const CODE_UPPER_BOUND = 1_000_000;

/** Prazo de validade do código, em minutos, a partir da geração (R3.3). */
export const CODE_TTL_MINUTES = 15;

/** Prazo de validade do código, em milissegundos. */
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1_000;

// --- Dependências injetáveis ---

export interface RequestCodeDeps {
  repository: PasswordResetRepository;
  email: EmailService;
}

const defaultDeps: RequestCodeDeps = {
  repository: passwordResetRepository,
  email: emailService,
};

/**
 * Contrato mínimo do cliente Supabase admin usado por `confirmReset`. Espelha o
 * padrão de `user.service.resetPassword`: `updateUserById` retorna `{ error }`
 * (não lança) e `signOut('global')` invalida todas as sessões do usuário.
 * Tipado estruturalmente para permitir mocks nos testes de propriedade (5.6–5.9).
 */
export interface SupabaseAdminLike {
  auth: {
    admin: {
      updateUserById(
        id: string,
        attributes: { password: string },
      ): Promise<{ error: unknown | null }>;
      signOut(id: string, scope: 'global'): Promise<unknown>;
    };
  };
}

export interface ConfirmResetDeps {
  repository: PasswordResetRepository;
  supabaseAdmin: SupabaseAdminLike;
}

const defaultConfirmDeps: ConfirmResetDeps = {
  repository: passwordResetRepository,
  supabaseAdmin: supabaseAdmin as unknown as SupabaseAdminLike,
};

/** Mensagem genérica de recusa de código (não revela o estado exato) — R6. */
const INVALID_CODE_MESSAGE = 'Código inválido ou expirado';

// --- Code generation ---

/**
 * Gera um `Codigo_Verificacao` de exatamente 6 dígitos numéricos, com zeros à
 * esquerda quando aplicável, usando uma fonte criptograficamente segura (R3.1).
 */
export function generateCode(): string {
  return String(randomInt(0, CODE_UPPER_BOUND)).padStart(CODE_DIGITS, '0');
}

/**
 * Hash do código para armazenamento (sha256 hex). O código nunca é persistido
 * em texto puro (R3.4).
 */
export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// --- Request flow ---

/**
 * Fluxo de solicitação de código.
 *
 * NUNCA lança por ausência/inatividade de usuário, falha de e-mail ou rate
 * limit — o controller sempre responde com a `Mensagem_Neutra`. Lança
 * `ServiceError` apenas quando o e-mail está em formato inválido (validação Zod).
 *
 * Para cada usuário `ativo` encontrado (qualquer tenant): invalida os códigos
 * anteriores ainda válidos, gera+hasheia+persiste um novo código com validade de
 * 15 minutos e dispara o envio assíncrono. Usuários `inativo` são ignorados
 * silenciosamente (R2.6). Retorna sempre `void`.
 *
 * Requirements: 2.2, 2.4, 2.5, 2.6, 2.7, 3.1, 3.3, 3.4, 3.5, 9.4
 */
export async function requestCode(
  email: string,
  deps: RequestCodeDeps = defaultDeps,
): Promise<void> {
  // Validação de formato: único caminho que lança para o chamador (R2.3).
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Formato de e-mail inválido';
    throw new ServiceError(message, 400, 'VALIDATION_ERROR');
  }

  const normalizedEmail = parsed.data.email;
  const { repository, email: emailSvc } = deps;

  const users = await repository.findUsersByEmail(normalizedEmail);

  for (const user of users) {
    // Somente usuários ativos geram código; inativos são ignorados (R2.5/R2.6).
    if (user.status !== 'ativo') {
      continue;
    }

    // Um novo código invalida os anteriores ainda válidos do mesmo usuário (R3.5).
    await repository.invalidateActiveCodes(user.id, user.tenant_id);

    // Gera, hasheia e persiste com validade de 15 minutos (R2.4/R3.1/R3.3/R3.4).
    const code = generateCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    const inserted = await repository.insertCode({
      userId: user.id,
      tenantId: user.tenant_id,
      codeHash,
      expiresAt,
    });

    // Envio assíncrono (fire-and-forget). Em falha total, o serviço de e-mail
    // chama `onAllAttemptsFailed`, que invalida o código gerado (R2.7/R9.3).
    emailSvc.sendVerificationCode({
      to: user.email,
      code,
      onAllAttemptsFailed: () => repository.invalidateCode(inserted.id),
    });
  }
}

// --- Reset flow ---

/**
 * Fluxo de validação e redefinição de senha (design.md — "Fluxo 2").
 *
 * Passos:
 * 1. Valida o schema (e-mail, código de 6 dígitos, senha 8–72). Falha → lança
 *    `ServiceError 400 VALIDATION_ERROR` com mensagem pt-BR (R7.1–R7.3).
 * 2. Localiza o código candidato por e-mail (`findActiveCodeForEmail`, que já
 *    faz JOIN em `users` por `(user_id, tenant_id)` — logo a linha retornada é
 *    coerente com o tenant do usuário resolvido pelo e-mail, R8.1/R8.5).
 * 3. Confere `hashCode(code) === row.code_hash`. Em falha (código ausente,
 *    expirado, usado, com limite de tentativas ou não correspondente), registra
 *    a tentativa incorreta (`registerFailedAttempt`, que invalida ao atingir 5)
 *    e recusa com `ServiceError 400 INVALID_CODE` (R5.7/R6.1–R6.4/R8.4).
 * 4. Em sucesso: atualiza a senha via `supabaseAdmin.auth.admin.updateUserById`.
 *    Se o Supabase falhar, lança `ServiceError 500` SEM marcar o código como
 *    usado (R5.8). Só após o sucesso, marca o código como usado (`markUsed`,
 *    R5.3) e invalida todas as sessões (`signOut('global')`, R5.4).
 *
 * As dependências (repositório e cliente Supabase admin) são injetáveis para os
 * testes de propriedade (5.6–5.9), que fornecem mocks.
 *
 * Requirements: 5.2, 5.3, 5.4, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 8.1, 8.2, 8.4
 */
export async function confirmReset(
  input: { email: string; code: string; newPassword: string },
  deps: ConfirmResetDeps = defaultConfirmDeps,
): Promise<void> {
  // 1. Validação de schema (formato de e-mail, código 6 dígitos, senha 8–72).
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Dados inválidos';
    throw new ServiceError(message, 400, 'VALIDATION_ERROR');
  }

  const { email, code, newPassword } = parsed.data;
  const { repository, supabaseAdmin: sb } = deps;

  // 2. Localiza o código candidato ativo por e-mail (tenant já coerente via JOIN).
  const row = await repository.findActiveCodeForEmail(email);

  // 3. Sem candidato ativo (inexistente/expirado/usado/limite) ou hash divergente:
  //    registra a tentativa incorreta e recusa com mensagem genérica pt-BR.
  if (!row || hashCode(code) !== row.code_hash) {
    if (row) {
      await repository.registerFailedAttempt(row.id);
    }
    throw new ServiceError(INVALID_CODE_MESSAGE, 400, 'INVALID_CODE');
  }

  // 4. Código válido: atualiza a senha exclusivamente do usuário associado (R8.2).
  const { error: authError } = await sb.auth.admin.updateUserById(row.user_id, {
    password: newPassword,
  });

  // Falha do Supabase: erro pt-BR e o código NÃO é marcado como usado (R5.8).
  if (authError) {
    throw new ServiceError('Erro ao redefinir senha', 500, 'INTERNAL_ERROR');
  }

  // Só após o sucesso: marca o código como usado (R5.3) e invalida sessões (R5.4).
  await repository.markUsed(row.id);
  await sb.auth.admin.signOut(row.user_id, 'global');
}
